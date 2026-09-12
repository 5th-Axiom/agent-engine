import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createAgentEngine, AgentEngineError } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import { createChatHandler } from "@agent-runtime/chat-server";

let finishSearch!: () => void;
const searchGate = new Promise<void>((resolve) => {
  finishSearch = resolve;
});
const model = scriptedModel([
  toolCall("engine.skill.select", { id: "guide" }),
  [
    { type: "activity", kind: "thinking" },
    {
      type: "delta",
      kind: "thinking",
      blockId: "hidden",
      text: "PRIVATE_REASONING",
    },
    {
      type: "delta",
      kind: "text",
      blockId: "stage",
      text: "我先查一下会话接入文档。",
    },
    { type: "activity", kind: "tool-call" },
    ...toolCall("docs.search", { query: "loadSession 续聊" }, "search"),
  ],
  [
    { type: "activity", kind: "thinking" },
    {
      type: "delta",
      kind: "text",
      blockId: "answer",
      text: "保存会话 ID，使用 **loadSession** 恢复后继续提问。\n\n```ts\nconst session = await engine.loadSession(sessionId);\n```",
    },
    {
      type: "usage",
      mode: "snapshot",
      final: true,
      usage: { input: 120, output: 42, total: 162 },
    },
    ...finalText(
      "保存会话 ID，使用 **loadSession** 恢复后继续提问。\n\n```ts\nconst session = await engine.loadSession(sessionId);\n```",
    ),
  ],
  toolCall("engine.question", {
    question: "你准备把助手接入前端页面，还是 Node 后端？",
  }),
  [
    {
      type: "delta",
      kind: "text",
      blockId: "discard",
      text: "DISCARDED_DRAFT",
    },
    {
      type: "failed",
      error: new AgentEngineError(
        "MODEL_RATE_LIMITED",
        "limited",
        true,
        "safe",
      ),
    },
  ],
  finalText("重试后已恢复回答。"),
]);
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "process-ui", subjectId: "synthetic" },
  authorize: async () => true,
  secrets: { resolve: async () => "synthetic-process-ui" },
  adapters: { models: { scripted: model } },
  policy: {
    allowedOrigins: ["https://model.example.com"],
    thinkingDisplayRetention: "none",
  },
  bindings: {
    search: {
      version: "1",
      sideEffect: "read",
      execute: async () => {
        await searchGate;
        return {
          title: "创建对话与继续会话",
          summary: "保存 session.id，再调用 engine.loadSession(sessionId)。",
          private: "PRIVATE_RESULT",
        };
      },
    },
  },
});
let origin = "",
  longDetails = false;
