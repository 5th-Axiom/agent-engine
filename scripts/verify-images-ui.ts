import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createAgentEngine } from "@agent-runtime/sdk";
import { MemoryStore, scriptedModel, finalText } from "@agent-runtime/testing";
import { createChatHandler } from "@agent-runtime/chat-server";
let png: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
);
const model = scriptedModel([
  finalText(
    "**看到了图片**\n\n```ts\nconst answer = 42;\n```\n\n<script>window.pwned=true</script>\n\n[危险](javascript:alert(1))",
  ),
  finalText(
    '图中左侧是**红色色块**，右侧是**蓝色色块**。\n\n编号为 AE DEMO。\n\n```ts\nconst colors = ["red", "blue"];\n```',
  ),
]);
model.capabilities.images = true;
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "test", subjectId: "one" },
  authorize: async () => true,
  secrets: { resolve: async () => "synthetic-image-ui" },
  protocolKey: { secretRef: "protocol" },
  adapters: { models: { scripted: model } },
  policy: { allowedOrigins: ["https://model.example.com"] },
});
let origin = "",
  failUpload = true;
const handler = createChatHandler({
  namespace: "images",
  images: true,
  allowedOrigins: () => [origin],
  resolveContext: async () => ({
    engine,
    assistants: [
      {
        id: "vision",
        label: "图片助手",
        config: {
          models: {
            p: {
              provider: "scripted",
              model: "vision",
              baseURL: "https://model.example.com",
              apiKey: { secretRef: "model" },
              capabilities: { images: true },
              limits: {
                contextWindowTokens: 100000,
                maxOutputTokens: 1000,
                maxImageInputTokens: 8192,
              },
            },
          },
          routing: { primary: "p" },
        },
      },
    ],
  }),
});
const server = createServer(async (req, res) => {
  if (
    req.url === "/api/agent-chat/images" &&
    req.method === "POST" &&
    failUpload
  ) {
    failUpload = false;
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "IMAGE_UNAVAILABLE" } }));
    return;
  }
  if (await handler(req, res)) return;
  if (req.url === "/chat.mjs") {
    res.setHeader("content-type", "text/javascript");
    res.end(await readFile("packages/chat-ui/dist/agent-chat.mjs"));
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图片验证</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module">import{mountChatPage,createHttpChatTransport,createSessionMemory}from"/chat.mjs";window.chat=mountChatPage(document.querySelector("#chat"),{transport:createHttpChatTransport({baseURL:"/api/agent-chat"}),memory:createSessionMemory(localStorage,"synthetic")});</script></html>',
  );
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<canvas width="480" height="240"></canvas>');
  await page.evaluate(() => {
    const c = document.querySelector("canvas")!.getContext("2d")!;
    c.fillStyle = "white";
    c.fillRect(0, 0, 480, 240);
    c.fillStyle = "#b42318";
    c.fillRect(24, 24, 196, 100);
    c.fillStyle = "#0758a0";
    c.fillRect(260, 24, 196, 100);
    c.fillStyle = "#172b42";
    c.font = "bold 40px monospace";
    c.fillText("AE DEMO", 148, 198);
  });
  png = await page.locator("canvas").screenshot();
  await page.goto(origin);
  const root = page.locator("[data-agent-chat]");
  await expect(
    root.getByRole("button", { name: "添加图片", exact: true }),
  ).toBeVisible();
  await root
    .locator('input[type="file"]')
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(
    root.getByRole("button", { name: "重试上传", exact: true }),
  ).toBeVisible();
  await expect(
    root.getByRole("button", { name: "发送", exact: true }),
  ).toBeDisabled();
  await root.getByRole("button", { name: "重试上传", exact: true }).click();
  await expect(
    root.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
  await root.getByRole("button", { name: "发送", exact: true }).click();
  await expect(root.locator(".ae-message-agent strong")).toHaveText(
    "看到了图片",
  );
  await expect(root.locator(".ae-image-preview img")).toBeVisible();
  assert.equal(
    model.requests[0]!.messages.at(-1)?.images?.[0]?.data,
    png.toString("base64"),
  );
  assert.equal(
    await root
      .locator(
        '.ae-message-agent script, .ae-message-agent a[href^="javascript:"]',
      )
      .count(),
    0,
  );
  await root.getByRole("button", { name: "复制代码", exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "const answer = 42;",
  );
  const sessionId = await page.evaluate(
    () => (window as any).chat.controller.snapshot.session.id,
  );
  await page.reload();
  await expect(root.locator(".ae-image-preview img")).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => (window as any).chat.controller.snapshot.session.id,
    ),
    sessionId,
  );
  await root
    .locator('input[type="file"]')
    .setInputFiles({ name: "remove.png", mimeType: "image/png", buffer: png });
  await expect(
    root.getByRole("button", { name: "移除图片", exact: true }),
  ).toBeVisible();
  await root.getByRole("button", { name: "移除图片", exact: true }).click();
  await expect(root.locator(".ae-draft-image")).toHaveCount(0);
  await page.evaluate(
    async (bytes) => {
      const root = document.querySelector("[data-agent-chat]")!.shadowRoot!;
      const dt = new DataTransfer();
      dt.items.add(
        new File([Uint8Array.from(bytes)], "pasted.png", { type: "image/png" }),
      );
      root
        .querySelector("textarea")!
        .dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }),
        );
    },
    [...png],
  );
  await expect(root.locator(".ae-draft-image")).toHaveCount(1);
  await expect(
    root.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
  await root.getByRole("button", { name: "移除图片", exact: true }).click();
  await page.evaluate(
    (bytes) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([Uint8Array.from(bytes)], "dropped.png", {
          type: "image/png",
        }),
      );
      document
        .querySelector("[data-agent-chat]")!
        .shadowRoot!.querySelector("textarea")!
        .dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
    },
    [...png],
  );
  await expect(root.locator(".ae-draft-image")).toHaveCount(1);
  await expect(
    root.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
  // Capture a normal conversation after the adversarial rendering checks.
  await page.evaluate(() => (window as any).chat.controller.newSession());
  await root
    .locator('input[type="file"]')
    .setInputFiles({ name: "colors.png", mimeType: "image/png", buffer: png });
  await root.locator("textarea").fill("请描述这张图片中的颜色和文字。");
  await expect(
    root.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
  await root.getByRole("button", { name: "发送", exact: true }).click();
  await expect(root.locator(".ae-message-agent")).toContainText("红色色块");
  await root
    .locator('input[type="file"]')
    .setInputFiles({
      name: "followup.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(
    root.getByRole("button", { name: "发送", exact: true }),
  ).toBeEnabled();
  await mkdir("examples/docs-site/.impeccable/review", { recursive: true });
  await page.screenshot({
    path: "examples/docs-site/.impeccable/review/chat-images-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "examples/docs-site/.impeccable/review/chat-images-mobile.png",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  await page.evaluate(() =>
    (window as any).chat.destroy({ clearSession: true }),
  );
  await expect(page.locator("[data-agent-chat]")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Image UI: upload failure/retry, image-only send, actual model bytes, Markdown safety/copy, reload, removal, paste/drop, responsive layout, teardown passed.",
  );
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  await engine.close();
}
