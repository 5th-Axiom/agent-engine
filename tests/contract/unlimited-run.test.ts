import { expect, it } from "vitest";
import {
  createAgentEngine,
  effectiveConfig,
  parseConfig,
  AgentEngineError,
  type ModelAdapter,
} from "@agent-runtime/sdk";
import {
  FakeClock,
  MemoryStore,
  finalText,
  scriptedModel,
} from "@agent-runtime/testing";

const unlimited = {
  maxSteps: null,
  maxModelAttempts: null,
  maxCapabilityInvocations: null,
  timeoutMs: null,
};
const config = {
  models: {
    p: {
      provider: "fake",
      model: "synthetic",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "test" },
      limits: { contextWindowTokens: 1000000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "p" },
};
const common = {
  principal: { tenantId: "unlimited", subjectId: "user" },
  secrets: { resolve: async () => "synthetic" },
  policy: { allowedOrigins: ["https://model.example.com"] },
};

it("explicit null disables inherited loop limits but cannot override a finite policy ceiling", () => {
  expect(effectiveConfig(parseConfig(config)).loop).toEqual({
    maxSteps: 16,
    maxModelAttempts: 64,
    maxCapabilityInvocations: 64,
    timeoutMs: 120000,
  });
  const declared = parseConfig({ ...config, loop: unlimited });
  expect(
    effectiveConfig(declared, { loop: { maxSteps: 2, timeoutMs: 100 } }).loop,
  ).toEqual(unlimited);
  expect(
    effectiveConfig(parseConfig(config), { loop: unlimited }).loop,
  ).toEqual(unlimited);
  expect(JSON.parse(JSON.stringify(effectiveConfig(declared))).loop).toEqual(
    unlimited,
  );
  for (const key of Object.keys(unlimited)) {
    expect(() => effectiveConfig(declared, {}, { loop: { [key]: 1 } })).toThrow(
      expect.objectContaining({ code: "CONFIG_POLICY_VIOLATION" }),
    );
    for (const value of [0, -1, Infinity, false])
      expect(() =>
        parseConfig({ ...config, loop: { [key]: value } }),
      ).toThrow();
  }
});

it("unlimited runs pass the old step, attempt, capability, time and token limits while retaining usage", async () => {
  const clock = new FakeClock();
  let attempts = 0,
    decisions = 0,
    calls = 0;
  const model: ModelAdapter = {
    version: "1",
    capabilities: { tools: true, thinking: false, structuredOutput: false },
    async *stream() {
      attempts++;
      clock.advance(3000);
      yield {
        type: "usage",
        usage: { input: 2000, output: 100 },
        mode: "snapshot",
        final: true,
      };
      if (attempts === 1) {
        yield {
          type: "failed",
          error: new AgentEngineError("MODEL_RATE_LIMITED", "synthetic", true),
        };
        return;
      }
      decisions++;
      yield {
        type: "completed",
        response:
          decisions <= 66
            ? {
                blocks: [
                  {
                    type: "tool_call",
                    id: `read-${decisions}`,
                    name: "read.item",
                    arguments: {},
                  },
                ],
                stopReason: "tool_calls",
              }
            : {
                blocks: [{ type: "text", text: "complete" }],
                stopReason: "final",
              },
      };
    },
  };
  const engine = await createAgentEngine({
    ...common,
    store: new MemoryStore(),
    clock,
    adapters: { models: { fake: model } },
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          calls++;
          return {};
        },
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        loop: unlimited,
        retry: { model: { maxRetries: 1 } },
        tools: [
          {
            name: "read.item",
            description: "Read a synthetic item",
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
    const result = await session.run({ input: "continue to completion" });
    expect(result.outputText).toBe("complete");
    expect(calls).toBe(66);
    expect(attempts).toBe(68);
    const run = await engine.readRun(session.id, result.runId);
    expect(run.steps).toHaveLength(67);
    expect(run.activeMs).toBeGreaterThan(120000);
    const usage = await engine.usage.getRun(result.runId);
    expect(usage.complete).toBe(true);
    expect(usage.knownTotals.total).toBe(142800);
    const frozen = await session.getEffectiveConfig({ runId: result.runId });
    expect(frozen.value.loop).toEqual(unlimited);
    expect(frozen.sources?.["/loop/maxSteps"]).toBe("session");
  } finally {
    await engine.close();
  }
}, 30000);

it("run overrides can narrow unlimited limits but cannot disable a finite session limit; token policies still apply", async () => {
  const model = scriptedModel([finalText("done"), finalText("same")]);
  const engine = await createAgentEngine({
    ...common,
    store: new MemoryStore(),
    adapters: { models: { fake: model } },
  });
  try {
    const open = await engine.createSession({
      config: { ...config, loop: unlimited },
    });
    const narrowed = await open.run({
      input: "once",
      overrides: {
        loop: {
          maxSteps: 1,
          maxModelAttempts: 1,
          maxCapabilityInvocations: 1,
          timeoutMs: 10000,
        },
      },
    });
    expect(
      (await open.getEffectiveConfig({ runId: narrowed.runId })).value.loop
        ?.maxSteps,
    ).toBe(1);
    expect(
      (
        await open.run({
          input: "still unlimited",
          overrides: { loop: unlimited },
        })
      ).outputText,
    ).toBe("same");
    const bounded = await engine.createSession({ config });
    await expect(
      bounded.startRun({
        input: "cannot widen",
        overrides: { loop: { maxSteps: null } },
      }),
    ).rejects.toMatchObject({ code: "CONFIG_POLICY_VIOLATION" });
    const tokenBounded = await engine.createSession({
      config: {
        ...config,
        loop: unlimited,
        budgets: { perRun: { maxTotalTokens: 1 } },
      },
    });
    await expect(tokenBounded.run({ input: "limited" })).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect(model.requests).toHaveLength(2);
  } finally {
    await engine.close();
  }
});

it("a user can cancel an unlimited run during a model request", async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const model: ModelAdapter = {
    version: "1",
    capabilities: { tools: true, thinking: false, structuredOutput: false },
    async *stream(_request, { signal }) {
      entered();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      signal.throwIfAborted();
    },
  };
  const engine = await createAgentEngine({
    ...common,
    store: new MemoryStore(),
    adapters: { models: { fake: model } },
  });
  try {
    const session = await engine.createSession({
      config: { ...config, loop: unlimited },
    });
    const handle = await session.startRun({ input: "wait" });
    await started;
    await handle.cancel();
    await expect(handle.result).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
    expect((await session.getRun(handle.runId)).state).toBe("cancelled");
  } finally {
    await engine.close();
  }
});
