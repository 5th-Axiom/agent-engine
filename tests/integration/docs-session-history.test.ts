import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, expect, it } from "vitest";
import {
  createAgentEngine,
  PostgresStore,
  parseConfig,
  type AgentEngine,
  type BindingContext,
  type EngineOptions,
  type EngineStore,
  type JsonObject,
  type JsonValue,
  type ModelMessage,
  type SessionRecord,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
  FaultInjector,
} from "@agent-runtime/testing";
import { createDocsSessionHistory } from "../../examples/docs-site/session-history.js";

const principal = { tenantId: "docs-site", subjectId: "synthetic-owner" };
const base = {
  id: "docs",
  label: "文档助手",
  config: {
    models: {
      p: {
        provider: "fake",
        model: "test",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "test" },
        limits: { contextWindowTokens: 64000, maxOutputTokens: 1000 },
      },
    },
    routing: { primary: "p" },
    metadata: {
      agentChat: { namespace: "agent-engine-docs", assistantId: "docs" },
    },
  },
};
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
async function boot(
  model: ReturnType<typeof scriptedModel>,
  store: EngineStore = new MemoryStore(),
  overrides: Partial<EngineOptions> = {},
) {
  const history = createDocsSessionHistory(store),
    denied = new Set<string>();
  const engine = await createAgentEngine({
    store: history.store,
    principal,
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { fake: model } },
    bindings: history.bindings,
    policy: { allowedOrigins: ["https://model.example.com"] },
    ...overrides,
    authorize: async (request) =>
      !denied.has(request.resource) && (await history.authorize(request)),
  });
  history.attachEngine(engine);
  const config = parseConfig(history.assistant(base).config);
  async function seed(
    messages: ModelMessage[],
    patch: Partial<SessionRecord> = {},
  ) {
    const session = await engine.createSession({ config });
    await store.transaction(async (tx) => {
      const record = (await tx.get<SessionRecord>("sessions", session.id))!;
      await tx.put("sessions", session.id, {
        ...record,
        history: messages,
        ...patch,
      });
    });
    return session;
  }
  async function caller() {
    const session = await engine.createSession({ config });
    const result = await session.run({ input: "synthetic caller" });
    return {
      session,
      call: (
        name: "search" | "read",
        input: JsonValue,
        patch: Partial<BindingContext> = {},
      ) =>
        history.bindings["sessions." + name + ".v1"]!.execute(input, {
          principal,
          runId: result.runId,
          context: {},
          signal: new AbortController().signal,
          operationId: randomUUID(),
          idempotencyKey: "synthetic",
          ...patch,
        }) as Promise<any>,
    };
  }
  return { engine, store, history, config, denied, seed, caller };
}
async function fixture(model = scriptedModel([finalText("ready")])) {
  const f = await boot(model);
  closes.push(() => f.engine.close());
  return f;
}
const observation = (messages: ModelMessage[]) =>
  JSON.parse(messages.findLast((m) => m.role === "tool")!.content);

