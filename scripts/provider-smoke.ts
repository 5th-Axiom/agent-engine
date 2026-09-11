import {
  createAgentEngine,
  PostgresStore,
  AgentEngineError,
} from "@agent-runtime/sdk";
import { randomUUID } from "node:crypto";
import {
  loadLocalModel,
  LocalModelConfigError,
} from "./lib/local-model-config.js";
// Only explicitly authorized local credentials and synthetic prompts. Never print Provider bodies.
let local: Awaited<ReturnType<typeof loadLocalModel>>;
try {
  local = await loadLocalModel(process.argv[2]);
} catch (error) {
  console.error(
    JSON.stringify({
      completed: false,
      stage: "configuration",
      code:
        error instanceof LocalModelConfigError
          ? error.code
          : "LOCAL_CONFIG_UNAVAILABLE",
    }),
  );
  process.exit(2);
}
let store: PostgresStore | undefined;
let engine: Awaited<ReturnType<typeof createAgentEngine>> | undefined;
const completed: string[] = [];
let stage = "initialization";
try {
  store = PostgresStore.fromConnectionString(
    process.env.AGENT_TEST_DATABASE_URL ??
      "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
  );
  await store.migrate();
  let echoes = 0;
  engine = await createAgentEngine({
    store,
    principal: { tenantId: randomUUID(), subjectId: "provider-smoke" },
    secrets: local.secrets,
    protocolKey: local.protocolKey,
    bindings: {
      echo: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          echoes++;
          return { value: "READY" };
        },
      },
    },
    policy: {
      allowedOrigins: [new URL(local.model.baseURL).origin],
      allowedModelTargets: [
        {
          provider: local.model.provider,
          origin: new URL(local.model.baseURL).origin,
          credentialScopes: [local.model.apiKey.secretRef],
        },
      ],
      allowPrivateOrigins: local.allowPrivateNetwork
        ? [new URL(local.model.baseURL).origin]
        : [],
    },
  });
  stage = "basic";
  const model = local.model;
  const base = {
    models: { primary: model },
    routing: { primary: "primary" },
    retry: { model: { maxRetries: 0 } },
    loop: {
      maxSteps: 3,
      maxModelAttempts: 3,
      maxCapabilityInvocations: 2,
      timeoutMs: 60000,
    },
  };
  const basic = await engine.createSession({ config: base });
  const result = await basic.run({
    input: "Reply with exactly the word READY.",
  });
  if (
    !result.outputText.trim() ||
    !(await engine.usage.getRun(result.runId)).complete
  )
    throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
  completed.push(stage);
  console.log(
    JSON.stringify({ profile: local.profileName, stage, completed: true }),
  );
  stage = "tool";
  const session = await engine.createSession({
    config: {
      ...base,
      instructions: {
        text: "Call the declared smoke.echo tool exactly once, then answer with its value.",
      },
      tools: [
        {
          name: "smoke.echo",
          description: "Read the synthetic smoke value",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          outputSchema: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
          execution: {
            type: "binding",
            bindingKey: "echo",
            sideEffect: "read",
          },
        },
      ],
    },
  });
  const toolResult = await session.run({
    input: "Use smoke.echo and report its result.",
  });
  if (
    echoes !== 1 ||
    !toolResult.outputText.includes("READY") ||
    !(await engine.usage.getRun(toolResult.runId)).complete
  )
    throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
  completed.push(stage);
  console.log(
    JSON.stringify({ profile: local.profileName, stage, completed: true }),
  );
  if (model.thinking?.enabled) {
    stage = "thinking";
    const thinking = await engine.createSession({
      config: {
        ...base,
        models: {
          primary: {
            ...model,
            thinking: { ...model.thinking, expose: "none" },
            limits: {
              ...model.limits,
              maxOutputTokens: Math.max(
                2048,
                (model.thinking.budgetTokens ?? 1024) + 1024,
              ),
            },
          },
        },
      },
    });
    const assertNativeThinking = async (sessionId: string, runId: string) => {
      const run = await engine!.readRun(sessionId, runId);
      const responses = run.steps.flatMap((step) =>
        step.response ? [step.response] : [],
      );
      const observed = responses.some((response) =>
        response.blocks.some((block) => block.type === "thinking"),
      );
      const protectedPayloads = responses.every((response) => {
        const native = response.native;
        return (
          native &&
          typeof native === "object" &&
          !Array.isArray(native) &&
          native.version === 1 &&
          typeof native.encrypted === "string" &&
          typeof native.tag === "string" &&
          !("content" in native)
        );
      });
      const events = (await (await engine!.loadSession(sessionId)).listEvents())
        .events;
      if (
        !observed ||
        !protectedPayloads ||
        events.some((event) => event.type === "content.thinking.delta")
      )
        throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
    };
    // The tool stage uses the same enabled model: verify actual Thinking and the
    // protected native continuation through the tool result as well as two turns.
    await assertNativeThinking(session.id, toolResult.runId);
    const a = await thinking.run({
      input: "Compute 17 times 19 and give only the integer.",
    });
    const b = await thinking.run({
      input: "Add one to the previous result and give only the integer.",
    });
    if (
      !a.outputText.trim() ||
      !b.outputText.trim() ||
      !(await engine.usage.getRun(a.runId)).complete ||
      !(await engine.usage.getRun(b.runId)).complete
    )
      throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
    await assertNativeThinking(thinking.id, a.runId);
    await assertNativeThinking(thinking.id, b.runId);
    completed.push(stage);
    console.log(
      JSON.stringify({ profile: local.profileName, stage, completed: true }),
    );
  }
  console.log(
    JSON.stringify({
      profile: local.profileName,
      protocol: model.provider,
      completed: true,
      verifiedStages: completed,
      thinking: model.thinking?.enabled ? "verified" : "not_configured",
      usageComplete: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      completed: false,
      stage,
      verifiedStages: completed,
      code: error instanceof AgentEngineError ? error.code : "UNKNOWN",
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await (engine ?? store)?.close();
  } catch {
    console.error(
      JSON.stringify({
        completed: false,
        stage: "cleanup",
        code: "SMOKE_CLEANUP_FAILED",
      }),
    );
    process.exitCode = 1;
  }
}
