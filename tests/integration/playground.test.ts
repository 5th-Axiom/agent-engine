import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import {
  createAgentEngine,
  AgentEngineError,
  type ModelAdapter,
  type ModelStreamEvent,
  type StoreTransaction,
  type RunRecord,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import {
  startPlayground,
  inventoryBinding,
} from "../../examples/playground/server.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});
const usage: ModelStreamEvent = {
  type: "usage",
  mode: "snapshot",
  final: true,
  usage: { input: 20, output: 4, total: 24 },
};
class UnorderedMemoryStore extends MemoryStore {
  override transaction<T>(
    fn: (tx: StoreTransaction) => Promise<T>,
  ): Promise<T> {
    return super.transaction((tx) =>
      fn({
        ...tx,
        list: async <R>(table: string) => (await tx.list<R>(table)).reverse(),
      }),
    );
  }
}
async function setup(
  model: ModelAdapter = scriptedModel([[usage, ...finalText("合成回答")]]),
) {
  const engine = await createAgentEngine({
    store: new UnorderedMemoryStore(),
    principal: { tenantId: "local", subjectId: "tester" },
    secrets: { resolve: async () => "synthetic-private-secret-never-browser" },
    protocolKey: { secretRef: "PROTOCOL" },
    adapters: { models: { test: model } },
    bindings: { "playground.inventory": inventoryBinding },
    policy: { allowedOrigins: ["https://example.invalid"] },
  });
  closers.push(() => engine.close());
  const profile = {
    profileName: "test-model",
    model: {
      provider: "test",
      baseURL: "https://example.invalid/v1",
      model: "synthetic",
      apiKey: { secretRef: "MODEL_SECRET" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 256 },
    },
  };
  const host = await startPlayground({
    engine,
    profiles: [profile],
    defaultProfile: profile.profileName,
    debugSecretRef: "debug",
    port: 0,
  });
  closers.push(() => host.close());
  const root = await fetch(host.url);
  const cookie = root.headers.get("set-cookie")!.split(";")[0]!;
  const headers = {
    cookie,
    origin: host.url,
    "content-type": "application/json",
    "x-agent-playground": "1",
  };
  const get = async (path: string) =>
    (await fetch(host.url + path, { headers })).json();
  const post = async (path: string, value: unknown) =>
    fetch(host.url + path, {
      method: "POST",
      headers,
      body: JSON.stringify(value),
    });
  const create = async (scenario = "chat") => {
    const response = await post("/api/sessions", {
      requestId: randomUUID(),
      profile: profile.profileName,
      scenario,
    });
    expect(response.status).toBe(201);
    return (await response.json()).id as string;
  };
  return { engine, host, headers, get, post, create };
}

it("local host rejects unauthenticated, cross-origin and rebinding requests before model dispatch", async () => {
  const model = scriptedModel([]);
  const f = await setup(model);
  expect((await fetch(f.host.url + "/api/config")).status).toBe(401);
  expect(
    (await fetch(f.host.url, { headers: { "sec-fetch-site": "cross-site" } }))
      .status,
  ).toBe(403);
  const rebindingStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      request(f.host.url, { headers: { host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
        .on("error", reject)
        .end();
    },
  );
  expect(rebindingStatus).toBe(403);
  expect(
    (
      await fetch(f.host.url + "/api/sessions", {
        method: "POST",
        headers: { ...f.headers, origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(f.host.url + "/api/sessions", {
        method: "POST",
        headers: { ...f.headers, "x-agent-playground": "" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(f.host.url + "/api/config", {
        headers: { cookie: "agent_playground=" + "测".repeat(64) },
      }).catch(() => ({ status: 401 }))
    ).status,
  ).toBe(401);
  expect(model.requests).toHaveLength(0);
});

it("creates idempotent sessions and runs, persists a tool round trip and links read-only Debug", async () => {
  const model = scriptedModel([
    [usage, ...toolCall("demo.inventory", { sku: "DEMO-1" })],
    [usage, ...finalText("合成库存为 24 件。")],
    [usage, ...finalText("比刚才多 1 件是 25 件。")],
  ]);
  const f = await setup(model);
  const request = {
    requestId: randomUUID(),
    profile: "test-model",
    scenario: "tool",
  };
  const a = await (await f.post("/api/sessions", request)).json();
  const b = await (await f.post("/api/sessions", request)).json();
  expect(a.id).toBe(b.id);
  const input = { requestId: randomUUID(), input: "查询 DEMO-1" };
  const run = await (await f.post(`/api/sessions/${a.id}/runs`, input)).json();
  const repeat = await (
    await f.post(`/api/sessions/${a.id}/runs`, input)
  ).json();
  expect(repeat.runId).toBe(run.runId);
  await expect
    .poll(async () => (await f.get(`/api/sessions/${a.id}`)).runs[0]?.state)
    .toBe("completed");
  const view = await f.get(`/api/sessions/${a.id}`);
  expect(view.runs[0].output).toContain("24");
  expect(view.runs[0].operations[0]).toMatchObject({
    name: "demo.inventory",
    state: "succeeded",
    validation: "valid",
  });
  expect(view.runs[0].usage.complete).toBe(true);
  expect(view.runs[0].usage.knownTotals.total).toBe(48);
  await f.post(`/api/sessions/${a.id}/runs`, {
    requestId: randomUUID(),
    input: "再加一件呢？",
  });
  await expect
    .poll(async () => (await f.get(`/api/sessions/${a.id}`)).runs[1]?.state)
    .toBe("completed");
  expect(JSON.stringify(model.requests[2]?.messages)).toContain("24");
  const config = JSON.stringify(await f.get("/api/config"));
  for (const value of [
    "MODEL_SECRET",
    "synthetic-private-secret-never-browser",
    "baseURL",
  ])
    expect(config).not.toContain(value);
  const debug = await fetch(f.host.url + view.debugURL, { headers: f.headers });
  expect(debug.status).toBe(200);
  const html = await debug.text();
  expect(html).toContain('href="/debug/"');
  expect(html).toContain("返回本地测试");
  expect(html).not.toContain("查询 DEMO-1");
  expect(debug.headers.get("content-security-policy")).toContain(
    "style-src 'unsafe-inline'",
  );
  expect((await f.post(view.debugURL, {})).status).toBe(405);
});

it("rejects unapproved model configuration and invalid inputs without dispatch", async () => {
  const model = scriptedModel([]);
  const f = await setup(model);
  expect(
    (
      await f.post("/api/sessions", {
        requestId: randomUUID(),
        profile: "arbitrary-provider",
        scenario: "chat",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.post("/api/sessions", {
        requestId: randomUUID(),
        profile: "test-model",
        scenario: "chat",
        baseURL: "https://evil.example",
      })
    ).status,
  ).toBe(400);
  const id = await f.create();
  for (const input of ["", "   ", "x".repeat(8001)])
    expect(
      (
        await f.post(`/api/sessions/${id}/runs`, {
          requestId: randomUUID(),
          input,
        })
      ).status,
    ).toBe(400);
  expect(model.requests).toHaveLength(0);
});

it("orders runs by durable acceptance sequence even for older records and unordered Store results", async () => {
  const f = await setup(
    scriptedModel([
      [usage, ...finalText("第一轮")],
      [usage, ...finalText("第二轮")],
    ]),
  );
  const id = await f.create();
  const session = await f.engine.loadSession(id);
  const a = await session.run({ input: "first" });
  const b = await session.run({ input: "second" });
  const ordered = await f.engine.inspectSession(id);
  expect(ordered.runs.map((r) => r.id)).toEqual([a.runId, b.runId]);
  expect(ordered.runs[0]!.acceptedSequence).toBeLessThan(
    ordered.runs[1]!.acceptedSequence!,
  );
  await f.engine.options.store.transaction(async (tx) => {
    for (const key of [a.runId, b.runId]) {
      const record = (await tx.get<RunRecord>("runs", key))!;
      delete record.acceptedSequence;
      await tx.put("runs", key, record);
    }
  });
  const legacy = await f.engine.inspectSession(id);
  expect(legacy.runs.map((r) => r.id)).toEqual([a.runId, b.runId]);
  const view = await f.get(`/api/sessions/${id}`);
  expect(view.runs.map((r: { output: string }) => r.output)).toEqual([
    "第一轮",
    "第二轮",
  ]);
});

it("shows a live draft, cancels durably and never treats it as a completed answer", async () => {
  const model = scriptedModel([]);
  model.stream = async function* (_request, ctx) {
    yield {
      type: "delta",
      blockId: "text",
      kind: "text",
      text: "未完成的合成草稿",
    };
    await new Promise<void>((resolve) => {
      if (ctx.signal.aborted) resolve();
      else
        ctx.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    ctx.signal.throwIfAborted();
  };
  const f = await setup(model);
  const id = await f.create();
  const run = await (
    await f.post(`/api/sessions/${id}/runs`, {
      requestId: randomUUID(),
      input: "等待取消",
    })
  ).json();
  await expect
    .poll(async () => (await f.get(`/api/sessions/${id}`)).runs[0]?.draft)
    .toContain("合成草稿");
  expect(
    (await f.post(`/api/sessions/${id}/cancel`, { runId: run.runId })).status,
  ).toBe(200);
  await expect
    .poll(async () => (await f.get(`/api/sessions/${id}`)).runs[0]?.state)
    .toBe("cancelled");
  const view = await f.get(`/api/sessions/${id}`);
  expect(view.runs[0].output).toBe("");
  expect(view.runs[0].draft).toBe("");
  expect(view.activeRun).toBeUndefined();
});

it("returns only safe error codes and excludes private native thinking", async () => {
  const model = scriptedModel([
    [
      {
        type: "completed",
        response: {
          blocks: [{ type: "thinking" }, { type: "text", text: "可见回答" }],
          stopReason: "final",
          native: {
            role: "assistant",
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
  const f = await setup(model);
  const id = await f.create();
  await f.post(`/api/sessions/${id}/runs`, {
    requestId: randomUUID(),
    input: "第一轮",
  });
  await expect
    .poll(async () => (await f.get(`/api/sessions/${id}`)).runs[0]?.state)
    .toBe("completed");
  await f.post(`/api/sessions/${id}/runs`, {
    requestId: randomUUID(),
    input: "第二轮",
  });
  await expect
    .poll(async () => (await f.get(`/api/sessions/${id}`)).runs[1]?.state)
    .toBe("failed");
  const view = await f.get(`/api/sessions/${id}`);
  expect(view.runs[1].error).toEqual({ code: "MODEL_PROVIDER_ERROR" });
  for (const value of [
    "private-native-thought",
    "private-signature",
    "private-provider-body",
    "MODEL_SECRET",
    "encrypted",
    "apiKey",
  ])
    expect(JSON.stringify(view)).not.toContain(value);
});
