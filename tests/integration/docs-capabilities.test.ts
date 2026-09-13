import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  createAgentEngine,
  parseConfig,
  type JsonObject,
  type ModelAdapter,
  type ModelRequest,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
import { createHttpChatTransport } from "@agent-runtime/chat-core";
import { createDocsCapabilities } from "../../examples/docs-site/capabilities.js";
import { createDocsSessionHistory } from "../../examples/docs-site/session-history.js";
import { startDocsRemoteCapabilities } from "../../examples/docs-site/remote-capabilities.js";
import {
  docsAssistant,
  docsBinding,
  startDocsSite,
} from "../../examples/docs-site/server.js";
import { loadArticles } from "../../examples/docs-site/content.js";
import {
  createKnowledge,
  loadProjectSnapshot,
} from "../../examples/docs-site/knowledge.js";
const closes: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const f of closes.splice(0).reverse()) await f();
});
async function fixture(model: ModelAdapter) {
  const articles = await loadArticles(),
    knowledge = createKnowledge(articles, await loadProjectSnapshot()),
    store = new MemoryStore(),
    key = randomBytes(32);
  const capabilities = createDocsCapabilities({
    articles,
    store,
    memoryKey: key,
  });
  const remote = await startDocsRemoteCapabilities(articles);
  const history = createDocsSessionHistory(store);
  closes.push(remote.close);
  const engine = await createAgentEngine({
    store: history.store,
    authorize: history.authorize,
    principal: { tenantId: "docs-site", subjectId: "host" },
    secrets: { resolve: async () => "synthetic-only" },
    adapters: { models: { scripted: model } },
    bindings: {
      "docs.search.v1": docsBinding(articles),
      ...knowledge.bindings,
      ...capabilities.bindings,
      ...history.bindings,
    },
    remoteContracts: remote.contracts,
    policy: {
      allowedOrigins: ["https://model.example.com", remote.origin],
      allowPrivateOrigins: [remote.origin],
    },
  });
  closes.push(() => engine.close());
  history.attachEngine(engine);
  const assistant = history.assistant(
    docsAssistant(
      {
        provider: "scripted",
        model: "test",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "test" },
        limits: { contextWindowTokens: 64000, maxOutputTokens: 1500 },
      },
      knowledge,
    ),
  );
  const config = parseConfig(assistant.config);
  config.tools.push(...remote.tools);
  assistant.config = config;
  const host = await startDocsSite({
    articles,
    knowledge,
    engine,
    assistant,
    capabilities,
    cookieSecret: "synthetic-cookie-key",
    port: 0,
  });
  closes.push(host.close);
  async function transport() {
    const response = await fetch(host.url + "/ai/");
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    return {
      cookie,
      client: createHttpChatTransport({
        baseURL: host.url + "/api/agent-chat",
        headers: () => ({ cookie, origin: host.url }),
      }),
    };
  }
  return { engine, store, key, capabilities, host, transport };
}
async function finished(
  client: ReturnType<typeof createHttpChatTransport>,
  id: string,
) {
  await expect
    .poll(async () => (await client.readSession(id)).runs.at(-1)?.state, {
      timeout: 10000,
    })
    .toMatch(/^(completed|failed|cancelled)$/);
  const run = (await client.readSession(id)).runs.at(-1)!;
  expect(run.state, run.errorCode).toBe("completed");
  return run;
}
it("docs memory requires confirmation, persists across sessions, stays encrypted and isolated, and obeys read switches", async () => {
  const model = scriptedModel([
    toolCall("engine.memory.write.preferences", {
      id: "preference",
      content: "用户希望回答包含验收步骤",
      expectedVersion: null,
      evidenceRefs: ["user-request"],
    }),
    finalText("已保存"),
    finalText("按已有偏好回答"),
    finalText("没有读取新记忆"),
  ]);
  const f = await fixture(model),
    a = await f.transport(),
    b = await f.transport();
  const s = await a.client.createSession({
    assistantId: "docs",
    requestId: randomUUID(),
  });
  await a.client.sendMessage(s.id, {
    requestId: randomUUID(),
    input: "请记住我的偏好",
  });
  await expect
    .poll(
      async () =>
        (await a.client.readSession(s.id)).runs.at(-1)?.process?.pending?.kind,
    )
    .toBe("permission");
  const pending = (await a.client.readSession(s.id)).runs.at(-1)!.process!
    .pending!;
  expect(pending.details).toContain("验收步骤");
  await expect(
    b.client.resolveInput!(s.id, {
      id: pending.id!,
      kind: "permission",
      decision: "allow_once",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await f.store.transaction((tx) => tx.list("docs_memory_v1")),
  ).toHaveLength(0);
  await a.client.resolveInput!(s.id, {
    id: pending.id!,
    kind: "permission",
    decision: "allow_once",
  });
  await finished(a.client, s.id);
  await a.client.resolveInput!(s.id, {
    id: pending.id!,
    kind: "permission",
    decision: "allow_once",
  });
  const owner = (
    await f.engine.options.store.transaction((tx) =>
      tx.get<any>("sessions", s.id),
    )
  ).principal;
  expect((await f.capabilities.list(owner))[0]?.content).toContain("验收步骤");
  expect(
    JSON.stringify(
      await f.store.transaction((tx) => tx.list("docs_memory_v1")),
    ),
  ).not.toContain("验收步骤");
  expect(
    await createDocsCapabilities({
      articles: await loadArticles(),
      store: f.store,
      memoryKey: f.key,
    }).list(owner),
  ).toHaveLength(1);
  const other = await b.client.createSession({
    assistantId: "docs",
    requestId: randomUUID(),
  });
  const otherOwner = (
    await f.store.transaction((tx) => tx.get<any>("sessions", other.id))
  ).principal;
  expect(await f.capabilities.list(otherOwner)).toEqual([]);
  const next = await a.client.createSession({
    assistantId: "docs",
    requestId: randomUUID(),
  });
  await a.client.sendMessage(next.id, {
    requestId: randomUUID(),
    input: "你记得我的偏好吗",
  });
  await finished(a.client, next.id);
  expect(JSON.stringify(model.requests[2]!.messages)).toContain("验收步骤");
  const settings = await a.client.readSettings!(next.id);
  settings.preferences.memory[0]!.read = false;
  await a.client.updateSettings!(next.id, {
    ifVersion: settings.configVersion,
    preferences: settings.preferences,
  });
  await a.client.sendMessage(next.id, {
    requestId: randomUUID(),
    input: "继续",
  });
  await finished(a.client, next.id);
  expect(
    model.requests[3]!.tools.some(
      (t) => t.name === "engine.memory.read.preferences",
    ),
  ).toBe(false);
  expect(
    model.requests[3]!.tools.some(
      (t) => t.name === "engine.memory.write.preferences",
    ),
  ).toBe(true);
  await f.capabilities.remove(owner, "preference", "1");
  expect(await f.capabilities.list(owner)).toEqual([]);
});
it("docs Skills, formal knowledge and real HTTP/MCP run through Engine contracts", async () => {
  const model = scriptedModel([
    toolCall("engine.knowledge.manual", { query: "createSession" }),
    toolCall("docs.httpCatalog", {}),
    toolCall("docs.mcpSearch", { query: "工具" }),
    finalText("已检查"),
    finalText("已加载排错指南"),
  ]);
  const f = await fixture(model),
    a = await f.transport(),
    s = await a.client.createSession({
      assistantId: "docs",
      requestId: randomUUID(),
    });
  const settings = await a.client.readSettings!(s.id);
  expect(settings.skills).toHaveLength(2);
  expect(settings.knowledgeBases).toHaveLength(1);
  expect(settings.tools).toHaveLength(10);
  expect(settings.tools.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["sessions.search", "sessions.read"]),
  );
  await a.client.sendMessage(s.id, {
    requestId: randomUUID(),
    input: "核对接入",
    skillId: "integration-guide",
  });
  await finished(a.client, s.id);
  expect(JSON.stringify(model.requests[0]!.messages)).toContain("最小接入代码");
  expect(JSON.stringify(model.requests[1]!.messages)).toContain("sourceId");
  const events = await (
    await f.engine
      .forPrincipal(
        (await f.store.transaction((tx) => tx.get<any>("sessions", s.id)))
          .principal,
      )
      .loadSession(s.id)
  ).listEvents();
  expect(
    events.events.some((e) => e.type === "knowledge.search.completed"),
  ).toBe(true);
  expect(
    events.events
      .filter((e) => e.type === "tool.completed")
      .map((e) => (e as any).data.name),
  ).toEqual(
    expect.arrayContaining([
      "engine.knowledge.manual",
      "docs.httpCatalog",
      "docs.mcpSearch",
    ]),
  );
  await a.client.sendMessage(s.id, {
    requestId: randomUUID(),
    input: "帮我排错",
    skillId: "troubleshoot",
  });
  await finished(a.client, s.id);
  expect(JSON.stringify(model.requests[4]!.messages)).toContain("没有执行证据");
});
it("docs question and structured-input resolution validates schemas and idempotency", async () => {
  const model = scriptedModel([
    toolCall("engine.question", { question: "想先接入哪一部分？" }),
    finalText("收到回答"),
    toolCall("engine.form.integration", { question: "请填写接入需求" }),
    finalText("收到表单"),
  ]);
  const f = await fixture(model),
    a = await f.transport(),
    s = await a.client.createSession({
      assistantId: "docs",
      requestId: randomUUID(),
    });
  for (const [index, kind, answer] of [
    [0, "question", "后端"],
    [
      1,
      "structured_input",
      { target: "后端 SDK", language: "TypeScript", requirement: "支持工具" },
    ],
  ] as const) {
    await a.client.sendMessage(s.id, {
      requestId: randomUUID(),
      input: "帮我接入",
    });
    await expect
      .poll(
        async () =>
          (await a.client.readSession(s.id)).runs.at(-1)?.process?.pending
            ?.kind,
      )
      .toBe(kind);
    const p = (await a.client.readSession(s.id)).runs.at(-1)!.process!.pending!;
    await expect(
      a.client.resolveInput!(s.id, { id: p.id!, kind, answer: 99 }),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await a.client.resolveInput!(s.id, { id: p.id!, kind, answer });
    await finished(a.client, s.id);
    await a.client.resolveInput!(s.id, { id: p.id!, kind, answer });
    await expect(
      a.client.resolveInput!(s.id, { id: p.id!, kind, answer: "changed" }),
    ).rejects.toMatchObject({ code: "INPUT_ALREADY_RESOLVED" });
  }
});

it("the HTTP settings catalog exposes both history tools and disabling them removes them from the model", async () => {
  const model = scriptedModel([finalText("已使用当前配置")]);
  const f = await fixture(model),
    a = await f.transport();
  const s = await a.client.createSession({
    assistantId: "docs",
    requestId: randomUUID(),
  });
  const settings = await a.client.readSettings!(s.id);
  const history = ["sessions.search", "sessions.read"];
  expect(
    settings.tools.filter((t) => history.includes(t.name)).map((t) => t.label),
  ).toEqual(["搜索历史会话", "读取会话内容"]);
  expect(settings.preferences.enabledTools).toEqual(
    expect.arrayContaining(history),
  );
  settings.preferences.enabledTools = settings.preferences.enabledTools.filter(
    (name) => !history.includes(name),
  );
  await a.client.updateSettings!(s.id, {
    ifVersion: settings.configVersion,
    preferences: settings.preferences,
  });
  await a.client.sendMessage(s.id, { requestId: randomUUID(), input: "继续" });
  await finished(a.client, s.id);
  expect(model.requests[0]!.tools.some((t) => history.includes(t.name))).toBe(
    false,
  );
  expect(
    (await a.client.readSettings!(s.id)).preferences.enabledTools.some((name) =>
      history.includes(name),
    ),
  ).toBe(false);
});

it("workbench APIs authenticate ownership, enforce origin and CAS, and keep experiment requests idempotent", async () => {
  const f = await fixture(scriptedModel([finalText("调试会话")])),
    a = await f.transport(),
    b = await f.transport();
  const request = async (
    cookie: string,
    path: string,
    data?: unknown,
    origin = f.host.url,
  ) =>
    fetch(f.host.url + "/api/docs-capabilities" + path, {
      method: data ? "POST" : "GET",
      headers: {
        cookie,
        origin,
        "x-agent-chat": "1",
        "content-type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  expect((await fetch(f.host.url + "/api/docs-capabilities")).status).toBe(401);
  const catalog = await (await request(a.cookie, "")).json();
  expect(catalog.skills).toHaveLength(2);
  expect(catalog.experiments).toHaveLength(13);
  const s = await a.client.createSession({
    assistantId: "docs",
    requestId: randomUUID(),
  });
  await a.client.sendMessage(s.id, {
    requestId: randomUUID(),
    input: "调试会话",
  });
  await finished(a.client, s.id);
  expect((await request(b.cookie, "/sessions/" + s.id)).status).toBe(403);
  const debug = await (await request(a.cookie, "/sessions/" + s.id)).json();
  expect(debug.snapshot.runs).toHaveLength(1);
  expect(debug.snapshot.events.length).toBeGreaterThan(0);
  expect(JSON.stringify(debug)).not.toContain("synthetic-only");
  expect(
    (
      await request(
        a.cookie,
        "/sessions/" + s.id,
        { action: "delete" },
        "https://evil.invalid",
      )
    ).status,
  ).toBe(403);
  const payload = { id: "events", enabled: true, requestId: randomUUID() };
  expect((await request(a.cookie, "/experiments", payload)).status).toBe(202);
  expect((await request(a.cookie, "/experiments", payload)).status).toBe(202);
  await expect
    .poll(
      async () =>
        (
          await (
            await request(a.cookie, "/experiments/" + payload.requestId)
          ).json()
        ).state,
    )
    .toBe("completed");
  expect(
    (
      await (
        await request(a.cookie, "/experiments/" + payload.requestId)
      ).json()
    ).result.passed,
  ).toBe(true);
  expect(
    (await request(b.cookie, "/experiments/" + payload.requestId)).status,
  ).toBe(403);
  expect(
    (await request(a.cookie, "/experiments", { ...payload, enabled: false }))
      .status,
  ).toBe(409);
  expect(
    (await (await request(a.cookie, "/experiments")).json()).items,
  ).toHaveLength(1);
  expect(
    (await request(a.cookie, "/sessions/" + s.id, { action: "archive" }))
      .status,
  ).toBe(200);
  expect(
    (await request(a.cookie, "/sessions/" + s.id, { action: "unarchive" }))
      .status,
  ).toBe(200);
  expect(
    (await request(a.cookie, "/sessions/" + s.id, { action: "delete" })).status,
  ).toBe(200);
  expect((await request(a.cookie, "/sessions/" + s.id)).status).toBe(403);
});

it("parallel memory proposals show the exact pending proposal and stale deletes cannot remove recreated memory", async () => {
  const call = (id: string, content: string) => ({
    type: "tool_call" as const,
    id,
    name: "engine.memory.write.preferences",
    arguments: {
      id: "same",
      content,
      expectedVersion: null,
      evidenceRefs: ["user-request"],
    },
  });
  const model = scriptedModel([
    [
      {
        type: "completed",
        response: {
          stopReason: "tool_calls",
          blocks: [call("one", "第一条偏好"), call("two", "第二条偏好")],
        },
      },
    ],
    finalText("完成"),
    toolCall("engine.memory.write.preferences", {
      id: "same",
      content: "重新创建的偏好",
      expectedVersion: null,
      evidenceRefs: ["user-request"],
    }),
    finalText("完成"),
  ]);
  const f = await fixture(model),
    a = await f.transport(),
    s = await a.client.createSession({
      assistantId: "docs",
      requestId: randomUUID(),
    });
  await a.client.sendMessage(s.id, {
    requestId: randomUUID(),
    input: "保存两个偏好",
  });
  const pending = async () =>
    (await a.client.readSession(s.id)).runs.at(-1)?.process?.pending;
  await expect.poll(async () => (await pending())?.details).toBe("第一条偏好");
  await a.client.resolveInput!(s.id, {
    id: (await pending())!.id!,
    kind: "permission",
    decision: "allow_once",
  });
  await expect.poll(async () => (await pending())?.details).toBe("第二条偏好");
  await a.client.resolveInput!(s.id, {
    id: (await pending())!.id!,
    kind: "permission",
    decision: "deny",
  });
  await finished(a.client, s.id);
  const owner = (
    await f.store.transaction((tx) => tx.get<any>("sessions", s.id))
  ).principal;
  await f.capabilities.remove(owner, "same", "1");
  await a.client.sendMessage(s.id, {
    requestId: randomUUID(),
    input: "重新保存",
  });
  await expect
    .poll(async () => (await pending())?.details)
    .toBe("重新创建的偏好");
  await a.client.resolveInput!(s.id, {
    id: (await pending())!.id!,
    kind: "permission",
    decision: "allow_once",
  });
  await finished(a.client, s.id);
  await expect(f.capabilities.remove(owner, "same", "1")).rejects.toMatchObject(
    { code: "MEMORY_VERSION_CONFLICT" },
  );
  expect((await f.capabilities.list(owner))[0]?.version).toBe("2");
});

it("expired docs memory is hidden immediately and encrypted content is swept without losing its version", async () => {
  const f = await fixture(scriptedModel([])),
    principal = { tenantId: "docs-site", subjectId: "expiry-test" };
  const { createHash } = await import("node:crypto"),
    scope = createHash("sha256")
      .update(
        JSON.stringify([
          principal.tenantId,
          principal.subjectId,
          "docs-assistant",
        ]),
      )
      .digest("hex");
  await f.store.transaction((tx) =>
    tx.put("docs_memory_v1", scope + ":expired", {
      id: "expired",
      scope,
      version: "3",
      sealed: "expired-ciphertext",
      expiresAt: Date.now() - 1,
      updatedAt: 0,
    }),
  );
  expect(await f.capabilities.list(principal)).toEqual([]);
  const row = await f.store.transaction((tx) =>
    tx.get<any>("docs_memory_v1", scope + ":expired"),
  );
  expect(row.sealed).toBe("");
  expect(row.version).toBe("3");
});
