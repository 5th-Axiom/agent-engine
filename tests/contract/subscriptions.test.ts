import { it, expect } from "vitest";
import { createAgentEngine, type AgentEvent } from "@agent-runtime/sdk";
import { MemoryStore, scriptedModel, finalText } from "@agent-runtime/testing";
const config = {
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
};
it("revoking data access while a replay page is being consumed prevents subsequent callbacks", async () => {
  let revoked = false;
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "revoke", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    authorize: async (req) => !(revoked && req.action === "data"),
    adapters: {
      models: { fake: scriptedModel([finalText("PRIVATE_ANSWER")]) },
    },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({ config });
    await session.run({ input: "PRIVATE_INPUT" });
    const received: AgentEvent[] = [];
    const sub = await session.subscribe({
      onEvent: (event) => {
        received.push(event);
        revoked = true;
      },
    });
    expect((await sub.closed).reason).toBe("ACCESS_DENIED");
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("session.created");
  } finally {
    await engine.close();
  }
});
it("fixed high-water replay, consumer errors and expired cursors do not affect Run execution", async () => {
  const store = new MemoryStore();
  const e = await createAgentEngine({
    store,
    principal: { tenantId: "t", subjectId: "u" },
    secrets: { resolve: async () => "test" },
    adapters: {
      models: { fake: scriptedModel([finalText("one"), finalText("two")]) },
    },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  const s = await e.createSession({ config });
  await s.run({ input: "one" });
  const head = (await s.listEvents()).highWaterMark;
  const received: AgentEvent[] = [];
  const subscription = await s.subscribe({
    afterSequence: 0,
    onEvent: (event) => {
      received.push(event);
    },
  });
  await s.run({ input: "two" });
  await new Promise((r) => setTimeout(r, 5));
  const fixed = await s.listEvents({ afterSequence: 0, throughSequence: head });
  expect(fixed.events.every((e) => e.sequence <= head)).toBe(true);
  expect(new Set(received.map((e) => e.id)).size).toBe(received.length);
  const broken = await s.subscribe({
    afterSequence: 0,
    onEvent: () => {
      throw Error("consumer");
    },
  });
  expect((await broken.closed).reason).toBe("consumer_error");
  await subscription.close();
  await store.transaction((tx) => tx.pruneEvents(s.id, head));
  await expect(s.listEvents({ afterSequence: 0 })).rejects.toMatchObject({
    code: "EVENT_CURSOR_EXPIRED",
  });
  const snapshot = await s.getSnapshot();
  expect(
    (await s.listEvents({ afterSequence: snapshot.snapshotSequence })).events,
  ).toEqual([]);
  await e.close();
});

it("an atomic snapshot retains the complete open draft after older delta events expire", async () => {
  const store = new MemoryStore();
  let release!: () => void, emitted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    emitted = resolve;
  });
  const model = scriptedModel([]);
  model.stream = async function* () {
    for (let i = 0; i < 1010; i++)
      yield { type: "delta", kind: "text", blockId: "text", text: "x" };
    emitted();
    await gate;
    yield* finalText("done");
  };
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: "draft", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { fake: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({ config });
    const handle = await session.startRun({ input: "go" });
    await ready;
    const before = await session.getSnapshot();
    await store.transaction((tx) =>
      tx.pruneEvents(session.id, before.snapshotSequence - 10),
    );
    const snapshot = await session.getSnapshot();
    expect(snapshot.drafts).toHaveLength(1);
    expect(snapshot.drafts[0]!.blocks.text!.text).toBe("x".repeat(1010));
    expect(
      (await session.listEvents({ afterSequence: snapshot.snapshotSequence }))
        .events,
    ).toEqual([]);
    release();
    await handle.result;
    expect((await session.getSnapshot()).drafts).toEqual([]);
  } finally {
    release();
    await engine.close();
  }
});

it("a stalled consumer is closed for lag without blocking Run completion", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "lag", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { fake: scriptedModel([finalText("done")]) } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({ config });
    const head = (await session.getSnapshot()).snapshotSequence;
    const sub = await session.subscribe({
      afterSequence: head,
      maxBuffer: 2,
      onEvent: async () => gate,
    });
    expect((await session.run({ input: "go" })).outputText).toBe("done");
    expect((await sub.closed).reason).toBe("SUBSCRIPTION_LAGGED");
    release();
    const fresh = await session.subscribe({
      afterSequence: (await session.getSnapshot()).snapshotSequence,
      onEvent: () => {},
    });
    await engine.close();
    expect((await fresh.closed).reason).toBe("ENGINE_CLOSED");
  } finally {
    release();
    await engine.close();
  }
});
