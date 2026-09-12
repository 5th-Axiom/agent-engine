import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  createAgentEngine,
  parseConfig,
  type ModelAdapter,
  type ModelRequest,
  type JsonValue,
  type SessionConfigInput,
} from "@agent-runtime/sdk";
import { MemoryStore, finalText } from "@agent-runtime/testing";
import {
  createChatHandler,
  restoreChatPreferences,
  type ChatAssistantDefinition,
} from "@agent-runtime/chat-server";
import {
  createHttpChatTransport,
  type ChatSettings,
} from "@agent-runtime/chat-core";
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
async function fixture() {
  let release = () => {},
    hold = false,
    reads = 0;
  const requests: ModelRequest[] = [];
  const model: ModelAdapter = {
    version: "settings",
    capabilities: { tools: true, thinking: true, structuredOutput: false },
    async *stream(req, ctx) {
      requests.push(req);
      if (hold) {
        await new Promise<void>((r) => {
          release = r;
          ctx.signal.addEventListener("abort", () => r(), { once: true });
        });
        hold = false;
      }
      yield* finalText("settings fixture answer");
    },
  };
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "u" },
    authorize: async () => true,
    secrets: { resolve: async () => "synthetic-settings-secret" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      lookup: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({ items: [] }),
      },
      memory: {
        version: "1",
        sideEffect: "write",
        namespace: "prefs.write",
        methods: { read: "read", write: "write" },
        execute: async (input): Promise<JsonValue> => {
          if ((input as any).method === "read") {
            reads++;
            return {
              items: [
                {
                  id: "language",
                  content: "SYNTHETIC_MEMORY_FACT",
                  version: "1",
                },
              ],
            };
          }
          return {
            id: "language",
            version: "2",
            receiptRef: "synthetic-receipt",
          };
        },
      },
      key: {
        version: "1",
        sideEffect: "read",
        execute: async () => "synthetic-business-key",
      },
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  closes.push(() => engine.close());
  closes.push(async () => release());
  const config: SessionConfigInput = {
    models: {
      primary: {
        provider: "scripted",
        model: "one",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "PRIVATE_MODEL_KEY" },
        thinking: { enabled: false, expose: "content" },
        limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
      },
      secondary: {
        provider: "scripted",
        model: "two",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "PRIVATE_MODEL_KEY" },
        limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
      },
    },
    routing: { primary: "primary" },
    tools: [
      {
        name: "lookup",
        description: "PRIVATE_TOOL_INSTRUCTIONS",
        inputSchema: { type: "object" },
        outputSchema: true,
        execution: {
          type: "binding",
          bindingKey: "lookup",
          sideEffect: "read",
        },
      },
      {
        name: "locked",
        description: "PRIVATE_LOCKED_INSTRUCTIONS",
        permission: "deny",
        inputSchema: { type: "object" },
        outputSchema: true,
        execution: {
          type: "binding",
          bindingKey: "lookup",
          sideEffect: "read",
        },
      },
    ],
    skills: [
      {
        id: "guide",
        name: "接入指导",
        description: "PRIVATE_SKILL_DESCRIPTION",
        instructions: "PRIVATE_SKILL_INSTRUCTIONS",
        allowedTools: ["lookup"],
      },
    ],
    knowledgeBases: [
      {
        id: "kb",
        name: "产品知识",
        description: "PRIVATE_KNOWLEDGE_DESCRIPTION",
        retriever: { type: "binding", bindingKey: "lookup" },
        querySchema: { type: "object" },
        resultSchema: true,
        citation: { required: false, outputPointer: "/citations" },
      },
    ],
    memory: {
      stores: [
        {
          id: "prefs",
          adapter: { type: "binding", bindingKey: "memory" },
          namespace: {
            tenantId: "t",
            subjectId: "u",
            agentId: "PRIVATE_AGENT_NAMESPACE",
          },
          read: { strategy: "semantic", topK: 3, maxTokens: 1000 },
          write: {
            strategy: "model-proposed-policy-approved",
            idempotency: {
              namespace: "prefs.write",
              businessKey: { type: "binding", bindingKey: "key" },
            },
          },
        },
      ],
    },
    permissions: { policy: { type: "binding", bindingKey: "policy" } },
    context: { compaction: { maxCyclesPerRun: 2 } },
  };
  const assistant: ChatAssistantDefinition = {
    id: "demo",
    label: "测试助手",
    settings: true,
    thinkingDisplay: "content",
    config,
    toolDisplay: { lookup: { label: "查找资料" } },
    memoryDisplay: { prefs: { label: "用户偏好" } },
  };
  let origin = "";
  const handler = createChatHandler({
    namespace: "settings",
    allowedOrigins: () => [origin],
    resolveContext: async (req) => ({
      engine: engine.forPrincipal({
        tenantId: "t",
        subjectId: String(req.headers["x-test-user"] ?? "u"),
      }),
      assistants: [assistant],
    }),
  });
  const server = createServer(async (req, res) => {
    if (!(await handler(req, res))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  closes.push(
    () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  );
  const transport = createHttpChatTransport({
    baseURL: origin + "/api/agent-chat",
    headers: () => ({ origin, "x-test-user": "u" }),
  });
  const session = await transport.createSession({
    requestId: randomUUID(),
    assistantId: "demo",
  });
  const raw = (
    path: string,
    body?: unknown,
    user = "u",
    customOrigin = origin,
  ) =>
    fetch(origin + "/api/agent-chat" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: customOrigin,
        "x-agent-chat": "1",
        "x-test-user": user,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    engine,
    transport,
    id: session.id,
    config,
    assistant,
    requests,
    raw,
    reads: () => reads,
    hold: () => {
      hold = true;
    },
    release: () => release(),
  };
}
it("publishes a bounded settings catalog and rejects privilege, identity, origin and config injection", async () => {
  const f = await fixture(),
    view = await f.transport.readSettings!(f.id);
  expect(view.preferences.enabledTools).toEqual(["lookup"]);
  expect(view.memoryStores).toEqual([
    { id: "prefs", label: "用户偏好", canRead: true, canWrite: true },
  ]);
  expect(JSON.stringify(view)).not.toMatch(
    /PRIVATE_|bindingKey|secretRef|baseURL|instructions/,
  );
  const route = `/sessions/${f.id}/settings`;
  for (const preferences of [
    { ...view.preferences, enabledTools: ["locked"] },
    { ...view.preferences, enabledSkills: ["injected"] },
    { ...view.preferences, modelId: "outside" },
    {
      ...view.preferences,
      memory: [{ id: "outside", read: true, write: true }],
    },
  ])
    expect((await f.raw(route, { ifVersion: 1, preferences })).status).toBe(
      409,
    );
  expect(
    (
      await f.raw(route, {
        ifVersion: 1,
        preferences: view.preferences,
        config: { instructions: { text: "INJECTION" } },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.raw(
        route,
        { ifVersion: 1, preferences: view.preferences },
        "u",
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect((await f.raw(route, undefined, "another-user")).status).toBe(403);
  f.assistant.settings = false;
  expect((await f.raw(route)).status).toBe(403);
});
it("applies switches to the next actual model request and memory read without changing an active run or another session", async () => {
  const f = await fixture(),
    original = await f.transport.readSettings!(f.id);
  f.hold();
  const first = await f.transport.sendMessage(f.id, {
    requestId: randomUUID(),
    input: "first",
  });
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.reads()).toBe(1);
  const off = {
    ...original.preferences,
    modelId: "secondary",
    enabledTools: [],
    enabledSkills: [],
    enabledKnowledgeBases: [],
    memory: [{ id: "prefs", read: false, write: false }],
    showThinking: false,
    compactContext: false,
  };
  const saved = await f.transport.updateSettings!(f.id, {
    ifVersion: original.configVersion,
    preferences: off,
  });
  expect(saved.active).toBe(true);
  const active = await f.engine.readRun(f.id, first.runId);
  expect(active.config.routing.primary).toBe("primary");
  expect(active.config.skills).toHaveLength(1);
  expect(active.config.memory.stores[0]!.read.strategy).toBe("semantic");
  f.release();
  await expect
    .poll(async () => (await f.engine.readRun(f.id, first.runId)).state)
    .toBe("completed");
  await expect(
    f.transport.sendMessage(f.id, {
      requestId: randomUUID(),
      input: "forbidden skill",
      skillId: "guide",
    }),
  ).rejects.toMatchObject({ code: "CHAT_SKILL_UNAVAILABLE" });
  const second = await f.transport.sendMessage(f.id, {
    requestId: randomUUID(),
    input: "second",
  });
  await expect
    .poll(async () => (await f.engine.readRun(f.id, second.runId)).state)
    .toBe("completed");
  expect(f.requests[1]!.model.model).toBe("two");
  expect(f.requests[1]!.tools).toEqual([]);
  expect(f.reads()).toBe(1);
  const stored = await f.engine.readRun(f.id, second.runId);
  expect(stored.config.context?.compaction?.maxCyclesPerRun).toBe(0);
  expect(stored.config.models.primary!.thinking?.expose).toBe("none");
  const sibling = await f.transport.createSession({
    requestId: randomUUID(),
    assistantId: "demo",
  });
  expect((await f.transport.readSettings!(sibling.id)).preferences).toEqual(
    original.preferences,
  );
  const restored = await f.transport.updateSettings!(f.id, {
    ifVersion: saved.configVersion,
    preferences: saved.defaults,
  });
  expect(restored.preferences).toEqual(original.preferences);
  const third = await f.transport.sendMessage(f.id, {
    requestId: randomUUID(),
    input: "third",
    skillId: "guide",
  });
  await expect
    .poll(async () => (await f.engine.readRun(f.id, third.runId)).state)
    .toBe("completed");
  expect(f.reads()).toBe(2);
  expect(
    f.requests[2]!.messages.some((m) =>
      m.content.includes("PRIVATE_SKILL_INSTRUCTIONS"),
    ),
  ).toBe(true);
});
it("rejects stale saves and archived changes, and preserves restrictions when the host catalog migrates", async () => {
  const f = await fixture(),
    view = await f.transport.readSettings!(f.id);
  const next = {
    ...view.preferences,
    enabledTools: [],
    enabledSkills: [],
    memory: [{ id: "prefs", read: false, write: false }],
  };
  const results = await Promise.allSettled([
    f.transport.updateSettings!(f.id, { ifVersion: 1, preferences: next }),
    f.transport.updateSettings!(f.id, { ifVersion: 1, preferences: next }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "CONFIG_VERSION_CONFLICT" },
  });
  const record = await f.engine.readSession(f.id),
    base = parseConfig(f.config);
  base.tools.push({ ...base.tools[0]!, name: "new-tool" });
  base.metadata = { docsAssistantVersion: "new" };
  const migrated = restoreChatPreferences(base, record.config);
  expect(migrated.tools.every((t) => t.permission === "deny")).toBe(true);
  expect(migrated.skills).toEqual([]);
  expect(migrated.memory.stores[0]!.read.strategy).toBe("none");
  expect(migrated.metadata?.docsAssistantVersion).toBe("new");
  await (await f.engine.loadSession(f.id)).archive();
  expect((await f.transport.readSettings!(f.id)).editable).toBe(false);
  await expect(
    f.transport.updateSettings!(f.id, { ifVersion: 2, preferences: next }),
  ).rejects.toMatchObject({ code: "SESSION_ARCHIVED" });
});

it("keeps legacy manual-only memory reads and lets read.enabled disable reading while retaining writes", async () => {
  const f = await fixture();
  const memory = f.config.memory!.stores[0]!;
  memory.read.strategy = "none";
  const legacy = await f.transport.createSession({
    requestId: randomUUID(),
    assistantId: "demo",
  });
  const first = await f.transport.sendMessage(legacy.id, {
    requestId: randomUUID(),
    input: "legacy manual memory",
  });
  await expect
    .poll(async () => (await f.engine.readRun(legacy.id, first.runId)).state)
    .toBe("completed");
  expect(f.reads()).toBe(0);
  expect(
    f.requests[0]!.tools.some((t) => t.name === "engine.memory.read.prefs"),
  ).toBe(true);
  memory.read.enabled = false;
  const writeOnly = await f.transport.createSession({
    requestId: randomUUID(),
    assistantId: "demo",
  });
  const second = await f.transport.sendMessage(writeOnly.id, {
    requestId: randomUUID(),
    input: "write only memory",
  });
  await expect
    .poll(
      async () => (await f.engine.readRun(writeOnly.id, second.runId)).state,
    )
    .toBe("completed");
  expect(f.reads()).toBe(0);
  expect(
    f.requests[1]!.tools.some((t) => t.name === "engine.memory.read.prefs"),
  ).toBe(false);
  expect(
    f.requests[1]!.tools.some((t) => t.name === "engine.memory.write.prefs"),
  ).toBe(true);
  const view = await f.transport.readSettings!(writeOnly.id);
  await expect(
    f.transport.updateSettings!(writeOnly.id, {
      ifVersion: view.configVersion,
      preferences: {
        ...view.preferences,
        memory: [{ id: "prefs", read: true, write: true }],
      },
    }),
  ).rejects.toMatchObject({ code: "CHAT_SETTINGS_UNAVAILABLE" });
});
