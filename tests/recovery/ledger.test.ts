import { it, expect } from "vitest";
import {
  createAgentEngine,
  PostgresStore,
  type EngineOptions,
  type RunInput,
} from "@agent-runtime/sdk";
import {
  scriptedModel,
  finalText,
  toolCall,
  FaultInjector,
} from "@agent-runtime/testing";
import { randomUUID } from "node:crypto";
const db = () =>
  PostgresStore.fromConnectionString(
    process.env.AGENT_TEST_DATABASE_URL ??
      "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
  );
const config = {
  models: {
    primary: {
      provider: "scripted",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "test" },
      model: "fake",
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "primary" },
  permissions: { policy: { type: "binding", bindingKey: "policy.v1" } },
};
const write = {
  name: "write.record",
  description: "Write a test record",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  outputSchema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  },
  execution: {
    type: "binding",
    bindingKey: "write.v1",
    sideEffect: "write",
    idempotency: {
      required: true,
      namespace: "test.record",
      businessKey: { type: "binding", bindingKey: "key.v1" },
    },
  },
};
async function until<T>(fn: () => Promise<T>, matches: (v: T) => boolean) {
  for (let i = 0; i < 200; i++) {
    const v = await fn();
    if (matches(v)) return v;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw Error("Condition was not reached");
}
it("real PostgreSQL crash after external write requires evidence, never replays it", async () => {
  let calls = 0;
  const faults = new FaultInjector();
  faults.arm("tool.after_execute");
  const model = scriptedModel([
    toolCall("write.record", { id: "receipt" }),
    finalText("done"),
  ]);
  const principal = { tenantId: randomUUID(), subjectId: "user" };
  const options = (store: PostgresStore): EngineOptions => ({
    store,
    principal,
    adapters: { models: { scripted: model } },
    secrets: { resolve: async () => "not-a-real-secret" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    fault: (p) => faults.hit(p),
    bindings: {
      "write.v1": {
        version: "1",
        sideEffect: "write",
        namespace: "test.record",
        execute: async () => {
          calls++;
          return { ok: true };
        },
      },
      "key.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "stable-business-key",
      },
      "policy.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  const store = db();
  await store.migrate();
  const engine = await createAgentEngine(options(store));
  const s = await engine.createSession({
    config: { ...config, tools: [write] },
  });
  const input: RunInput = { requestId: "r", input: "do it" };
  const handle = await s.startRun(input);
  await until(
    () =>
      store.transaction((tx) =>
        tx.list<{ executionStatus: string }>("operations"),
      ),
    (ops) => ops.some((o) => o.executionStatus === "dispatching"),
  );
  await new Promise((r) => setTimeout(r, 10));
  await engine.close();
  await expect(handle.result).rejects.toMatchObject({ code: "ENGINE_CLOSED" });
  const next = await createAgentEngine(options(db()));
  const loaded = await next.loadSession(s.id);
  await until(
    () => loaded.getRun(handle.runId),
    (r) => r.state === "awaiting_tool_resolution",
  );
  const op = await next.options.store.transaction(async (tx) =>
    (await tx.list<{ id: string; tenantId: string }>("operations")).find(
      (o) => o.tenantId === principal.tenantId,
    )!,
  );
  await loaded.resolveOperationOutcome(op.id, {
    outcome: "succeeded",
    evidenceRef: "test-receipt",
    receipt: { ok: true },
  });
  expect((await loaded.run(input)).outputText).toBe("done");
  expect(calls).toBe(1);
  expect(model.requests).toHaveLength(2);
  await next.close();
});
it("cross-Session business deduplication keeps success separate from output validation", async () => {
  let calls = 0;
  const model = scriptedModel([
    toolCall("write.record", { id: "receipt" }),
    finalText("one"),
    toolCall("renamed.record", { id: "receipt" }, "new-call"),
    finalText("two"),
  ]);
  const store = db();
  await store.migrate();
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: randomUUID(), subjectId: "user" },
    secrets: { resolve: async () => "test" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      "write.v1": {
        version: "1",
        sideEffect: "write",
        namespace: "test.record",
        execute: async () => {
          calls++;
          return { unexpected: true };
        },
      },
      "write.v2": {
        version: "2",
        sideEffect: "write",
        namespace: "test.record",
        execute: async () => {
          calls++;
          return { ok: true };
        },
      },
      "key.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "key",
      },
      "policy.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  const a = await engine.createSession({
    config: { ...config, tools: [write] },
  });
  await a.run({ input: "one" });
  const b = await engine.createSession({
    config: {
      ...config,
      tools: [
        {
          ...write,
          name: "renamed.record",
          execution: { ...write.execution, bindingKey: "write.v2" },
        },
      ],
    },
  });
  await b.run({ input: "two" });
  expect(calls).toBe(1);
  const rows = await store.transaction((tx) =>
    tx.list<{
      tenantId: string;
      executionStatus: string;
      validationStatus: string;
    }>("operations"),
  );
  expect(
    rows.filter((o) => o.tenantId === engine.principal.tenantId),
  ).toMatchObject([
    { executionStatus: "succeeded", validationStatus: "invalid" },
  ]);
  await engine.close();
});

it("concurrent Sessions atomically claim one shared business write and reuse its receipt", async () => {
  let calls = 0,
    policies = 0;
  let releasePolicies!: () => void, releaseWrite!: () => void;
  const policyGate = new Promise<void>((resolve) => {
    releasePolicies = resolve;
  });
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const model = scriptedModel([
    toolCall("write.record", { id: "same" }),
    toolCall("write.record", { id: "same" }),
    finalText("one"),
    finalText("two"),
  ]);
  const store = db();
  await store.migrate();
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: randomUUID(), subjectId: "user" },
    adapters: { models: { scripted: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      "write.v1": {
        version: "1",
        sideEffect: "write",
        namespace: "test.record",
        execute: async () => {
          calls++;
          await writeGate;
          return { ok: true };
        },
      },
      "key.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "shared-concurrent",
      },
      "policy.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          policies++;
          if (policies === 2) releasePolicies();
          await policyGate;
          return "allow";
        },
      },
    },
  });
  try {
    const a = await engine.createSession({
      config: { ...config, tools: [write] },
    });
    const b = await engine.createSession({
      config: { ...config, tools: [write] },
    });
    const first = await a.startRun({ input: "first" });
    const second = await b.startRun({ input: "second" });
    await until(
      async () => [
        (await a.getRun(first.runId)).state,
        (await b.getRun(second.runId)).state,
      ],
      (states) => states.includes("awaiting_tool_resolution"),
    );
    expect(calls).toBe(1);
    releaseWrite();
    await Promise.all([first.result, second.result]);
    expect(calls).toBe(1);
  } finally {
    releasePolicies();
    releaseWrite();
    await engine.close();
  }
});

