import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { it, expect } from "vitest";
import {
  createAgentEngine,
  PostgresStore,
  type AgentEngine,
  type StoreTransaction,
} from "@agent-runtime/sdk";
import { scriptedModel, finalText } from "@agent-runtime/testing";

it("uses scoped PostgreSQL reads without weakening ownership, revocation or custom-store fallback", async () => {
  const url = new URL(
    process.env.AGENT_TEST_DATABASE_URL ??
      "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
  );
  const database = "session_read_" + randomUUID().replaceAll("-", "");
  url.pathname = "/postgres";
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query('CREATE DATABASE "' + database + '"');
  url.pathname = "/" + database;
  const store = PostgresStore.fromConnectionString(url.toString());
  let engine: AgentEngine | undefined;
  let denied = false,
    optimized = true,
    scopedReads = 0;
  const transaction = store.transaction.bind(store);
  store.transaction = <T>(fn: (tx: StoreTransaction) => Promise<T>) =>
    transaction((tx) =>
      fn({
        ...tx,
        get: tx.get.bind(tx),
        put: tx.put.bind(tx),
        remove: tx.remove.bind(tx),
        list: tx.list.bind(tx),
        append: tx.append.bind(tx),
        events: tx.events.bind(tx),
        head: tx.head.bind(tx),
        pruneEvents: tx.pruneEvents.bind(tx),
        ...(optimized
          ? {
              listBySession: <R>(table: string, id: string) => {
                scopedReads++;
                return tx.listBySession!<R>(table, id);
              },
            }
          : {}),
      }),
    );
  try {
    await store.migrate();
    engine = await createAgentEngine({
      store,
      principal: { tenantId: "test", subjectId: "first" },
      authorize: async ({ action }) => action !== "data" || !denied,
      secrets: { resolve: async () => "synthetic" },
      adapters: {
        models: { fake: scriptedModel([finalText("one"), finalText("two")]) },
      },
      policy: { allowedOrigins: ["https://model.example.com"] },
    });
    const config = {
      models: {
        p: {
          provider: "fake",
          model: "test",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "test" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "p" },
    };
    const first = await engine.createSession({ config });
    const handle = await first.startRun({ input: "one" });
    await handle.result;
    const other = engine.forPrincipal({
      tenantId: "test",
      subjectId: "second",
    });
    const second = await other.createSession({ config });
    await second.run({ input: "two" });
    const before = scopedReads;
    expect((await engine.readSession(first.id)).id).toBe(first.id);
    expect((await engine.readRun(first.id, handle.runId)).input).toBe("one");
    const view = await engine.inspectSession(first.id);
    expect(view.runs.map((r) => r.id)).toEqual([handle.runId]);
    const bundled = await engine.readSessionView(first.id);
    expect(bundled.session.id).toBe(first.id);
    expect(bundled.runs.map((r) => r.id)).toEqual([handle.runId]);
    expect(bundled.runs[0]?.result?.outputText).toBe("one");
    expect(bundled.events.every((e) => e.sessionId === first.id)).toBe(true);
    expect(bundled.eventsComplete).toBe(true);
    const next = await engine.readSessionView(first.id, {
      afterSequence: bundled.snapshotSequence,
    });
    expect(next.events).toEqual([]);
    expect(next.eventsComplete).toBe(true);
    await expect(
      engine.readSessionView(first.id, { afterSequence: -1 }),
    ).rejects.toMatchObject({ code: "EVENT_CURSOR_INVALID" });
    expect(scopedReads).toBeGreaterThan(before);
    expect(
      await transaction((tx) => tx.listBySession!("runs", "' OR true --")),
    ).toEqual([]);
    await expect(other.readSession(first.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(other.readSessionView(first.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    denied = true;
    await expect(engine.inspectSession(first.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(engine.readSessionView(first.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    denied = false;
    optimized = false;
    expect((await engine.inspectSession(first.id)).runs).toEqual(view.runs);
    expect((await engine.readSessionView(first.id)).runs).toEqual(bundled.runs);
    await transaction((tx) =>
      tx.pruneEvents(first.id, bundled.snapshotSequence),
    );
    const pruned = await engine.readSessionView(first.id);
    expect(pruned.eventsComplete).toBe(false);
    expect(pruned.runs[0]?.result?.outputText).toBe("one");
  } finally {
    if (engine) await engine.close();
    else await store.close();
    // Pool shutdown can return before PostgreSQL has observed every socket FIN.
    // Wait for this fixture's connections instead of terminating closing clients.
    await expect
      .poll(async () =>
        Number(
          (
            await admin.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=$1",
              [database],
            )
          ).rows[0].count,
        ),
      )
      .toBe(0);
    await admin.query('DROP DATABASE "' + database + '"');
    await admin.end();
  }
});
