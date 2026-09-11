import { it, expect } from "vitest";
import {
  createAgentEngine,
  type RunRecord,
  type OperationRecord,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
  FakeClock,
} from "@agent-runtime/testing";
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
it("expired data is denied immediately and cleared from durable records, snapshots and events", async () => {
  const store = new MemoryStore(),
    clock = new FakeClock();
  const engine = await createAgentEngine({
    store,
    clock,
    principal: { tenantId: "retention", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    adapters: {
      models: { fake: scriptedModel([finalText("PRIVATE_DERIVED_ANSWER")]) },
    },
    policy: {
      allowedOrigins: ["https://model.example.com"],
      promptRetention: "1s",
    },
  });
  try {
    const session = await engine.createSession({
      config: { ...config, instructions: { text: "PRIVATE_INSTRUCTION" } },
    });
    const result = await session.run({ input: "PRIVATE_USER_INPUT" });
    clock.advance(1001);
    await expect(session.getRun(result.runId)).rejects.toMatchObject({
      code: "DATA_RETENTION_EXPIRED",
    });
    await expect(session.startRun({ input: "new" })).rejects.toMatchObject({
      code: "DATA_RETENTION_EXPIRED",
    });
    expect((await engine.sweepExpiredData()).expiredRuns).toBe(1);
    const stored = await store.transaction(async (tx) => ({
      run: await tx.get("runs", result.runId),
      session: await tx.get("sessions", session.id),
      events: await tx.events(session.id, 0),
    }));
    expect(JSON.stringify(stored)).not.toMatch(
      /PRIVATE_DERIVED_ANSWER|PRIVATE_INSTRUCTION|PRIVATE_USER_INPUT/,
    );
    expect((stored.run as RunRecord).state).toBe("completed");
    expect((stored.run as RunRecord).usage).toHaveLength(1);
    await expect(session.getConfig()).rejects.toMatchObject({
      code: "DATA_RETENTION_EXPIRED",
    });
    await expect(session.getEffectiveConfig()).rejects.toMatchObject({
      code: "DATA_RETENTION_EXPIRED",
    });
    await expect(
      engine.readRun(session.id, result.runId),
    ).rejects.toMatchObject({ code: "DATA_RETENTION_EXPIRED" });
    await expect(session.listEvents()).rejects.toMatchObject({
      code: "DATA_RETENTION_EXPIRED",
    });
  } finally {
    await engine.close();
  }
});
it("an expired in-flight write retains only an unknown ledger identity until evidence arrives", async () => {
  const store = new MemoryStore(),
    clock = new FakeClock();
  let started!: () => void;
  const sent = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const model = scriptedModel([
    toolCall("record.write", { value: "PRIVATE_ARGUMENT" }),
  ]);
  const engine = await createAgentEngine({
    store,
    clock,
    principal: { tenantId: "expired-write", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { fake: model } },
    policy: {
      allowedOrigins: ["https://model.example.com"],
      promptRetention: "1s",
    },
    bindings: {
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "expired.write",
        execute: async (_input, ctx) => {
          calls++;
          started();
          return new Promise((_resolve, reject) =>
            ctx.signal.addEventListener(
              "abort",
              () => reject(ctx.signal.reason),
              { once: true },
            ),
          );
        },
      },
      key: { version: "1", sideEffect: "read", execute: async () => "stable" },
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        permissions: { policy: { type: "binding", bindingKey: "policy" } },
        tools: [
          {
            name: "record.write",
            description: "Write",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            execution: {
              type: "binding",
              bindingKey: "write",
              sideEffect: "write",
              idempotency: {
                namespace: "expired.write",
                businessKey: { type: "binding", bindingKey: "key" },
              },
            },
          },
        ],
      },
    });
    const handle = await session.startRun({ input: "PRIVATE_INPUT" });
    await sent;
    clock.advance(1001);
    await engine.sweepExpiredData();
    const operation = (
      await store.transaction((tx) => tx.list<OperationRecord>("operations"))
    )[0]!;
    expect(operation.executionStatus).toBe("outcome_unknown");
    expect(operation.args).toBeNull();
    expect(
      JSON.stringify(
        await store.transaction((tx) => tx.get("runs", handle.runId)),
      ),
    ).not.toContain("PRIVATE_");
    const evidence = {
      outcome: "succeeded" as const,
      evidenceRef: "host-receipt",
      receipt: { ok: true, private: "PRIVATE_RECEIPT" },
    };
    await session.resolveOperationOutcome(operation.id, evidence);
    await expect(handle.result).rejects.toMatchObject({
      code: "DATA_RETENTION_EXPIRED",
    });
    await session.resolveOperationOutcome(operation.id, evidence);
    const resolved = await store.transaction((tx) =>
      tx.get<OperationRecord>("operations", operation.id),
    );
    expect(resolved?.executionStatus).toBe("succeeded");
    expect(resolved?.receipt).toBeUndefined();
    expect(resolved?.receiptHash).toBeDefined();
    expect(calls).toBe(1);
    expect(model.requests).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
