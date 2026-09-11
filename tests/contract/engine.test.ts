import { it, expect } from "vitest";
import { createAgentEngine, AgentEngineError } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
  FakeClock,
} from "@agent-runtime/testing";
import type { EngineOptions } from "@agent-runtime/sdk";
const modelConfig = {
  models: {
    primary: {
      provider: "scripted",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "key" },
      model: "fake",
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "primary" },
};
const tool = {
  name: "order.read",
  description: "Read order",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { status: { type: "string" } },
    required: ["status"],
  },
  execution: { type: "binding", bindingKey: "read.v1", sideEffect: "read" },
};
function options(
  model: ReturnType<typeof scriptedModel>,
  extra: Partial<EngineOptions> = {},
): EngineOptions {
  return {
    store: new MemoryStore(),
    principal: { tenantId: "tenant", subjectId: "user" },
    secrets: { resolve: async () => "test-secret-not-real" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
    clock: new FakeClock(),
    ...extra,
  };
}
it("creates without side effects, runs and reuses persistent Session history", async () => {
  const model = scriptedModel([
    ...finalText("one").map((x) => [x]),
    finalText("two"),
  ]);
  const engine = await createAgentEngine(options(model));
  const s = await engine.createSession({
    config: modelConfig,
    requestId: "create",
  });
  expect(model.requests).toHaveLength(0);
  expect(
    (await engine.createSession({ config: modelConfig, requestId: "create" }))
      .id,
  ).toBe(s.id);
  const first = await s.run({ input: "hello", requestId: "r1" });
  expect(first.outputText).toBe("one");
  expect((await s.run({ input: "hello", requestId: "r1" })).runId).toBe(
    first.runId,
  );
  expect(model.requests).toHaveLength(1);
  const loaded = await engine.loadSession(s.id);
  expect((await loaded.run({ input: "continue" })).outputText).toBe("two");
  expect(model.requests[1]!.messages.some((m) => m.content === "one")).toBe(
    true,
  );
  await engine.close();
});
it("repairs invalid tool arguments before invocation and final JSON without exposing tools", async () => {
  let calls = 0;
  const model = scriptedModel([
    toolCall("order.read", { id: 1 }),
    toolCall("order.read", { id: "1" }),
    finalText('{"wrong":true}'),
    finalText('{"ok":true}'),
  ]);
  const engine = await createAgentEngine(
    options(model, {
      bindings: {
        "read.v1": {
          version: "1",
          sideEffect: "read",
          execute: async () => {
            calls++;
            return { status: "sent" };
          },
        },
      },
    }),
  );
  const s = await engine.createSession({
    config: { ...modelConfig, tools: [tool] },
  });
  const result = await s.run({
    input: "order",
    output: {
      mode: "prompt-json",
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  });
  expect(result.output).toEqual({ ok: true });
  expect(calls).toBe(1);
  expect(model.requests.at(-1)!.tools).toEqual([]);
  expect((await engine.usage.getRun(result.runId)).attemptCount).toBe(4);
  await engine.close();
});
it("retries frozen input and discards failed drafts, retaining unknown usage", async () => {
  const model = scriptedModel([
    [
      { type: "delta", kind: "text", blockId: "b", text: "bad draft" },
      {
        type: "failed",
        error: new AgentEngineError("MODEL_TIMEOUT", "timeout", true, "safe"),
      },
    ],
    finalText("good"),
  ]);
  const engine = await createAgentEngine(options(model));
  const s = await engine.createSession({ config: modelConfig });
  const result = await s.run({ input: "hello" });
  expect(model.requests[0]).toEqual(model.requests[1]);
  const events = (await s.listEvents()).events;
  expect(
    events.filter((e) => e.type === "content.message.discarded"),
  ).toHaveLength(1);
  expect(
    events.filter((e) => e.type === "content.message.committed"),
  ).toHaveLength(1);
  expect((await engine.usage.getRun(result.runId)).complete).toBe(false);
  await engine.close();
});
it("pauses explicit question and rejects a malformed answer without settling it", async () => {
  const model = scriptedModel([
    toolCall("engine.question", { question: "Which?" }),
    finalText("done"),
  ]);
  const engine = await createAgentEngine(options(model));
  const s = await engine.createSession({
    config: {
      ...modelConfig,
      interaction: {
        questions: {
          enabled: true,
          answerSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          timeoutMs: 1000,
        },
      },
    },
  });
  const handle = await s.startRun({ input: "ask" });
  let pending;
  for (let n = 0; n < 100; n++) {
    pending = (await s.getRun(handle.runId)).pending;
    if (pending) break;
    await new Promise((r) => setTimeout(r, 1));
  }
  expect(pending).toBeDefined();
  await expect(
    s.resolveInput(pending!.id, { kind: "question", answer: 42 }),
  ).rejects.toThrow();
  await s.resolveInput(pending!.id, {
    kind: "question",
    answer: { text: "A" },
  });
  expect((await handle.result).outputText).toBe("done");
  await engine.close();
});
it("rejects a Skill and business call mixed batch before either takes effect", async () => {
  let calls = 0;
  const batch = toolCall("engine.skill.select", { id: "s" })[0]!;
  if (batch.type !== "completed") throw Error();
  batch.response.blocks.push({
    type: "tool_call",
    id: "b",
    name: "order.read",
    arguments: { id: "1" },
  });
  const model = scriptedModel([[batch], finalText("no calls")]);
  const engine = await createAgentEngine(
    options(model, {
      bindings: {
        "read.v1": {
          version: "1",
          sideEffect: "read",
          execute: async () => {
            calls++;
            return { status: "ok" };
          },
        },
      },
    }),
  );
  const s = await engine.createSession({
    config: {
      ...modelConfig,
      tools: [tool],
      skills: [
        {
          id: "s",
          name: "Skill",
          description: "D",
          instructions: "I",
          allowedTools: ["order.read"],
        },
      ],
    },
  });
  await s.run({ input: "go" });
  expect(calls).toBe(0);
  expect(
    model.requests[1]!.messages.some(
      (m) => m.role === "system" && m.content === "I",
    ),
  ).toBe(false);
  await engine.close();
});
export { modelConfig, tool, options };
