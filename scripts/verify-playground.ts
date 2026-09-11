import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import {
  createAgentEngine,
  AgentEngineError,
  type ModelStreamEvent,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import {
  inventoryBinding,
  startPlayground,
} from "../examples/playground/server.js";

// Deterministic browser verification. Prompts and outputs are synthetic.
const model = scriptedModel([]);
model.stream = async function* (req, ctx) {
  const input =
    req.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  if (input.includes("验证失败"))
    throw new AgentEngineError(
      "MODEL_PROVIDER_ERROR",
      "private synthetic provider body",
    );
  if (input.includes("验证取消")) {
    yield {
      type: "delta",
      blockId: "text",
      kind: "text",
      text: "正在生成一段尚未提交的合成内容…",
    };
    await new Promise<void>((resolve) => {
      if (ctx.signal.aborted) resolve();
      else
        ctx.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    ctx.signal.throwIfAborted();
    return;
  }
  const report: ModelStreamEvent = {
    type: "usage",
    mode: "snapshot",
    final: true,
    usage: { input: 32, output: 16, total: 48 },
  };
  if (req.tools.length && req.messages.at(-1)?.role !== "tool") {
    yield report;
    yield* toolCall("demo.inventory", { sku: "DEMO-1" });
    return;
  }
  yield {
    type: "delta",
    blockId: "text",
    kind: "text",
    text: "正在整理查询结果…",
  };
  await new Promise((resolve) => setTimeout(resolve, 500));
  yield report;
  yield* finalText(
    req.tools.length
      ? "DEMO-1 当前还有 24 件库存。\n\n这是演示工具返回的合成数据，本次操作没有查询或修改真实库存。"
      : "这是一条用于验证浏览器交互的合成回答。刷新页面后仍能查看，并可继续对话。",
  );
};
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "synthetic-browser", subjectId: "review" },
  secrets: { resolve: async () => "synthetic-browser-private-key" },
  adapters: { models: { synthetic: model } },
  bindings: { "playground.inventory": inventoryBinding },
  policy: { allowedOrigins: ["https://example.invalid"] },
});
const profile = {
  profileName: "合成浏览器测试",
  model: {
    provider: "synthetic",
    model: "synthetic-browser",
    baseURL: "https://example.invalid",
    apiKey: { secretRef: "test" },
    limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
  },
};
// Config names are intentionally ASCII; the visible model records stay explicit.
profile.profileName = "synthetic-browser";
const host = await startPlayground({
  engine,
  profiles: [profile],
  defaultProfile: profile.profileName,
  debugSecretRef: "debug",
  port: 0,
});
const browser = await chromium.launch();
const errors: string[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto(host.url);
  await page.getByRole("status").filter({ hasText: "本地已连接" }).waitFor();
  const send = async (input: string) => {
    await page.getByLabel("输入消息", { exact: true }).fill(input);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
  };
  const waitState = async (state: string) =>
    page.waitForFunction(
      (value) => document.querySelector("#run-state")?.textContent === value,
      state,
    );
  await page.keyboard.press("Tab");
  assert((await page.locator(":focus").count()) > 0);
  await send("第一条合成消息：<script>window.injected=true</script>");
  await waitState("已完成");
  const firstURL = page.url();
  await page.reload();
  await waitState("已完成");
  assert.equal(page.url(), firstURL);
  assert.equal(
    await page.evaluate(
      () => (window as unknown as { injected?: boolean }).injected,
    ),
    undefined,
  );
  await send("继续同一段对话");
  await waitState("已完成");
  await page.waitForFunction(
    () => document.querySelectorAll(".turn").length === 2,
  );
  await send("验证取消");
  await page
    .getByText("正在生成一段尚未提交的合成内容…", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "停止生成", exact: true }).click();
  await waitState("已停止");
  assert.equal(
    await page
      .getByText("正在生成一段尚未提交的合成内容…", { exact: true })
      .count(),
    0,
  );
  await send("验证失败");
  await waitState("执行失败");
  assert(
    !(await page.locator("body").innerText()).includes(
      "private synthetic provider body",
    ),
  );
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await page.getByLabel("测试场景", { exact: true }).selectOption("tool");
  await send("请查询 DEMO-1 的库存，并告诉我还有多少件。");
  await waitState("已完成");
  await page
    .locator("#operations")
    .getByText("demo.inventory", { exact: true })
    .waitFor();
  assert((await page.locator("#turns").innerText()).includes("24 件"));
  assert.equal(await page.locator("#usage-total").innerText(), "96");
  const sessionURL = page.url();
  await page.getByRole("link", { name: "查看本次 Debug", exact: true }).click();
  await page
    .getByRole("heading", { name: "Steps and attempts", exact: true })
    .waitFor();
  assert(!(await page.locator("body").innerText()).includes("请查询 DEMO-1"));
  assert((await page.locator("body").innerText()).includes("demo.inventory"));
  await page.getByRole("link", { name: "返回本地测试", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "本地已连接" }).waitFor();
  await waitState("已完成");
  assert.equal(page.url(), sessionURL);

  const path = "examples/playground/.impeccable/review";
  await mkdir(path, { recursive: true });
  for (const [name, width, height] of process.argv.includes("--functional-only")
    ? []
    : ([
        ["desktop", 1440, 1000],
        ["mobile", 390, 844],
      ] as const)) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await waitState("已完成");
    if (name === "mobile") {
      await page.locator("#settings > summary").click();
      assert(
        await page
          .getByRole("button", { name: "新对话", exact: true })
          .isVisible(),
      );
      await page.locator("#settings > summary").click();
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${path}/${name}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      completed: true,
      backend: "deterministic-memory",
      verified: [
        "send",
        "stream-draft",
        "continue",
        "reload",
        "cancel",
        "failure",
        "tool",
        "usage",
        "debug-navigation",
        "xss-safe-text",
        ...(process.argv.includes("--functional-only")
          ? []
          : ["desktop", "mobile"]),
      ],
      browserErrors: 0,
    }),
  );
  await context.close();
} finally {
  await browser.close();
  await host.close();
  await engine.close();
}
