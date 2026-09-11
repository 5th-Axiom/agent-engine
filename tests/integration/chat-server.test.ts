import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  AgentEngineError,
  createAgentEngine,
  type ModelAdapter,
} from "@agent-runtime/sdk";
import { MemoryStore, scriptedModel, finalText } from "@agent-runtime/testing";
import {
  createChatHandler,
  ChatError,
  type ChatContext,
} from "@agent-runtime/chat-server";
const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const action of close.splice(0).reverse()) await action();
});
async function setup(
  model: ModelAdapter & { requests: unknown[] } = scriptedModel([
    [
      {
        type: "usage",
        usage: { input: 12, output: 3, total: 15 },
        mode: "snapshot",
        final: true,
      },
      ...finalText("合成回答"),
    ],
    finalText("续聊回答"),
  ]),
) {
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "host", subjectId: "host" },
    authorize: async () => true,
    secrets: { resolve: async () => "synthetic-private-key" },
    protocolKey: { secretRef: "PROTOCOL_SECRET" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  close.push(() => engine.close());
  const config = {
    models: {
      primary: {
        provider: "scripted",
        model: "synthetic-model",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "MODEL_SECRET" },
        limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
      },
    },
    routing: { primary: "primary" },
  };
  let disabled = false;
  let origin = "";
  const handler = createChatHandler({
    namespace: "test-chat",
    allowedOrigins: () => [origin],
    allowCredentials: true,
    resolveContext: async (req): Promise<ChatContext> => {
      // Synthetic authentication fixture. Real hosts must validate their own session or token.
      const user = req.headers["x-test-user"];
      if (typeof user !== "string")
        throw new ChatError("CHAT_UNAUTHENTICATED", 401);
      return {
        engine: engine.forPrincipal({ tenantId: "tenant", subjectId: user }),
        assistants: disabled
          ? [{ id: "other", label: "Other", config }]
          : [{ id: "demo", label: "Demo", config }],
        defaultAssistant: disabled ? "other" : "demo",
      };
    },
  });
  const server = createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  close.push(
    () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  );
  const request = (
    path: string,
    data?: unknown,
    user = "alice",
    extra: Record<string, string> = {},
  ) =>
    fetch(origin + "/api/agent-chat" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        origin,
        "x-test-user": user,
        ...(data === undefined
          ? {}
          : { "content-type": "application/json", "x-agent-chat": "1" }),
        ...extra,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  return { engine, origin, request, model, disable: () => (disabled = true) };
}
it("requires authentication and an allowed origin before model dispatch, with explicit preflight", async () => {
  const h = await setup();
  expect((await fetch(h.origin + "/api/agent-chat/config")).status).toBe(401);
  expect(
    (
      await h.request("/config", undefined, "alice", {
        origin: "https://evil.example",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await h.request(
        "/sessions",
        { requestId: randomUUID(), assistantId: "demo" },
        "alice",
        { "x-agent-chat": "" },
      )
    ).status,
  ).toBe(403);
  const preflight = await fetch(h.origin + "/api/agent-chat/sessions", {
    method: "OPTIONS",
    headers: { origin: h.origin, "access-control-request-method": "POST" },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe(h.origin);
  expect(h.model.requests).toHaveLength(0);
});
it("deduplicates accepted inputs, exposes only public data and isolates users and assistant grants", async () => {
  const h = await setup();
  const config = await (await h.request("/config")).text();
  expect(config).not.toContain("MODEL_SECRET");
  expect(config).not.toContain("baseURL");
  expect(config).not.toContain("synthetic-private-key");
  const creation = { requestId: randomUUID(), assistantId: "demo" };
  const created = await (await h.request("/sessions", creation)).json();
  expect(await (await h.request("/sessions", creation)).json()).toEqual(
    created,
  );
  const input = { requestId: randomUUID(), input: "合成测试" };
  const sent = await (
    await h.request(`/sessions/${created.id}/runs`, input)
  ).json();
  expect(
    await (await h.request(`/sessions/${created.id}/runs`, input)).json(),
  ).toEqual(sent);
  let view;
  for (let i = 0; i < 50; i++) {
    view = await (await h.request("/sessions/" + created.id)).json();
    if (view.runs[0]?.state === "completed") break;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(view.runs[0]).toMatchObject({
    output: "合成回答",
    usage: { input: 12, output: 3, total: 15, complete: true },
  });
  expect(h.model.requests).toHaveLength(1);
  expect(JSON.stringify(view)).not.toMatch(
    /synthetic-private-key|MODEL_SECRET|native|signature/,
  );
  expect(
    (
      await h.request(`/sessions/${created.id}/runs`, {
        ...input,
        input: "不同输入",
      })
    ).status,
  ).toBe(409);
  expect(await (await h.request("/sessions", undefined, "bob")).json()).toEqual(
    [],
  );
  expect(
    (await h.request("/sessions/" + created.id, undefined, "bob")).status,
  ).toBe(403);
  expect(
    (
      await h.request(
        `/sessions/${created.id}/cancel`,
        { runId: sent.runId },
        "bob",
      )
    ).status,
  ).toBe(403);
  h.disable();
  expect(await (await h.request("/sessions")).json()).toEqual([]);
  expect(
    (
      await h.request(`/sessions/${created.id}/runs`, {
        requestId: randomUUID(),
        input: "不能继续",
      })
    ).status,
  ).toBe(403);
});
it("rejects browser-provided identity, model settings and empty messages before execution", async () => {
  const h = await setup();
  for (const extra of [
    { principal: { subjectId: "admin" } },
    { config: {} },
    { tools: [] },
  ])
    expect(
      (
        await h.request("/sessions", {
          requestId: randomUUID(),
          assistantId: "demo",
          ...extra,
        })
      ).status,
    ).toBe(400);
  expect(
    (
      await h.request("/sessions", {
        requestId: randomUUID(),
        assistantId: "unknown",
      })
    ).status,
  ).toBe(403);
  const created = await (
    await h.request("/sessions", {
      requestId: randomUUID(),
      assistantId: "demo",
    })
  ).json();
  for (const input of [" ", "x".repeat(8001)])
    expect(
      (
        await h.request(`/sessions/${created.id}/runs`, {
          requestId: randomUUID(),
          input,
        })
      ).status,
    ).toBe(400);
  expect(h.model.requests).toHaveLength(0);
});

it("omits private thinking, native protocol and provider errors from actual HTTP projections", async () => {
  const model = scriptedModel([
    [
      {
        type: "completed",
        response: {
          blocks: [{ type: "thinking" }, { type: "text", text: "公开回答" }],
          stopReason: "final",
          native: {
            content: [
              {
                type: "thinking",
                thinking: "private-native-thought",
                signature: "private-signature",
              },
            ],
          },
        },
      },
    ],
    [
      {
        type: "failed",
        error: new AgentEngineError(
          "MODEL_PROVIDER_ERROR",
          "private-provider-body",
        ),
      },
    ],
  ]);
  const h = await setup(model);
  const { id } = await (
    await h.request("/sessions", {
      requestId: randomUUID(),
      assistantId: "demo",
    })
  ).json();
  await h.request(`/sessions/${id}/runs`, {
    requestId: randomUUID(),
    input: "第一轮",
  });
  await expect
    .poll(
      async () =>
        (await (await h.request(`/sessions/${id}`)).json()).runs[0]?.state,
    )
    .toBe("completed");
  await h.request(`/sessions/${id}/runs`, {
    requestId: randomUUID(),
    input: "第二轮",
  });
  await expect
    .poll(
      async () =>
        (await (await h.request(`/sessions/${id}`)).json()).runs[1]?.state,
    )
    .toBe("failed");
  const view = await (await h.request(`/sessions/${id}`)).json();
  expect(view.runs[0].output).toBe("公开回答");
  expect(view.runs[1].errorCode).toBe("MODEL_PROVIDER_ERROR");
  expect(JSON.stringify(view)).not.toMatch(
    /private-native-thought|private-signature|private-provider-body|MODEL_SECRET|PROTOCOL_SECRET|encrypted|apiKey/,
  );
});

it("finds this chat namespace even when 500 newer sessions belong to another namespace", async () => {
  const h = await setup();
  const created = (await (
    await h.request("/sessions", {
      requestId: randomUUID(),
      assistantId: "demo",
    })
  ).json()) as { id: string };
  const scoped = h.engine.forPrincipal({
    tenantId: "tenant",
    subjectId: "alice",
  });
  const original = await scoped.readSession(created.id);
  // Store fixture isolates the bridge's pagination from the separately tested create API.
  await h.engine.options.store.transaction(async (tx) => {
    for (let i = 0; i < 500; i++) {
      const copy = structuredClone(original);
      copy.id = randomUUID();
      copy.createdAt = original.createdAt! + i + 1;
      copy.config.metadata = {
        agentChat: { namespace: "another-app", assistantId: "demo" },
      };
      await tx.put("sessions", copy.id, copy);
    }
  });
  const response = await h.request("/sessions");
  expect(response.status).toBe(200);
  expect((await response.json()).map((s: { id: string }) => s.id)).toEqual([
    created.id,
  ]);
});
