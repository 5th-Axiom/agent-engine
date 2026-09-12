import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createAgentEngine, type ModelAdapter } from "@agent-runtime/sdk";
import { MemoryStore, finalText, toolCall } from "@agent-runtime/testing";
import { createChatHandler } from "@agent-runtime/chat-server";
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
};
const thinkingGate = gate(),
  toolGate = gate(),
  answerGate = gate(),
  appendGate = gate(),
  finalGate = gate();
const firstThought =
  "我会先检查会话配置，再查看工具绑定的接入方式。\n\n需要确认两点：模型是否可用，以及工具是否同时声明了 Schema 和执行函数。这里展示的是测试模型返回的合成分析内容。";
const nextThought =
  "检索到了对应的接入文档，可以按环境准备、创建会话和调用工具三个步骤说明。";
const answerStart =
  "## 接入方式\n\n先准备配置，再创建会话。以下是可继续编辑的示例：\n\n```ts\nconst session = await engine.createSession({ config });\n```\n\n";
const answerMore =
  "接下来检查工具是否已启用，并保持服务端的授权检查。".repeat(8) +
  " 👨‍👩‍👧‍👦 中文与 emoji 都应保持完整。\n\n";
const answerEnd =
  "| 检查项 | 预期结果 |\n| --- | --- |\n| 模型配置 | 能完成一次问答 |\n| 工具绑定 | 返回经过校验的结果 |\n";
