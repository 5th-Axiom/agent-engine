import { createAgentEngine, AgentEngineError } from "@agent-runtime/sdk";
import { MemoryStore } from "@agent-runtime/testing";
import {
  loadLocalModel,
  LocalModelConfigError,
} from "./lib/local-model-config.js";

// Explicit provider smoke with only synthetic inputs and local read-only tools.
// Never print requests, credentials, native thinking/signatures or provider bodies.
let engine: Awaited<ReturnType<typeof createAgentEngine>> | undefined;
try {
  const local = await loadLocalModel(process.argv[2]);
  if (local.model.provider !== "anthropic-compatible")
    throw new AgentEngineError("MODEL_CAPABILITY_MISMATCH");
  const origin = new URL(local.model.baseURL).origin;
  let executions = 0;
  const names = ["demo.alpha", "demo.beta"];
  engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "synthetic-smoke", subjectId: "anthropic-tools" },
    secrets: local.secrets,
    protocolKey: local.protocolKey,
    policy: {
      allowedOrigins: [origin],
      allowPrivateOrigins: local.allowPrivateNetwork ? [origin] : [],
    },
    bindings: Object.fromEntries(
      names.map((name, i) => [
        name,
        {
          version: "1",
          sideEffect: "read" as const,
          execute: async () => {
            executions++;
            return { value: i + 2 };
          },
        },
      ]),
    ),
  });
  const session = await engine.createSession({
    config: {
      models: { primary: local.model },
      routing: { primary: "primary" },
      retry: { model: { maxRetries: 0 } },
      loop: {
        maxSteps: 4,
        maxModelAttempts: 4,
        maxCapabilityInvocations: 4,
        timeoutMs: 90000,
      },
      tools: names.map((name) => ({
        name,
        description: "Read one synthetic number. No side effects.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        outputSchema: { type: "object" },
        execution: {
          type: "binding" as const,
          bindingKey: name,
          sideEffect: "read" as const,
        },
      })),
    },
  });
  const first = await session.run({
    input:
      "Call demo.alpha and demo.beta together in the same assistant response (two tool calls), then add their returned values. Reply with the sum as an Arabic digit only.",
  });
  const run = await engine.readRun(session.id, first.runId);
  const batch = run.steps.some(
    (step) =>
      step.response?.blocks.filter((b) => b.type === "tool_call").length === 2,
  );
  if (!batch || !first.outputText.includes("5") || executions !== 2)
    throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
  const second = await session.run({
    input:
      "Add 1 to the sum from your previous answer. Do not call tools. Reply with the Arabic digit only.",
  });
  if (!second.outputText.includes("6") || executions !== 2)
    throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
  console.log(
    JSON.stringify({
      passed: true,
      realProvider: true,
      runs: 2,
      toolsInOneResponse: 2,
      executions,
      nativeContinuation: true,
      followup: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      passed: false,
      code:
        error instanceof AgentEngineError ||
        error instanceof LocalModelConfigError
          ? error.code
          : "SMOKE_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await engine?.close();
}
