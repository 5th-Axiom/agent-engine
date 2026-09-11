import { it, expect } from "vitest";
import {
  createAgentEngine,
  type EngineOptions,
  type OperationRecord,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
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
async function until(fn: () => Promise<boolean>) {
  for (let i = 0; i < 400; i++) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw Error("Condition not reached");
}
it("cancelling a queued model request does not record it as dispatched", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const model = scriptedModel([]);
  model.stream = async function* () {
    calls++;
    await gate;
    yield* finalText("done");
  };
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "u" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    limits: { maxConcurrentModelRequests: 1 },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const a = await engine.createSession({ config }),
      b = await engine.createSession({ config });
    const first = await a.startRun({ input: "first" });
    const second = await b.startRun({ input: "second" });
    await until(async () => calls === 1);
    await until(
      async () => (await engine.usage.getRun(second.runId)).attemptCount === 1,
    );
    await b.cancelRun(second.runId);
    await expect(second.result).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
    expect(calls).toBe(1);
    expect(
      (await engine.readRun(b.id, second.runId)).usage[0]?.dispatchState,
    ).toBe("not_sent");
    release();
    await first.result;
  } finally {
    release();
    await engine.close();
  }
});
it("cancelling a write waiting for a capability slot prevents dispatch while the active write completes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const model = scriptedModel([
    toolCall("record.write", { id: "first" }),
    toolCall("record.write", { id: "second" }),
    finalText("done"),
  ]);
  const store = new MemoryStore();
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: "t", subjectId: "u" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    limits: { maxConcurrentCapabilityRequests: 1 },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "writes",
        execute: async () => {
          calls++;
          await gate;
          return { ok: true };
        },
      },
      key: {
        version: "1",
        sideEffect: "read",
        execute: async (value) => String((value as any).input.id),
      },
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  const full = {
    ...config,
    permissions: { policy: { type: "binding", bindingKey: "policy" } },
    tools: [
      {
        name: "record.write",
        description: "Synthetic write",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        execution: {
          type: "binding",
          bindingKey: "write",
          sideEffect: "write",
          idempotency: {
            namespace: "writes",
            businessKey: { type: "binding", bindingKey: "key" },
          },
        },
      },
    ],
  };
  try {
    const a = await engine.createSession({ config: full }),
      b = await engine.createSession({ config: full });
    const first = await a.startRun({ input: "first" });
    await until(async () => calls === 1);
    const second = await b.startRun({ input: "second" });
    await until(
      async () => !!(await engine.readRun(b.id, second.runId)).decision,
    );

    await b.cancelRun(second.runId);
    await expect(second.result).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
    expect(calls).toBe(1);
    const op = (
      await store.transaction((tx) => tx.list<OperationRecord>("operations"))
    ).find((o) => o.runId === second.runId);
    expect(op === undefined || op.executionStatus === "not_executed").toBe(
      true,
    );
    release();
    await first.result;
  } finally {
    release();
    await engine.close();
  }
});

it("cancelling an in-flight write keeps the Session occupied until evidence resolves its outcome", async () => {
  let started!: () => void;
  const sent = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const store = new MemoryStore();
  const model = scriptedModel([
    toolCall("record.write", { id: "one" }),
    finalText("later"),
  ]);
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: "unknown", subjectId: "u" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "unknown.write",
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
      key: { version: "1", sideEffect: "read", execute: async () => "one" },
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
            description: "Synthetic unknown write",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            execution: {
              type: "binding",
              bindingKey: "write",
              sideEffect: "write",
              idempotency: {
                namespace: "unknown.write",
                businessKey: { type: "binding", bindingKey: "key" },
              },
            },
          },
        ],
      },
    });
    const handle = await session.startRun({ input: "first" });
    await sent;
    await session.cancelRun(handle.runId);
    await until(
      async () =>
        (await session.getRun(handle.runId)).state ===
        "awaiting_tool_resolution",
    );
    await expect(session.startRun({ input: "blocked" })).rejects.toMatchObject({
      code: "SESSION_BUSY",
    });
    const op = (
      await store.transaction((tx) => tx.list<OperationRecord>("operations"))
    )[0]!;
    await session.resolveOperationOutcome(op.id, {
      outcome: "succeeded",
      evidenceRef: "confirmed-by-host",
      receipt: { ok: true },
    });
    await expect(handle.result).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
    expect(calls).toBe(1);
    await session.run({ input: "continue" });
    const messages = model.requests.at(-1)!.messages;
    expect(
      messages.some(
        (m) =>
          m.role === "tool" &&
          m.callId === "call-1" &&
          m.content.includes("succeeded"),
      ),
    ).toBe(true);
    expect(
      messages.filter((m) => m.role === "tool" && m.callId === "call-1"),
    ).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