it("recovery discards an uncommitted draft before retrying without executing its tool", async () => {
  const faults = new FaultInjector();
  faults.arm("model.before_commit");
  let calls = 0;
  const model = scriptedModel([
    [
      { type: "delta", blockId: "b", kind: "text", text: "uncommitted" },
      ...toolCall("write.record", { id: "draft" }),
    ],
    finalText("recovered"),
  ]);
  const principal = { tenantId: randomUUID(), subjectId: "user" };
  const options = (store: PostgresStore): EngineOptions => ({
    store,
    principal,
    adapters: { models: { scripted: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    fault: (p) => faults.hit(p),
    bindings: {
      "write.v1": {
        version: "1",
        sideEffect: "write",
        namespace: "test.record",
        execute: async () => {
          calls++;
          return { ok: true };
        },
      },
      "key.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "draft",
      },
      "policy.v1": {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  const store = db();
  await store.migrate();
  const first = await createAgentEngine(options(store));
  const session = await first.createSession({
    config: { ...config, tools: [write] },
  });
  const handle = await session.startRun({ requestId: "draft", input: "go" });
  await until(
    () => session.getSnapshot(),
    (s) => s.drafts.some((d) => d.blocks.b?.text === "uncommitted"),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  await first.close();
  const next = await createAgentEngine(options(db()));
  try {
    const loaded = await next.loadSession(session.id);
    expect(
      (await loaded.run({ requestId: "draft", input: "go" })).outputText,
    ).toBe("recovered");
    expect(calls).toBe(0);
    expect((await loaded.getSnapshot()).drafts).toEqual([]);
    expect(
      (await loaded.listEvents()).events.some(
        (e) =>
          e.type === "content.message.discarded" &&
          e.data.reason === "process_recovery",
      ),
    ).toBe(true);
  } finally {
    await next.close();
  }
});