let requests = 0;
const model: ModelAdapter = {
  version: "reply-ui",
  capabilities: { tools: true, thinking: true, structuredOutput: false },
  async *stream(_req, ctx) {
    requests++;
    const wait = (promise: Promise<void>) =>
      Promise.race([
        promise,
        new Promise<void>((r) =>
          ctx.signal.addEventListener("abort", () => r(), { once: true }),
        ),
      ]);
    yield {
      type: "delta",
      kind: "thinking",
      blockId: "thought",
      thinkingFormat: "content",
      text: requests === 1 ? firstThought : nextThought,
    };
    if (requests === 1) {
      await wait(thinkingGate.promise);
      yield {
        type: "delta",
        kind: "text",
        blockId: "text",
        text: "我先检索工具与模型配置的接入说明。",
      };
      yield* toolCall("docs.search", { query: "模型配置 工具绑定" });
    } else {
      await wait(answerGate.promise);
      yield { type: "delta", kind: "text", blockId: "text", text: answerStart };
      await wait(appendGate.promise);
      yield { type: "delta", kind: "text", blockId: "text", text: answerMore };
      await wait(finalGate.promise);
      yield { type: "delta", kind: "text", blockId: "text", text: answerEnd };
      yield {
        type: "usage",
        mode: "snapshot",
        final: true,
        usage: { input: 560, output: 240, total: 800 },
      };
      yield* finalText(answerStart + answerMore + answerEnd);
    }
  },
};
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "reply", subjectId: "test" },
  authorize: async () => true,
  secrets: { resolve: async () => "synthetic" },
  adapters: { models: { scripted: model } },
  policy: {
    allowedOrigins: ["https://model.example.com"],
    thinkingDisplayRetention: "session",
  },
  bindings: {
    search: {
      version: "1",
      sideEffect: "read",
      execute: async () => {
        await toolGate.promise;
        return {
          summary:
            "使用 defineBoundTool 声明工具，再将 bindings 注册给 Engine。",
        };
      },
    },
  },
});
let origin = "";
const handler = createChatHandler({
  namespace: "reply",
  allowedOrigins: () => [origin],
  resolveContext: async () => ({
    engine,
    assistants: [
      {
        id: "docs",
        label: "文档助手",
        thinkingDisplay: "content",
        toolDisplay: { "docs.search": { label: "搜索文档" } },
        describeProcess: ({ input, output }) => ({
          input: (input as any)?.query,
          output: (output as any)?.summary,
        }),
        config: {
          models: {
            p: {
              provider: "scripted",
              model: "test",
              baseURL: "https://model.example.com",
              apiKey: { secretRef: "model" },
              limits: { contextWindowTokens: 32000, maxOutputTokens: 2000 },
              thinking: {
                enabled: true,
                expose: "content",
                budgetTokens: 1024,
              },
            },
          },
          routing: { primary: "p" },
          tools: [
            {
              name: "docs.search",
              description: "Search public documents",
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
  res.setHeader("content-type", "text/html;charset=utf-8");
  res.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>回复展示验证</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module">import{mountChatPage,createHttpChatTransport,createSessionMemory}from"/chat.mjs";window.chat=mountChatPage(document.querySelector("#chat"),{transport:createHttpChatTransport({baseURL:"/api/agent-chat"}),memory:createSessionMemory(localStorage,"reply"),copy:{title:"文档助手"}});</script></html>',
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
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const root = page.locator("[data-agent-chat]"),
    thought = root.locator(".ae-thinking-content").first();
  await root.locator("textarea").fill("怎么配置模型，并给助手接入一个工具？");
  await root.getByRole("button", { name: "发送", exact: true }).click();
  await expect(thought).toHaveText(firstThought.replace(/\n\n/g, ""));
  await expect(thought).toBeVisible();
  const screenshots = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await root.locator(".ae-transcript").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(230); // Let the bounded disclosure/reveal transitions settle before capture.
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `${artifacts}/reply-${name}.png`,
      animations: "disabled",
      fullPage: true,
    });
  };
  await screenshots("thinking-desktop", 1440, 1000);
  await screenshots("thinking-mobile", 390, 844);
  thinkingGate.release();
  const tool = root.locator('.ae-process-row[data-kind="tool"]');
  await expect(tool).toHaveAttribute("data-state", "running");
  await tool.locator("summary").click();
  await expect(tool).toContainText("模型配置 工具绑定");
  await page.evaluate(() => (window as any).chat.updateTheme({ mode: "dark" }));
  await screenshots("tool-dark", 1024, 900);
  await page.evaluate(() =>
    (window as any).chat.updateTheme({ mode: "light" }),
  );
  toolGate.release();
  await expect(root.locator(".ae-thinking-content").last()).toContainText(
    nextThought,
  );
  answerGate.release();
  const answer = root.locator(".ae-message-agent > .ae-message-text");
  const copy = answer.getByRole("button", { name: "复制代码", exact: true });
  await expect(copy).toBeVisible();
  await expect(answer.locator("pre")).toHaveText(
    "const session = await engine.createSession({ config });",
  );
  await copy.focus();
  await copy.evaluate((el) => {
    (window as any).sameCopy = el;
  });
  await answer.evaluate((el) => {
    (window as any).samples = [];
    new MutationObserver(() =>
      (window as any).samples.push(el.textContent),
    ).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await root.locator(".ae-transcript").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  appendGate.release();
  await expect(answer).toContainText("中文与 emoji 都应保持完整。");
  assert.ok(
    await page.evaluate(() => new Set((window as any).samples).size > 2),
    "a received chunk must reveal over multiple frames",
  );
  assert.equal(
    await page.evaluate(() =>
      (window as any).samples.some((s: string) =>
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          s,
        ),
      ),
    ),
    false,
  );
  await expect(copy).toBeFocused();
  assert.equal(
    await copy.evaluate((el) => el === (window as any).sameCopy),
    true,
  );
  assert.ok(
    await root.locator(".ae-transcript").evaluate((el) => el.scrollTop < 10),
    "reading position must not be pulled to the bottom",
  );
  await copy.click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "const session = await engine.createSession({ config });",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  finalGate.release();
  await expect(answer.locator("table")).toBeVisible();
  await expect(answer).toHaveAttribute("data-revealing", "false");
  await expect(root.locator(".ae-turn-state")).toContainText("已完成");
  await page.reload();
  await expect(answer.locator("table")).toBeVisible();
  await expect(answer).toHaveAttribute("data-revealing", "false");
  await root.locator(".ae-process-header").click();
  await root
    .locator('.ae-process-row[data-kind="thinking"]')
    .first()
    .locator("summary")
    .click();
  await expect(thought).toBeVisible();
  await expect(thought).toContainText("模型是否可用");
  await root.locator(".ae-process-header").click();
  await screenshots("completed-desktop", 1440, 1000);
  await screenshots("completed-mobile", 390, 844);
  await page.evaluate(() => (window as any).chat.destroy());
  await expect(root).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Reply display passed: opt-in thinking and chronological tools, bounded multi-frame reveal/graphemes, stable code node/focus/copy, reading position, reduced motion, settled reload, teardown; five viewport/state captures.",
  );
} finally {
  thinkingGate.release();
  toolGate.release();
  answerGate.release();
  appendGate.release();
  finalGate.release();
  await browser.close();
  await new Promise<void>((r) => {
    server.close(() => r());
    server.closeAllConnections();
  });
  await engine.close();
}