it("the model searches another conversation, reads original messages and answers from the actual tool result", async () => {
  let sourceId = "";
  const observations: any[] = [];
  const model = scriptedModel([
    finalText("好的，合成项目代号为青柠，约定端口为 7319。"),
    toolCall("sessions.search", { query: "青柠" }),
    (request) => {
      const result = observation(request.messages);
      observations.push(result);
      return toolCall(
        "sessions.read",
        { sessionId: result.items?.[0]?.sessionId ?? sourceId },
        "read",
      );
    },
    (request) => {
      const result = observation(request.messages);
      observations.push(result);
      return finalText("先前的青柠会话约定使用端口 7319。");
    },
  ]);
  const f = await fixture(model),
    source = await f.engine.createSession({ config: f.config });
  sourceId = source.id;
  await source.run({ input: "青柠项目的约定端口是 7319。" });
  const target = await f.engine.createSession({ config: f.config });
  expect(
    (await target.run({ input: "另一个会话中青柠用哪个端口？" })).outputText,
  ).toContain("7319");
  expect(observations[0]).toMatchObject({ items: [{ sessionId: sourceId }] });
  expect(observations[1].messages.map((m: any) => m.role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(observations[1].messages[0].content).toContain("7319");
  expect(
    model.requests[1]!.messages.some((m) => m.content.includes("7319")),
  ).toBe(false);
  const view = await f.engine.inspectSession(target.id);
  expect(view.operations.map((o) => o.name)).toEqual([
    "sessions.search",
    "sessions.read",
  ]);
  expect(view.operations.every((o) => o.executionStatus === "succeeded")).toBe(
    true,
  );
  expect(
    JSON.stringify(
      await f.store.transaction((tx) => tx.list("docs_history_sources_v1")),
    ),
  ).not.toContain("7319");
});

it("isolates principals and docs namespaces, rejects removed/expired sources, and never returns hidden payloads", async () => {
  const f = await fixture(),
    c = await f.caller();
  const visible = await f.seed([
    { role: "system", content: "hidden-system" },
    { role: "user", content: "needle public" },
    {
      role: "assistant",
      content: "public answer",
      native: { hidden: "hidden-native" } as any,
      blocks: [{ type: "thinking", text: "hidden-thinking" }] as any,
    },
    { role: "tool", content: "hidden-tool" },
    { role: "user", content: "", images: [{ bytes: "hidden-image" }] as any },
  ]);
  const foreign = await f.seed([{ role: "user", content: "needle foreign" }], {
    principal: { ...principal, subjectId: "someone-else" },
  });
  const tenant = await f.seed([{ role: "user", content: "needle tenant" }], {
    principal: { ...principal, tenantId: "another" },
  });
  const wrong = await f.seed([{ role: "user", content: "needle namespace" }], {
    config: { ...f.config, metadata: {} },
  });
  const expired = await f.seed([{ role: "user", content: "needle expired" }], {
    expiresAt: Date.now() - 1,
  });
  const deleted = await f.seed([{ role: "user", content: "needle deleted" }]);
  await f.engine.deleteSession(deleted.id);
  const revoked = await f.seed([{ role: "user", content: "needle revoked" }]);
  f.denied.add(revoked.id);
  const results = await c.call("search", { query: "needle", limit: 10 });
  expect(results.items.map((item: any) => item.sessionId)).toEqual([
    visible.id,
  ]);
  for (const session of [foreign, tenant, wrong, expired, deleted, revoked]) {
    await expect(
      c.call("read", { sessionId: session.id }),
    ).rejects.toMatchObject({
      code: session === expired ? "DATA_RETENTION_EXPIRED" : "ACCESS_DENIED",
    });
  }
  await expect(c.call("search", { after: foreign.id })).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await expect(
    c.call("read", { sessionId: visible.id, principal }),
  ).rejects.toThrow();
  await expect(
    c.call(
      "read",
      { sessionId: visible.id },
      { principal: { ...principal, subjectId: "someone-else" } },
    ),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const read = await c.call("read", { sessionId: visible.id });
  expect(read.messages.map((m: any) => m.content)).toEqual([
    "needle public",
    "public answer",
    "",
  ]);
  expect(read.messages[2].imageCount).toBe(1);
  expect(JSON.stringify(read)).not.toContain("hidden-");
  await expect(
    c.call("search", {}, { signal: AbortSignal.abort() }),
  ).rejects.toThrow();
});

it("search pagination continues past empty pages and includes readable archived conversations", async () => {
  const f = await fixture(),
    c = await f.caller();
  const wanted = await f.seed([{ role: "user", content: "needle oldest" }], {
    createdAt: Date.now() - 1000,
    archived: true,
  });
  for (let n = 0; n < 26; n++)
    await f.seed([{ role: "user", content: "unrelated" }]);
  const first = await c.call("search", { query: "needle" });
  expect(first.items).toEqual([]);
  expect(first.scanned).toBe(25);
  expect(first.nextCursor).toBeTruthy();
  const second = await c.call("search", {
    query: "needle",
    after: first.nextCursor,
  });
  expect(second.items).toEqual([
    expect.objectContaining({ sessionId: wanted.id, archived: true }),
  ]);
  expect(second.nextCursor).toBeNull();
  const seen = new Set<string>();
  let after: string | null = null;
  do {
    const page = await c.call("search", {
      query: "",
      limit: 3,
      ...(after ? { after } : {}),
    });
    expect(page.items.length).toBeLessThanOrEqual(3);
    for (const item of page.items) {
      expect(seen.has(item.sessionId)).toBe(false);
      seen.add(item.sessionId);
    }
    after = page.nextCursor;
  } while (after);
  expect(seen.size).toBe(27);
  expect(seen.has(c.session.id)).toBe(false);
});

it("reads long Unicode conversations losslessly in bounded pages, freezes the end, and rejects forged cursors", async () => {
  const f = await fixture(),
    c = await f.caller();
  const texts = [
    "甲".repeat(5999) + "🙂" + "乙".repeat(6100),
    ...Array.from({ length: 24 }, (_, n) => "message-" + n),
  ];
  const source = await f.seed(
    texts.map((content, i) => ({
      role: i % 2 ? "assistant" : "user",
      content,
    })),
  );
  let page = await c.call("read", { sessionId: source.id });
  const initialCursor = page.nextCursor;
  expect(page.messages[0].content).toBe("甲".repeat(5999));
  await f.store.transaction(async (tx) => {
    const record = (await tx.get<SessionRecord>("sessions", source.id))!;
    record.history.push({ role: "user", content: "appended later" });
    await tx.put("sessions", source.id, record);
  });
  const joined: string[] = [];
  let pages = 0;
  while (true) {
    pages++;
    expect(pages).toBeLessThan(10);
    expect(page.messages.length).toBeLessThanOrEqual(20);
    expect(
      page.messages.reduce((n: number, m: any) => n + m.content.length, 0),
    ).toBeLessThanOrEqual(6000);
    expect(page.totalMessages).toBe(texts.length);
    for (const m of page.messages) {
      expect(m.startOffset).toBe((joined[m.index] ?? "").length);
      joined[m.index] = (joined[m.index] ?? "") + m.content;
    }
    if (!page.nextCursor) break;
    page = await c.call("read", {
      sessionId: source.id,
      cursor: page.nextCursor,
    });
  }
  expect(joined).toEqual(texts);
  const cursor = JSON.parse(Buffer.from(initialCursor, "base64url").toString());
  for (const bad of [
    "not-json",
    ...[
      { ...cursor, sessionId: randomUUID() },
      { ...cursor, offset: 999999 },
      { ...cursor, index: cursor.through + 1 },
      { ...cursor, offset: 6000 },
    ].map((c) => Buffer.from(JSON.stringify(c)).toString("base64url")),
  ]) {
    await expect(
      c.call("read", { sessionId: source.id, cursor: bad }),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  }
});

it.each(["revoked", "deleted", "expired"])(
  "a %s source also blocks derived conversation reads and subsequent model dispatch",
  async (reason) => {
    let sourceId = "";
    const model = scriptedModel([
      (request) => toolCall("sessions.read", { sessionId: sourceId }),
      finalText("derived answer"),
      finalText("must not run"),
    ]);
    const f = await fixture(model),
      source = await f.seed([
        { role: "user", content: "synthetic source fact" },
      ]);
    sourceId = source.id;
    const target = await f.engine.createSession({ config: f.config });
    await target.run({ input: "read earlier" });
    expect(
      (await f.engine.readSession(target.id)).history.length,
    ).toBeGreaterThan(0);
    if (reason === "revoked") f.denied.add(source.id);
    if (reason === "deleted") await f.engine.deleteSession(source.id);
    if (reason === "expired")
      await f.store.transaction(async (tx) => {
        const record = (await tx.get<SessionRecord>("sessions", source.id))!;
        await tx.put("sessions", source.id, {
          ...record,
          expiresAt: Date.now() - 1,
        });
      });
    await expect(f.engine.readSession(target.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(f.engine.readSessionView(target.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(target.run({ input: "continue" })).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(model.requests).toHaveLength(2);
  },
);

it("mutually referenced conversations remain readable without recursive deadlock", async () => {
  let aId = "",
    bId = "";
  const model = scriptedModel([
    () => toolCall("sessions.read", { sessionId: aId }),
    finalText("B read A"),
    () => toolCall("sessions.read", { sessionId: bId }),
    finalText("A read B"),
  ]);
  const f = await fixture(model),
    a = await f.seed([{ role: "user", content: "A original" }]);
  aId = a.id;
  const b = await f.engine.createSession({ config: f.config });
  bId = b.id;
  await b.run({ input: "read A" });
  await a.run({ input: "read B" });
  expect((await f.engine.readSession(a.id)).id).toBe(a.id);
  expect((await f.engine.readSession(b.id)).id).toBe(b.id);
});

it("rechecks source grants in the current commit snapshot and fails closed when provenance is missing", async () => {
  let sourceId = "";
  const f = await fixture(
    scriptedModel([
      () => toolCall("sessions.read", { sessionId: sourceId }),
      finalText("derived"),
    ]),
  );
  const source = await f.seed([{ role: "user", content: "source" }]);
  sourceId = source.id;
  const target = await f.engine.createSession({ config: f.config });
  await target.run({ input: "read" });
  const operationId = (await f.engine.inspectSession(target.id)).operations[0]!
    .id;
  await expect(
    f.history.store.transaction(async (tx) => {
      const record = (await tx.get<SessionRecord>("sessions", source.id))!;
      await tx.put("sessions", source.id, { ...record, deleted: true });
      expect(
        await f.history.authorize({
          principal,
          action: "data",
          resource: "operation:" + operationId,
        }),
      ).toBe(false);
      throw new Error("roll back synthetic deletion");
    }),
  ).rejects.toThrow("roll back synthetic deletion");
  expect((await f.engine.readSession(target.id)).id).toBe(target.id);
  await f.store.transaction((tx) =>
    tx.remove("docs_history_sources_v1", operationId),
  );
  await expect(f.engine.readSession(target.id)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
});

it.each(["tool.after_execute", "tool.after_receipt"])(
  "PostgreSQL recovery at %s retains source authorization dependencies",
  async (point) => {
    const url = new URL(
      process.env.AGENT_TEST_DATABASE_URL ??
        "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
    );
    const name = "docs_history_" + randomUUID().replaceAll("-", "");
    url.pathname = "/postgres";
    const admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query('CREATE DATABASE "' + name + '"');
    url.pathname = "/" + name;
    let engine: AgentEngine | undefined;
    try {
      const faults = new FaultInjector();
      faults.arm(point);
      let reached!: () => void;
      const hit = new Promise<void>((resolve) => (reached = resolve));
      let sourceId = "";
      const model = scriptedModel([
        () => toolCall("sessions.read", { sessionId: sourceId }),
        (request) => {
          expect(observation(request.messages).messages[0].content).toBe(
            "synthetic restart source",
          );
          return finalText("recovered answer");
        },
      ]);
      const firstStore = PostgresStore.fromConnectionString(url.toString());
      await firstStore.migrate();
      const first = await boot(model, firstStore, {
        fault: (p) => {
          if (p === point) {
            reached();
            faults.hit(p);
          }
        },
      });
      engine = first.engine;
      const source = await first.seed([
        { role: "user", content: "synthetic restart source" },
      ]);
      sourceId = source.id;
      const target = await engine.createSession({ config: first.config });
      const input = { requestId: "same-request", input: "read source" };
      const handle = await target.startRun(input);
      handle.result.catch(() => {});
      await hit;
      await engine.close();
      engine = undefined;
      const second = await boot(
        model,
        PostgresStore.fromConnectionString(url.toString()),
      );
      engine = second.engine;
      const restored = await engine.loadSession(target.id);
      expect((await (await restored.startRun(input)).result).outputText).toBe(
        "recovered answer",
      );
      expect(model.requests).toHaveLength(2);
      expect((await engine.inspectSession(target.id)).operations).toHaveLength(
        1,
      );
      const refs = await second.store.transaction((tx) =>
        tx.list<JsonObject>("docs_history_sources_v1"),
      );
      expect(refs).toHaveLength(1);
      expect(refs[0]!.sessionIds).toEqual([source.id]);
      second.denied.add(source.id);
      await expect(engine.readSession(target.id)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      expect(model.requests).toHaveLength(2);
    } finally {
      await engine?.close();
      await admin.query('DROP DATABASE "' + name + '"');
      await admin.end();
    }
  },
);
