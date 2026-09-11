import { it, expect } from "vitest";
import {
  summarize,
  price,
  updateUsage,
  type UsageRecord,
  createAgentEngine,
} from "@agent-runtime/sdk";
import { scriptedModel, finalText, MemoryStore } from "@agent-runtime/testing";
const record = (): UsageRecord => ({
  id: "a",
  runId: "r",
  sessionId: "s",
  stepId: "p",
  attemptId: "a",
  provider: "fake",
  model: "fake",
  dispatchState: "sent",
  revision: 0,
  tokens: {},
  cost: {},
  status: "unknown",
  source: "unknown",
  seen: [],
  reservation: { input: 100, output: 100 },
});
it("snapshot replacement, delta deduplication, partitions, and unknown cost remain distinct", () => {
  const r = record();
  updateUsage(r, { input: 10, output: 5, reasoning: 2 }, "snapshot", true);
  updateUsage(r, { input: 20, output: 10, reasoning: 3 }, "snapshot", true);
  expect(summarize([r]).knownTotals.total).toBe(30);
  expect(summarize([r]).costComplete).toBe(false);
  const d = record();
  updateUsage(d, { input: 10 }, "delta", false, "1");
  expect(updateUsage(d, { input: 10 }, "delta", false, "1")).toBe(false);
  expect(d.tokens.input).toBe(10);
  expect(() => updateUsage(d, { input: -1 }, "snapshot", true)).toThrow();
  expect(() =>
    updateUsage(d, { input: 2, output: 1, reasoning: 2 }, "snapshot", true),
  ).toThrow();
  expect(
    price(
      { uncachedInput: 1, cacheReadInput: 0, cacheWriteInput: 0, output: 1 },
      { currency: "USD", uncachedInputPerMillion: 1, outputPerMillion: 2 },
    ),
  ).toEqual({ currency: "USD", estimated: "0.000003" });
});
it("not-sent attempts do not pretend to have provider zero usage or make totals incomplete", () => {
  const r = record();
  r.dispatchState = "not_sent";
  expect(summarize([r])).toMatchObject({
    attemptCount: 1,
    complete: true,
    costComplete: true,
    knownTotals: {},
  });
});
it("late usage revises the original Attempt and reports over-budget without reopening a completed Run", async () => {
  let report!: NonNullable<
    Parameters<ReturnType<typeof scriptedModel>["stream"]>[1]["reportUsage"]
  >;
  const model = scriptedModel([finalText("done")]);
  const original = model.stream;
  model.stream = (request, ctx) => {
    report = ctx.reportUsage!;
    return original(request, ctx);
  };
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "s" },
    secrets: { resolve: async () => "test" },
    adapters: { models: { fake: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  const session = await engine.createSession({
    config: {
      models: {
        p: {
          provider: "fake",
          model: "fake",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "test" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "p" },
      budgets: { perRun: { maxTotalTokens: 10000 } },
    },
  });
  const result = await session.run({ input: "small" });
  await report({
    type: "usage",
    usage: { input: 20000, output: 10 },
    mode: "snapshot",
    final: true,
  });
  expect((await session.getRun(result.runId)).state).toBe("completed");
  expect((await engine.usage.getRun(result.runId)).knownTotals.total).toBe(
    20010,
  );
  expect(
    (await session.listEvents()).events.some(
      (e) => e.type === "budget.exceeded" && e.data.late,
    ),
  ).toBe(true);
  await engine.close();
});

it("invalid updates are atomic and provisional reports cannot replace final usage", () => {
  const r = record();
  updateUsage(r, { input: 10, output: 5 }, "snapshot", true);
  const before = structuredClone(r);
  expect(() =>
    updateUsage(r, { input: 1, output: 1, total: 9 }, "snapshot", true),
  ).toThrow();
  expect(r).toEqual(before);
  expect(updateUsage(r, { input: 1, output: 1 }, "snapshot", false)).toBe(
    false,
  );
  expect(r).toEqual(before);
  const second = record();
  second.id = "b";
  second.cost = { currency: "CNY", estimated: "2" };
  second.status = "final";
  second.tokens = { input: 1, output: 1, total: 2 };
  r.cost = { currency: "USD", estimated: "1" };
  expect(summarize([r, second]).costByCurrency).toEqual({
    USD: { estimated: "1", complete: true },
    CNY: { estimated: "2", complete: true },
  });
});
it("late usage after Session deletion updates only its minimal ledger tombstone", async () => {
  let report!: NonNullable<
    Parameters<ReturnType<typeof scriptedModel>["stream"]>[1]["reportUsage"]
  >;
  const model = scriptedModel([finalText("private derived output")]);
  const stream = model.stream;
  model.stream = (request, ctx) => {
    report = ctx.reportUsage!;
    return stream(request, ctx);
  };
  const store = new MemoryStore();
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: "delete", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { fake: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({
      config: {
        models: {
          p: {
            provider: "fake",
            model: "fake",
            baseURL: "https://model.example.com",
            apiKey: { secretRef: "test" },
            limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
          },
        },
        routing: { primary: "p" },
      },
    });
    const result = await session.run({ input: "private source" });
    await engine.deleteSession(session.id);
    await report({
      type: "usage",
      usage: { input: 12, output: 4 },
      mode: "snapshot",
      final: true,
    });
    const retained = await store.transaction((tx) =>
      tx.get<{ usage: UsageRecord[] }>("deleted_usage", result.runId),
    );
    expect(retained?.usage[0]?.tokens.total).toBe(16);
    expect(JSON.stringify(retained)).not.toContain("private");
    await expect(engine.loadSession(session.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(
      await store.transaction((tx) => tx.get("runs", result.runId)),
    ).toBeUndefined();
  } finally {
    await engine.close();
  }
});

it("actual usage is checked before terminal success and budget warnings are emitted once", async () => {
  const model = scriptedModel([
    [
      {
        type: "usage",
        usage: { input: 20000, output: 1 },
        mode: "snapshot",
        final: true,
      },
      ...finalText("cannot succeed"),
    ],
  ]);
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "budget", subjectId: "u" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({
      config: {
        models: {
          p: {
            provider: "fake",
            model: "fake",
            baseURL: "https://model.example.com",
            apiKey: { secretRef: "test" },
            limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
          },
        },
        routing: { primary: "p" },
        budgets: { perRun: { maxTotalTokens: 5000 }, warningAt: 0.1 },
      },
    });
    await expect(session.run({ input: "small" })).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    const events = (await session.listEvents()).events;
    expect(events.some((event) => event.type === "run.completed")).toBe(false);
    expect(
      events.filter((event) => event.type === "budget.warning"),
    ).toHaveLength(1);
    expect(events.some((event) => event.type === "budget.exceeded")).toBe(true);
    expect(model.requests).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
