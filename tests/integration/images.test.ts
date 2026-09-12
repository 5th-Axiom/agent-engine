import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  createAgentEngine,
  PostgresStore,
  defineBoundTool,
  imageAttachment,
  AgentEngineError,
  type EngineOptions,
} from "@agent-runtime/sdk";
import {
  FakeClock,
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import { z } from "zod";

// Synthetic one-pixel PNG. No user media or protocol payloads are used as fixtures.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
);
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const config = (
  provider = "scripted",
  origin = "https://model.example.com",
) => ({
  models: {
    primary: {
      provider,
      model: "vision-test",
      baseURL: origin,
      apiKey: { secretRef: "model" },
      capabilities: { images: true },
      limits: {
        contextWindowTokens: 100000,
        maxOutputTokens: 1000,
        maxImageInputTokens: 8192,
      },
    },
  },
  routing: { primary: "primary" },
});
async function setup(
  model = scriptedModel([finalText("ok"), finalText("again")]),
  extra: Partial<EngineOptions> = {},
) {
  model.capabilities.images = true;
  const store = extra.store ?? new MemoryStore();
  const options: EngineOptions = {
    store,
    principal: { tenantId: "images", subjectId: "one" },
    authorize: async () => true,
    secrets: { resolve: async () => "synthetic-encryption-key" },
    protocolKey: { secretRef: "protocol" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
    ...extra,
  };
  const engine = await createAgentEngine(options);
  cleanup.push(() => engine.close());
  return { engine, store, model, options };
}
it("image upload, retry, history and input idempotency preserve the same encrypted image", async () => {
  const model = scriptedModel([
    [
      {
        type: "failed",
        error: new AgentEngineError(
          "MODEL_RATE_LIMITED",
          "retry",
          true,
          "safe",
        ),
      },
    ],
    finalText("ok"),
    finalText("again"),
  ]);
  const { engine, store } = await setup(model);
  const ref = await engine.uploadImage({
    data: png,
    mediaType: "image/png",
    filename: "test.png",
  });
  expect((await engine.readImage(ref.attachmentId)).data).toEqual(png);
  const stored = await store.transaction((tx) => tx.list("images"));
  expect(JSON.stringify(stored)).not.toContain(png.toString("base64"));
  const session = await engine.createSession({ config: config() });
  const input = { input: "看图", attachments: [ref], requestId: randomUUID() };
  const result = await session.run(input);
  expect((await session.run(input)).runId).toBe(result.runId);
  await session.run({ input: "上一张图片呢？" });
  expect(model.requests).toHaveLength(3);
  expect(
    model.requests.map((r) =>
      r.messages.flatMap((m) => m.images ?? []).map((i) => i.data),
    ),
  ).toEqual([
    [png.toString("base64")],
    [png.toString("base64")],
    [png.toString("base64")],
  ]);
  const record = await engine.readRun(session.id, result.runId);
  expect(JSON.stringify(record)).not.toContain(png.toString("base64"));
  expect(record.steps[0]!.attemptRequests).toBeDefined();
  expect(record.usage[0]!.reservation.input).toBeGreaterThan(8192);
  expect(JSON.stringify(await session.listEvents())).not.toContain(
    png.toString("base64"),
  );
  await expect(
    engine
      .forPrincipal({ tenantId: "images", subjectId: "two" })
      .readImage(ref.attachmentId),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    session.run({ ...input, input: "different" }),
  ).rejects.toMatchObject({ code: "RUN_REQUEST_CONFLICT" });
});
it("unsupported models, revoked references, expired content and forged image formats fail before sending", async () => {
  let allowed = true;
  const { engine, model } = await setup(undefined, {
    authorize: async (request) =>
      !request.resource.startsWith("image:") || allowed,
  });
  await expect(
    engine.uploadImage({ data: Buffer.from("<svg/>"), mediaType: "image/png" }),
  ).rejects.toMatchObject({ code: "IMAGE_INVALID" });
  const ref = await engine.uploadImage({ data: png, mediaType: "image/png" });
  const noVision = config();
  noVision.models.primary.capabilities.images = false;
  const session = await engine.createSession({ config: noVision });
  await expect(
    session.run({ input: "hi", attachments: [ref] }),
  ).rejects.toMatchObject({ code: "MODEL_CAPABILITY_MISMATCH" });
  expect(model.requests).toHaveLength(0);
  allowed = false;
  await expect(engine.readImage(ref.attachmentId)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  allowed = true;
  await engine.deleteImage(ref.attachmentId);
  await expect(engine.readImage(ref.attachmentId)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  const expired = await engine.uploadImage({
    data: png,
    mediaType: "image/png",
    expiresAt: new Date(Date.now() + 30).toISOString(),
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  await expect(engine.readImage(expired.attachmentId)).rejects.toMatchObject({
    code: "IMAGE_EXPIRED",
  });
});
it("typed tools carry images from historical conversations without changing source role, order or time", async () => {
  const model = scriptedModel([
    toolCall("history.read", {}),
    finalText("read"),
  ]);
  let ref = imageAttachment(randomUUID());
  const history = defineBoundTool({
    name: "history.read",
    description: "Read authorized conversation",
    version: "1",
    sideEffect: "read",
    inputSchema: z.strictObject({}),
    outputSchema: z.object({
      messages: z.array(
        z.object({
          role: z.string(),
          time: z.string(),
          parts: z.array(
            z.union([
              z.string(),
              z.object({ type: z.literal("image"), attachmentId: z.string() }),
            ]),
          ),
        }),
      ),
    }),
    execute: async () => ({
      messages: [
        {
          role: "customer",
          time: "2026-09-11T00:00:00Z",
          parts: ["first", ref, "last"],
        },
      ],
    }),
  });
  const { engine } = await setup(model, { bindings: history.bindings });
  ref = await engine.uploadImage({ data: png, mediaType: "image/png" });
  const session = await engine.createSession({
    config: { ...config(), tools: [history.definition] },
  });
  await session.run({ input: "读取会话并看图" });
  const observation = model.requests[1]!.messages.find(
    (m) => m.role === "tool",
  )!;
  expect(JSON.parse(observation.content).messages[0]).toEqual({
    role: "customer",
    time: "2026-09-11T00:00:00Z",
    parts: ["first", ref, "last"],
  });
  expect(observation.images?.[0]?.data).toBe(png.toString("base64"));
});
it("external image storage detects corruption and sweeps interrupted uploads using retained expiry metadata", async () => {
  const objects = new Map<string, any>();
  const clock = new FakeClock();
  let failUpload = false;
  const { engine, store, options } = await setup(undefined, {
    clock,
    imageStorage: {
      version: "synthetic-objects-v1",
      put: async (id, encrypted) => {
        objects.set(id, structuredClone(encrypted));
        if (failUpload) throw Error("interrupted upload");
      },
      get: async (id) => objects.get(id),
      remove: async (id) => {
        objects.delete(id);
      },
    },
  });
  const input = {
    data: png,
    mediaType: "image/png" as const,
    expiresAt: new Date(1000).toISOString(),
  };
  const ref = await engine.uploadImage(input);
  expect((await engine.readImage(ref.attachmentId)).data).toEqual(png);
  expect(JSON.stringify([...objects.values()])).not.toContain(
    png.toString("base64"),
  );
  objects.get(ref.attachmentId).tag = "corrupted";
  await expect(engine.readImage(ref.attachmentId)).rejects.toMatchObject({
    code: "IMAGE_UNAVAILABLE",
  });
  objects.delete(ref.attachmentId);
  await expect(engine.readImage(ref.attachmentId)).rejects.toMatchObject({
    code: "IMAGE_UNAVAILABLE",
  });
  failUpload = true;
  await expect(engine.uploadImage(input)).rejects.toThrow("interrupted upload");
  expect(objects.size).toBe(1);
  expect((await store.transaction((tx) => tx.list("images"))).length).toBe(2);
  clock.advance(1001);
  await engine.sweepExpiredData();
  expect(objects.size).toBe(0);
  expect(await store.transaction((tx) => tx.list<any>("images"))).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ purged: true, filename: "expired image" }),
    ]),
  );
  await expect(engine.readImage(ref.attachmentId)).rejects.toMatchObject({
    code: "IMAGE_EXPIRED",
  });
  // Reopening with another object-store contract cannot silently reinterpret bytes.
  failUpload = false;
  const active = await engine.uploadImage({
    data: png,
    mediaType: "image/png",
  });
  await engine.close();
  const changed = await createAgentEngine({
    ...options,
    imageStorage: { ...options.imageStorage!, version: "v2" },
  });
  cleanup.push(() => changed.close());
  await expect(changed.readImage(active.attachmentId)).rejects.toMatchObject({
    code: "RECOVERY_DEPENDENCY_MISMATCH",
  });
});
it("image authorization is checked again before a model retry", async () => {
  let allowed = true;
  const model = scriptedModel([
    [
      {
        type: "failed",
        error: new AgentEngineError(
          "MODEL_RATE_LIMITED",
          "retry",
          true,
          "safe",
        ),
      },
    ],
    finalText("must not send"),
  ]);
  const clock = new FakeClock();
  const sleep = clock.sleep.bind(clock);
  clock.sleep = async (ms, signal) => {
    allowed = false;
    await sleep(ms, signal);
  };
  const { engine } = await setup(model, {
    clock,
    authorize: async (request) =>
      !request.resource.startsWith("image:") || allowed,
  });
  const ref = await engine.uploadImage({ data: png, mediaType: "image/png" });
  const session = await engine.createSession({ config: config() });
  await expect(
    session.run({ input: "inspect", attachments: [ref] }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(model.requests).toHaveLength(1);
});
const frame = (v: unknown) => `data: ${JSON.stringify(v)}\n\n`;
for (const provider of ["openai-compatible", "anthropic-compatible"])
  it(`${provider} sends actual base64 vision blocks over HTTP`, async () => {
    const requests: any[] = [];
    const server = createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      requests.push(JSON.parse(text));
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        provider === "openai-compatible"
          ? frame({
              choices: [{ delta: { content: "seen" }, finish_reason: "stop" }],
            }) + "data: [DONE]\n\n"
          : frame({
              type: "message_start",
              message: { usage: { input_tokens: 12, output_tokens: 0 } },
            }) +
              frame({
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "seen" },
              }) +
              frame({ type: "content_block_stop", index: 0 }) +
              frame({
                type: "message_delta",
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: 1 },
              }) +
              frame({ type: "message_stop" }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    cleanup.push(() => new Promise<void>((r) => server.close(() => r())));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const { engine } = await setup(undefined, {
      policy: { allowedOrigins: [origin], allowPrivateOrigins: [origin] },
    });
    const ref = await engine.uploadImage({ data: png, mediaType: "image/png" });
    const session = await engine.createSession({
      config: config(provider, origin),
    });
    await session.run({ input: "inspect", attachments: [ref, ref] });
    const blocks = requests[0].messages.find(
      (m: any) => m.role === "user",
    ).content;
    if (provider === "openai-compatible")
      expect(blocks[1].image_url.url).toBe(
        `data:image/png;base64,${png.toString("base64")}`,
      );
    else
      expect(blocks[1].source).toEqual({
        type: "base64",
        media_type: "image/png",
        data: png.toString("base64"),
      });
  });
it("PostgreSQL restart recovers an accepted image run and continues its history", async () => {
  const url =
    process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test";
  const store = PostgresStore.fromConnectionString(url);
  await store.migrate();
  let crash = true;
  const first = await setup(undefined, {
    store,
    principal: { tenantId: randomUUID(), subjectId: "one" },
    fault: (point) => {
      if (crash && point === "run.after_accept") throw Error("synthetic crash");
    },
  });
  const ref = await first.engine.uploadImage({
    data: png,
    mediaType: "image/png",
  });
  const session = await first.engine.createSession({ config: config() });
  const input = {
    input: "inspect",
    attachments: [ref],
    requestId: randomUUID(),
  };
  await expect(session.startRun(input)).rejects.toThrow("synthetic crash");
  crash = false;
  await first.engine.close();
  const nextModel = scriptedModel([
    finalText("recovered"),
    finalText("continued"),
  ]);
  nextModel.capabilities.images = true;
  const next = await createAgentEngine({
    ...first.options,
    store: PostgresStore.fromConnectionString(url),
    fault: undefined,
    adapters: { models: { scripted: nextModel } },
  });
  cleanup.push(() => next.close());
  const restored = await next.loadSession(session.id);
  expect((await restored.run(input)).outputText).toBe("recovered");
  await restored.run({ input: "continue" });
  expect(
    nextModel.requests[1]!.messages.some(
      (m) => m.images?.[0]?.data === png.toString("base64"),
    ),
  ).toBe(true);
});
