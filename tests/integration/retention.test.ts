import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createAgentEngine,
  PostgresStore,
  type EngineOptions,
  type OperationRecord,
  type RunRecord,
} from "@agent-runtime/sdk";
import {
  scriptedModel,
  finalText,
  toolCall,
  FakeClock,
} from "@agent-runtime/testing";
const db = () =>
  PostgresStore.fromConnectionString(
    process.env.AGENT_TEST_DATABASE_URL ??
      "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
  );
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
it.each(["expiry", "deletion"])(
  "PostgreSQL %s clears source and dependent Sessions while retaining business deduplication",
  async (mode) => {
    const clock = new FakeClock(),
      principal = { tenantId: randomUUID(), subjectId: "u" };
    let calls = 0;
    const options: Omit<EngineOptions, "store"> = {
      principal,
      clock,
      secrets: { resolve: async () => "synthetic" },
      adapters: {
        models: {
          fake: scriptedModel([
            toolCall("record.write", { id: "synthetic" }),
            finalText("PRIVATE_FIRST"),
            toolCall("record.write", { id: "synthetic" }),
            finalText("PRIVATE_DERIVED"),
          ]),
        },
      },
      policy: {
        allowedOrigins: ["https://model.example.com"],
        promptRetention: "1s",
      },
      bindings: {
        write: {
          version: "1",
          sideEffect: "write",
          namespace: "retention",
          execute: async () => {
            calls++;
            return { value: "PRIVATE_RECEIPT" };
          },
        },
        key: {
          version: "1",
          sideEffect: "read",
          execute: async () => "synthetic-key",
        },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => "allow",
        },
      },
    };
    const cfg = {
      ...config,
      permissions: { policy: { type: "binding", bindingKey: "policy" } },
      tools: [
        {
          name: "record.write",
          description: "Synthetic",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          execution: {
            type: "binding",
            bindingKey: "write",
            sideEffect: "write",
            idempotency: {
              namespace: "retention",
              businessKey: { type: "binding", bindingKey: "key" },
            },
          },
        },
      ],
    };
    const store = db();
    await store.migrate();
    const engine = await createAgentEngine({ ...options, store });
    const first = await engine.createSession({ config: cfg });
    const a = await first.run({ input: "PRIVATE_SOURCE" });
    clock.advance(500);
    const second = await engine.createSession({ config: cfg });
    const b = await second.run({ input: "PRIVATE_CONSUMER" });
    expect(calls).toBe(1);
    if (mode === "deletion") await engine.deleteSession(first.id);
    await engine.close();
    clock.advance(501);
    const restoredStore = db();
    const restored = await createAgentEngine({
      ...options,
      store: restoredStore,
    });
    try {
      for (const id of [first.id, second.id]) {
        if (mode === "deletion" && id === first.id) {
          await expect(restored.loadSession(id)).rejects.toMatchObject({
            code: "ACCESS_DENIED",
          });
          continue;
        }
        const session = await restored.loadSession(id);
        await expect(session.getSnapshot()).rejects.toMatchObject({
          code: "DATA_RETENTION_EXPIRED",
        });
      }
      const records = await restoredStore.transaction(async (tx) => ({
        runs: [await tx.get("runs", a.runId), await tx.get("runs", b.runId)],
        events: [await tx.events(first.id, 0), await tx.events(second.id, 0)],
        operations: (await tx.list<OperationRecord>("operations")).filter(
          (op) => op.tenantId === principal.tenantId,
        ),
      }));
      expect(JSON.stringify(records)).not.toContain("PRIVATE_");
      expect(records.operations).toHaveLength(1);
      expect(records.operations[0]?.executionStatus).toBe("succeeded");
      if (mode === "expiry")
        expect(records.operations[0]?.receiptHash).toBeDefined();
      expect(
        records.runs
          .filter(Boolean)
          .every((run) => (run as RunRecord).dataExpiredAt !== undefined),
      ).toBe(true);
      options.adapters!.models!.fake = scriptedModel([
        toolCall("record.write", { id: "synthetic" }),
      ]);
      restored.adapters.fake = options.adapters!.models!.fake;
      const next = await restored.createSession({ config: cfg });
      await expect(next.run({ input: "new request" })).rejects.toMatchObject({
        code: "DATA_RETENTION_EXPIRED",
      });
      expect(calls).toBe(1);
    } finally {
      await restored.close();
    }
  },
);
it("Usage settlement survives restart, occurs once, and a deleted Run causes no false health failure", async () => {
  const principal = { tenantId: randomUUID(), subjectId: "u" },
    clock = new FakeClock();
  const health: string[] = [];
  const opts = {
    principal,
    clock,
    usageSettlementMs: 100,
    secrets: { resolve: async () => "synthetic" },
    adapters: {
      models: { fake: scriptedModel([finalText("one"), finalText("two")]) },
    },
    policy: { allowedOrigins: ["https://model.example.com"] },
    telemetry: {
      health: (_ok: boolean, code?: string) => {
        if (code) health.push(code);
      },
    },
  };
  const store = db();
  await store.migrate();
  const engine = await createAgentEngine({ ...opts, store });
  const keep = await engine.createSession({ config });
  const result = await keep.run({ input: "one" });
  const remove = await engine.createSession({ config });
  await remove.run({ input: "two" });
  await engine.deleteSession(remove.id);
  await engine.close();
  clock.advance(101);
  const restored = await createAgentEngine({ ...opts, store: db() });
  try {
    const session = await restored.loadSession(keep.id);
    const { events } = await session.listEvents();
    expect(
      events.filter(
        (event) =>
          event.type === "usage.settled" && event.runId === result.runId,
      ),
    ).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(
      (await session.listEvents()).events.filter(
        (event) => event.type === "usage.settled",
      ),
    ).toHaveLength(1);
    expect(health).toEqual([]);
  } finally {
    await restored.close();
  }
});