const handler = createChatHandler({
  namespace: "process-ui",
  allowedOrigins: () => [origin],
  resolveContext: async () => ({
    engine,
    assistants: [
      {
        id: "docs",
        label: "文档助手",
        toolDisplay: { "docs.search": { label: "搜索文档" } },
        describeProcess: ({ input, output }) => ({
          input: longDetails
            ? Array.from(
                { length: 36 },
                (_, i) => `查询条件 ${i + 1}：公开会话接入资料`,
              ).join("\n")
            : String((input as any)?.query ?? ""),
          output: (output as any)?.summary,
        }),
        config: {
          models: {
            p: {
              provider: "scripted",
              model: "test",
              baseURL: "https://model.example.com",
              apiKey: { secretRef: "model" },
              limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
            },
          },
          routing: { primary: "p" },
          interaction: {
            questions: {
              enabled: true,
              answerSchema: { type: "string" },
              timeoutMs: 60000,
            },
          },
          skills: [
            {
              id: "guide",
              name: "会话接入",
              description: "帮助接入",
              instructions: "PRIVATE_SKILL",
              allowedTools: ["docs.search"],
            },
          ],
          tools: [
            {
              name: "docs.search",
              description: "搜索公开文档",
              inputSchema: { type: "object" },
              outputSchema: true,
              execution: {
                type: "binding",
                bindingKey: "search",
                sideEffect: "read",
              },
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
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>过程展示验证</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module">import{mountChatPage,createHttpChatTransport,createSessionMemory}from"/chat.mjs";window.chat=mountChatPage(document.querySelector("#chat"),{transport:createHttpChatTransport({baseURL:"/api/agent-chat"}),memory:createSessionMemory(localStorage,"synthetic-process")});</script></html>',
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ headless: true });
const artifacts = "examples/docs-site/.impeccable/review";
try {
  await mkdir(artifacts, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  const root = page.locator("[data-agent-chat]");
  await root.locator("textarea").fill("如何在下次打开页面时继续这次对话？");
  await root.getByRole("button", { name: "发送", exact: true }).click();
  const search = root.locator('.ae-process-row[data-kind="tool"]');
  await expect(search).toContainText("搜索文档");
  await expect(search).toHaveAttribute("data-state", "running");
  const summary = search.locator("summary");
  await summary.click();
  await summary.focus();
  const sessionId = await page.evaluate(
    () => (window as any).chat.controller.snapshot.session.id,
  );
  await page.evaluate(() => (window as any).chat.controller.refresh());
  await expect(summary).toBeFocused();
  await expect(search.locator("details")).toHaveAttribute("open", "");
  await root.locator(".ae-transcript").evaluate(async (el) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  await page.screenshot({
    path: artifacts + "/process-running-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() =>
    (window as any).chat.updateTheme({ mode: "light", accent: "#ffcc00" }),
  );
  const processHeading = root.locator(".ae-process-header");
  await page.keyboard.press("Tab");
  await processHeading.focus();
  const ratios = await page.evaluate(() => {
    const shadow = document.querySelector("[data-agent-chat]")!.shadowRoot!;
    return [
      getComputedStyle(
        shadow.querySelector(
          '.ae-process-row[data-state="running"] .ae-process-state',
        )!,
      ).color,
      getComputedStyle(shadow.querySelector(".ae-process-header")!)
        .outlineColor,
    ].map((color) => {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map((value) => Number(value) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return (
        1.05 / (0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]! + 0.05)
      );
    });
  });
  assert.ok(ratios[0]! >= 4.5 && ratios[1]! >= 3);
  await page.screenshot({
    path: artifacts + "/process-custom-accent-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() =>
    (window as any).chat.updateTheme({ mode: "light", accent: "#0758a0" }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await root.locator(".ae-transcript").evaluate(async (el) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  await page.screenshot({
    path: artifacts + "/process-running-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  longDetails = true;
  await page.evaluate(() => (window as any).chat.controller.refresh());
  const detailBody = search.locator(".ae-process-detail-body");
  await detailBody.focus();
  await detailBody.evaluate((el) => {
    el.scrollTop = 150;
    (window as any).readingDetail = el;
  });
  const readingOffset = await detailBody.evaluate((el) => el.scrollTop);
  assert.ok(readingOffset > 0);
  finishSearch();
  await expect(root.locator(".ae-turn-state")).toContainText("已完成");
  await expect(search).toHaveAttribute("data-state", "completed");
  await expect(detailBody).toBeFocused();
  assert.equal(
    await detailBody.evaluate((el) => el === (window as any).readingDetail),
    true,
  );
  assert.equal(await detailBody.evaluate((el) => el.scrollTop), readingOffset);
  await detailBody.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({
    path: artifacts + "/process-detail-continuity-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  longDetails = false;
  await page.evaluate(() => (window as any).chat.controller.refresh());
  await expect(search.locator("details")).toHaveAttribute("open", "");
  assert.equal(
    await root.locator('.ae-process-row[data-kind="thinking"]').count(),
    2,
  );
  assert.equal(
    await root.locator('.ae-process-row[data-kind="message"]').count(),
    1,
  );
  assert.equal(
    await root
      .locator(".ae-process")
      .innerText()
      .then((text) => /PRIVATE_|DISCARDED/.test(text)),
    false,
  );
  await page.reload();
  await expect(root.locator(".ae-turn-state")).toContainText("已完成");
  assert.equal(
    await page.evaluate(
      () => (window as any).chat.controller.snapshot.session.id,
    ),
    sessionId,
  );
  await expect(root.locator(".ae-process-disclosure")).not.toHaveAttribute(
    "open",
    "",
  );
  const code = root.getByRole("button", { name: "复制代码", exact: true });
  await code.focus();
  await page.evaluate(() => (window as any).chat.controller.refresh());
  await expect(code).toBeFocused();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await root.locator(".ae-transcript").evaluate(async (el) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await root
        .locator(".ae-transcript")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await page.screenshot({
      path: artifacts + `/process-completed-${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await root.locator(".ae-process-header").click();
  await search.locator("summary").click();
  await expect(search.locator(".ae-process-output")).toContainText(
    "保存 session.id",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await root.locator(".ae-transcript").evaluate(async (el) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  await page.screenshot({
    path: artifacts + "/process-expanded-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (window as any).chat.controller.newSession());
  await root.locator("textarea").fill("帮我选择接入方式");
  await root.getByRole("button", { name: "发送", exact: true }).click();
  await expect(root.locator(".ae-process-pending")).toContainText(
    "你准备把助手接入",
  );
  await page.screenshot({
    path: artifacts + "/process-waiting-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await root.getByRole("button", { name: "停止", exact: true }).click();
  await expect(root.locator(".ae-turn-state")).toContainText("已停止");
  await expect(root.locator(".ae-process-pending")).toBeHidden();
  await page.evaluate(() => (window as any).chat.controller.newSession());
  await root.locator("textarea").fill("再次查询");
  await root.getByRole("button", { name: "发送", exact: true }).click();
  await expect(root.locator(".ae-message-agent")).toContainText(
    "重试后已恢复回答",
  );
  await root.locator(".ae-process-header").click();
  await expect(
    root.locator('.ae-process-row[data-kind="retry"]'),
  ).toBeVisible();
  assert.equal((await root.innerText()).includes("DISCARDED_DRAFT"), false);
  await page.evaluate(() => (window as any).chat.destroy());
  await expect(root).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Chat process UI passed: real event order, safe details, running/completed, stable disclosure and focus, reload, pending/cancel, retry/discard, desktop/mobile overflow, teardown.",
  );
} finally {
  finishSearch();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await engine.close();
}
