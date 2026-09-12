import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import {
  createAgentEngine,
  type ModelRequest,
  type ModelAdapter,
} from "@agent-runtime/sdk";
import { MemoryStore, finalText } from "@agent-runtime/testing";
import { createChatHandler } from "@agent-runtime/chat-server";

const requests: ModelRequest[] = [];
let release: (() => void) | undefined;
const model: ModelAdapter = {
  version: "composer-test",
  capabilities: { tools: true, thinking: false, structuredOutput: false },
  async *stream(request, ctx) {
    requests.push(request);
    yield {
      type: "delta",
      kind: "text",
      blockId: "answer",
      text: "正在验证输入选择。",
    };
    if (requests.length === 1)
      await new Promise<void>((r) => {
        release = r;
        ctx.signal.addEventListener("abort", () => r(), { once: true });
      });
    yield* finalText(`已使用 ${request.model.model} 完成回答。`);
  },
};
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "composer", subjectId: "synthetic" },
  authorize: async () => true,
  secrets: { resolve: async () => "synthetic-only" },
  adapters: { models: { scripted: model } },
  policy: { allowedOrigins: ["https://model.example.com"] },
});
const profile = {
  provider: "scripted",
  model: "text-model",
  baseURL: "https://model.example.com",
  apiKey: { secretRef: "model" },
  limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
};
let origin = "";
const handler = createChatHandler({
  namespace: "composer",
  allowedOrigins: () => [origin],
  images: true,
  resolveContext: async () => ({
    engine,
    assistants: [
      {
        id: "docs",
        label: "文档助手",
        modelDisplay: {
          text: { label: "普通模型" },
          vision: { label: "视觉模型" },
        },
        config: {
          models: {
            text: profile,
            vision: {
              ...profile,
              model: "vision-model",
              capabilities: { images: true },
            },
          },
          routing: { primary: "text" },
          skills: [
            {
              id: "guide",
              name: "接入指南",
              description: "Guide",
              instructions: "SYNTHETIC_SELECTED_GUIDE",
              allowedTools: [],
            },
          ],
        },
      },
    ],
  }),
});
const server = createServer(async (req, res) => {
  if (await handler(req, res)) return;
  if (req.url === "/chat.mjs") {
    res.setHeader("content-type", "text/javascript");
    res.end(await readFile("packages/chat-ui/dist/agent-chat.mjs"));
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>输入编辑验证</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module">import{mountChatPage,createHttpChatTransport,createSessionMemory}from"/chat.mjs";window.chat=mountChatPage(document.querySelector("#chat"),{sendShortcut:"enter",transport:createHttpChatTransport({baseURL:"/api/agent-chat"}),memory:createSessionMemory(localStorage,"synthetic-composer")});</script></html>',
  );
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ headless: true });
const artifacts = "examples/docs-site/.impeccable/review";
try {
  await mkdir(artifacts, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const root = page.locator("[data-agent-chat]"),
    field = root.locator("textarea");
  const modelSelect = root.getByRole("combobox", {
    name: "选择模型",
    exact: true,
  });
  const skillSelect = root.getByRole("combobox", {
    name: "选择技能",
    exact: true,
  });
  await expect(modelSelect).toHaveValue("text");
  await expect(
    root.getByRole("button", {
      name: "语音输入：未接入语音识别服务",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    root.getByRole("button", { name: "添加图片", exact: true }),
  ).toBeDisabled();
  await modelSelect.selectOption("vision");
  await expect(
    root.getByRole("button", { name: "添加图片", exact: true }),
  ).toBeEnabled();
  await skillSelect.selectOption("guide");
  const longDraft = Array.from(
    { length: 24 },
    (_, i) => `第 ${i + 1} 行：说明如何配置模型和接入 Skill。`,
  ).join("\n");
  await field.fill(longDraft);
  const collapsedHeight = (await field.boundingBox())!.height;
  assert.ok(collapsedHeight >= 150 && collapsedHeight <= 180);
  await field.evaluate((el) => {
    (window as any).sameEditor = el;
    (el as HTMLTextAreaElement).setSelectionRange(8, 15);
  });
  await root.getByRole("button", { name: "展开输入框", exact: true }).click();
  assert.ok((await field.boundingBox())!.height > collapsedHeight);
  assert.deepEqual(
    await field.evaluate((el) => [
      el === (window as any).sameEditor,
      (el as HTMLTextAreaElement).selectionStart,
      (el as HTMLTextAreaElement).selectionEnd,
    ]),
    [true, 8, 15],
  );
  await field.press("Escape");
  await expect(
    root.getByRole("button", { name: "展开输入框", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  // Native insertion and undo continue to use the same textarea's edit history.
  await field.fill("");
  await field.pressSequentially("native undo");
  await field.press("ControlOrMeta+z");
  assert.ok((await field.inputValue()).length < "native undo".length);
  await field.press("ControlOrMeta+Shift+z");
  await expect(field).toHaveValue("native undo");
  await field.fill("中文输入法");
  await field.dispatchEvent("compositionstart");
  await field.press("Enter");
  assert.equal(requests.length, 0);
  await field.dispatchEvent("compositionend");
  await field.press("Enter");
  assert.equal(requests.length, 0);
  await field.fill("请说明模型接入");
  await field.press("Shift+Enter");
  await expect(field).toHaveValue("请说明模型接入\n");
  await page.waitForTimeout(100); // The documented IME commit guard is 80 ms.
  await field.press("Enter");
  await expect.poll(() => requests.length).toBe(1);
  assert.equal(requests[0]!.model.model, "vision-model");
  assert.ok(JSON.stringify(requests[0]).includes("SYNTHETIC_SELECTED_GUIDE"));
  await expect(skillSelect).toHaveValue("");
  await expect(field).toBeEditable();
  await modelSelect.selectOption("text");
  await field.fill("下一条可先编辑");
  release!();
  await expect(root.locator(".ae-turn-state")).toContainText("已完成");
  await expect(modelSelect).toHaveValue("text");
  await expect(field).toHaveValue("下一条可先编辑");
  await page.reload();
  await expect(modelSelect).toHaveValue("vision");
  await field.press("ArrowUp");
  await expect(field).toHaveValue("请说明模型接入");
  assert.equal(requests.length, 1);
  await root.getByLabel("输入设置", { exact: true }).click();
  await root
    .getByRole("combobox", { name: "发送快捷键", exact: true })
    .selectOption("mod-enter");
  await field.fill("快捷键验证");
  await field.press("Enter");
  await expect(field).toHaveValue("快捷键验证\n");
  assert.equal(requests.length, 1);
  await field.press("Control+Enter");
  await expect.poll(() => requests.length).toBe(2);
  await expect(root.locator(".ae-turn-state").last()).toContainText("已完成");
  await field.fill(
    "请对这段接入流程给出修改建议。\n\nconst session = await engine.createSession(config);\nconst run = await session.run({ input: '你好' });",
  );
  // One batched render pass: desktop, dark, narrow and compact mobile.
  for (const [name, width, height, dark, settings] of [
    ["desktop", 1440, 1000, false, false],
    ["dark", 1024, 900, true, true],
    ["mobile", 390, 844, false, false],
    ["compact-settings", 320, 740, false, true],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (mode) => (window as any).chat.updateTheme({ mode, accent: "#0758a0" }),
      dark ? "dark" : "light",
    );
    await root.locator(".ae-composer-settings").evaluate((el, open) => {
      (el as HTMLDetailsElement).open = open;
    }, settings);
    await expect
      .poll(async () => (await field.boundingBox())!.width <= width)
      .toBe(true);
    if (settings) {
      const menu = await root
        .locator(".ae-composer-settings-body")
        .boundingBox();
      assert.ok(
        menu && menu.x >= 0 && menu.x + menu.width <= width,
        `${name} settings must stay within the viewport`,
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await root
        .locator(".ae-composer-surface")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      false,
    );
    await page.screenshot({
      path: `${artifacts}/composer-${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.evaluate(() => (window as any).chat.destroy());
  await expect(root).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Composer UI passed: native undo/caret, auto-height/expand, IME guard, shortcuts/history, actual model/skill dispatch, next draft during run, reload, microphone gating, desktop/dark/mobile overflow, teardown.",
  );
} finally {
  release?.();
  await browser.close();
  await new Promise<void>((r) => {
    server.close(() => r());
    server.closeAllConnections();
  });
  await engine.close();
}
