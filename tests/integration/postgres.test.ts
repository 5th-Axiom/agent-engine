import { it, expect } from "vitest";
import { PostgresStore } from "@agent-runtime/sdk";
import { randomUUID } from "node:crypto";
it("PostgreSQL management lock, atomic rollback and committed stream order", async () => {
  const url =
    process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test";
  const store = PostgresStore.fromConnectionString(url);
  await store.migrate();
  await store.acquire();
  const other = PostgresStore.fromConnectionString(url);
  await expect(other.acquire()).rejects.toMatchObject({ code: "ENGINE_BUSY" });
  await other.close();
  const session = randomUUID();
  await expect(
    store.transaction(async (tx) => {
      await tx.put("test", session, { ok: true });
      await tx.append(session, {
        type: "session.created",
        data: { version: 1 },
      });
      throw Error("fault");
    }),
  ).rejects.toThrow();
  expect(
    await store.transaction(async (tx) => [
      await tx.get("test", session),
      await tx.head(session),
    ]),
  ).toEqual([undefined, 0]);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      store.transaction(async (tx) => {
        await tx.put("test", session, { i });
        await tx.append(session, {
          type: "session.config_updated",
          data: { version: i },
        });
      }),
    ),
  );
  const events = await store.transaction((tx) => tx.events(session, 0));
  expect(events.map((e) => e.sequence)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  expect(new Set(events.map((e) => e.id)).size).toBe(20);
  await store.close();
  const reopened = PostgresStore.fromConnectionString(url);
  await reopened.acquire();
  expect(await reopened.transaction((tx) => tx.head(session))).toBe(20);
  await reopened.close();
});

it("terminating the management connection blocks subsequent capability dispatch", async () => {
  const { createAgentEngine } = await import("@agent-runtime/sdk");
  const { scriptedModel, toolCall } = await import("@agent-runtime/testing");
  const url =
    process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test";
  const store = PostgresStore.fromConnectionString(url);
  await store.migrate();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent = new Promise<void>((resolve) => {
    started = resolve;
  });
  const model = scriptedModel([]);
  model.stream = async function* () {
    started();
    await gate;
    yield* toolCall("record.read", {});
  };
  let calls = 0;
  const health: string[] = [];
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: randomUUID(), subjectId: "user" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    telemetry: {
      health: (_ok, code) => {
        if (code) health.push(code);
      },
    },
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
        tools: [
          {
            name: "record.read",
            description: "Synthetic read",
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
    const handle = await session.startRun({ input: "go" });
    await sent;
    const killed = await store.pool.query<{ terminated: boolean }>(
      "SELECT pg_terminate_backend(pid) AS terminated FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=$1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND granted",
      [719254381],
    );
    expect(killed.rows).toEqual([{ terminated: true }]);
    release();
    for (let i = 0; i < 200 && !health.includes("STORE_LOCK_LOST"); i++)
      await new Promise((resolve) => setTimeout(resolve, 2));
    expect(health).toContain("STORE_LOCK_LOST");
    expect(calls).toBe(0);
    await expect(store.assertHeld()).rejects.toMatchObject({
      code: "STORE_LOCK_LOST",
    });
    await engine.close();
    await expect(handle.result).rejects.toMatchObject({
      code: "ENGINE_CLOSED",
    });
  } finally {
    release();
    await engine.close();
  }
});
