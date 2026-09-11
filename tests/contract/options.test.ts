import { it, expect } from "vitest";
import { createAgentEngine, type EngineOptions } from "@agent-runtime/sdk";
import {
  MemoryStore,
  createEngineTestHarness,
  scriptedModel,
  toolCall,
  finalText,
  fakeTool,
} from "@agent-runtime/testing";
it("rejects unknown host options and zero concurrency before acquiring the Store", async () => {
  const store = new MemoryStore();
  let acquisitions = 0;
  store.acquire = async () => {
    acquisitions++;
  };
  const common = {
    store,
    principal: { tenantId: "t", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
  };
  await expect(
    createAgentEngine({
      ...common,
      defaultTools: [],
    } as unknown as EngineOptions),
  ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  await expect(
    createAgentEngine({ ...common, limits: { maxConcurrentModelRequests: 0 } }),
  ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  expect(acquisitions).toBe(0);
});
it("Testing harness records calls while undeclared bindings remain invisible", async () => {
  const model = scriptedModel([toolCall("order.read", {}), finalText("done")]);
  const harness = await createEngineTestHarness({
    model,
    bindings: {
      read: fakeTool({ ok: true }),
      hidden: fakeTool({ private: true }),
    },
  });
  try {
    const session = await harness.engine.createSession({
      config: {
        ...harness.modelConfig,
        tools: [
          {
            name: "order.read",
            description: "Read synthetic order",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            execution: {
              type: "binding",
              bindingKey: "read",
              sideEffect: "read",
            },
          },
        ],
      },
    });
    await session.run({ input: "go" });
    expect(harness.calls.forBinding("read")).toEqual([{}]);
    expect(harness.calls.forBinding("hidden")).toEqual([]);
    expect(model.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      "order.read",
    ]);
  } finally {
    await harness.close();
  }
});

it("effective config reports declared, default and frozen override sources", async () => {
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "sources", subjectId: "user" },
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { scripted: scriptedModel([finalText("done")]) } },
    defaults: { loop: { maxSteps: 8 } },
    policy: {
      allowedOrigins: ["https://model.example.com"],
      ceilings: { loop: { maxSteps: 10 } },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        models: {
          p: {
            provider: "scripted",
            model: "fake",
            baseURL: "https://model.example.com",
            apiKey: { secretRef: "test" },
            limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
          },
        },
        routing: { primary: "p" },
        loop: { maxModelAttempts: 5 },
      },
    });
    const preview = await session.getEffectiveConfig();
    expect(preview.sources?.["/loop/maxSteps"]).toBe("engine-default");
    expect(preview.sources?.["/loop/maxModelAttempts"]).toBe("session");
    expect(preview.sources?.["/loop/timeoutMs"]).toBe("library-default");
    const result = await session.run({
      input: "go",
      overrides: { loop: { maxSteps: 3 } },
    });
    const frozen = await session.getEffectiveConfig({ runId: result.runId });
    expect(frozen.sources?.["/loop/maxSteps"]).toBe("run-override");
    expect(frozen.value.loop?.maxSteps).toBe(3);
    expect(frozen.defaultsVersion).toBe(preview.defaultsVersion);
    expect(frozen.policyVersion).toBe(preview.policyVersion);
    await expect(
      session.startRun({
        input: "go",
        overrides: { loop: { unexpected: 2 } },
      } as any),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  } finally {
    await engine.close();
  }
});

it("changing models cannot send a previous native continuation to the replacement model", async () => {
  const model = scriptedModel([
    [
      {
        type: "completed",
        response: {
          blocks: [{ type: "text", text: "first" }],
          stopReason: "final",
          native: {
            role: "assistant",
            content: [{ type: "text", text: "synthetic-native" }],
          },
        },
      },
    ],
    finalText("must not send"),
  ]);
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "native", subjectId: "u" },
    secrets: { resolve: async () => "synthetic-key" },
    protocolKey: { secretRef: "protocol" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const base = {
      models: {
        p: {
          provider: "scripted",
          model: "original",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "test" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "p" },
    };
    const session = await engine.createSession({ config: base });
    await session.run({ input: "first" });
    await session.replaceConfig({
      ifVersion: 1,
      config: {
        ...base,
        models: { p: { ...base.models.p, model: "replacement" } },
      },
    });
    await expect(session.run({ input: "second" })).rejects.toMatchObject({
      code: "MODEL_HISTORY_INCOMPATIBLE",
    });
    expect(model.requests).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
