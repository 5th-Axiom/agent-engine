import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  createAgentEngine,
  type ModelAdapter,
  type SessionConfigInput,
} from "@agent-runtime/sdk";
import { MemoryStore, finalText } from "@agent-runtime/testing";
import { createChatHandler } from "@agent-runtime/chat-server";
import { renderSettingsPage } from "../examples/docs-site/ai-render.js";
let calls = 0,
  latestTools: string[] = [];
const model: ModelAdapter = {
  version: "settings-ui",
  capabilities: { tools: true, thinking: false, structuredOutput: false },
  async *stream(req) {
    calls++;
    latestTools = req.tools.map((t) => t.name);
    yield* finalText("配置验证完成");
  },
};
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "ui", subjectId: "u" },
  authorize: async () => true,
  secrets: { resolve: async () => "synthetic-settings-key" },
  adapters: { models: { scripted: model } },
  policy: { allowedOrigins: ["https://model.example.com"] },
  bindings: {
    lookup: {
      version: "1",
      sideEffect: "read",
      execute: async () => ({ items: [] }),
    },
  },
});
const config: SessionConfigInput = {
  models: {
    primary: {
      provider: "scripted",
      model: "测试模型",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "test" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
      thinking: { enabled: false, expose: "content" },
    },
  },
  routing: { primary: "primary" },
  tools: ["lookup", "catalog", "locked"].map((name) => ({
    name,
    description: "Synthetic tool",
    permission: name === "locked" ? "deny" : "allow",
    inputSchema: { type: "object" },
    outputSchema: true,
    execution: { type: "binding", bindingKey: "lookup", sideEffect: "read" },
  })),
  skills: [
    {
      id: "guide",
      name: "接入指导",
      description: "synthetic skill",
      instructions: "Synthetic integration guidance",
      allowedTools: ["lookup"],
    },
  ],
  knowledgeBases: [
    {
      id: "docs",
      name: "产品知识库",
      description: "synthetic knowledge",
      retriever: { type: "binding", bindingKey: "lookup" },
      querySchema: { type: "object" },
      resultSchema: true,
      citation: { required: false, outputPointer: "/citations" },
    },
  ],
  memory: {
    stores: [
      {
        id: "preferences",
        adapter: { type: "binding", bindingKey: "lookup" },
        namespace: { tenantId: "ui", subjectId: "u", agentId: "test" },
        read: { strategy: "semantic", topK: 3, maxTokens: 1000 },
      },
    ],
  },
  context: { compaction: { maxCyclesPerRun: 2 } },
};
let origin = "";
const handler = createChatHandler({
  namespace: "settings-ui",
  allowedOrigins: () => [origin],
  resolveContext: async () => ({
    engine,
    assistants: [
      {
        id: "docs",
        label: "配置演示助手",
        settings: true,
        thinkingDisplay: "content",
        config,
        toolDisplay: {
          lookup: {
            label: "搜索项目资料",
            description: "按关键词查找项目文档、API 与示例。",
          },
          catalog: {
            label: "读取资料目录",
            description: "查看已接入的公开资料范围。",
          },
          locked: {
            label: "受限资料",
            description: "此项目未开放这组资料。",
          },
        },
        skillDisplay: {
          guide: {
            description: "按环境准备、创建会话和调用工具说明接入步骤。",
          },
        },
        memoryDisplay: { preferences: { label: "用户偏好" } },
      },
    ],
  }),
});
const assets: Record<string, string> = {
  "/assets/agent-chat.mjs": "packages/chat-ui/dist/agent-chat.mjs",
  "/assets/settings.js": "examples/docs-site/settings.js",
  "/assets/chat-shared.js": "examples/docs-site/chat-shared.js",
  "/assets/ai.css": "examples/docs-site/ai.css",
  "/assets/style.css": "examples/docs-site/style.css",
  "/assets/theme.js": "examples/docs-site/theme.js",
  "/assets/favicon.svg": "examples/docs-site/favicon.svg",
};
const server = createServer(async (req, res) => {
  if (await handler(req, res)) return;
  const path = new URL(req.url!, "http://local").pathname;
  const file = assets[path];
  if (file) {
    res.setHeader(
      "content-type",
      file.endsWith("css")
        ? "text/css"
        : file.endsWith("svg")
          ? "image/svg+xml"
          : "text/javascript",
    );
    res.end(await readFile(file));
    return;
  }
  res.setHeader("content-type", "text/html;charset=utf-8");
  if (path === "/ai/settings/") {
    res.end(renderSettingsPage(true));
    return;
  }
  res.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>配置入口验证</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module">import{mountChatPage,createHttpChatTransport}from"/assets/agent-chat.mjs";window.chat=mountChatPage(document.querySelector("#chat"),{transport:createHttpChatTransport({baseURL:"/api/agent-chat"}),settingsUrl:"/ai/settings/"});</script></html>',
  );
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ headless: true });
const review = "examples/docs-site/.impeccable/review";
try {
  await mkdir(review, { recursive: true });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const chat = page.locator("[data-agent-chat]");
  await chat.locator("textarea").fill("保留这条尚未发送的草稿");
  const popupPromise = page.waitForEvent("popup");
  await chat.getByRole("link", { name: "会话配置（新标签页）" }).click();
  const settings = await popupPromise;
  await settings.waitForURL("**/ai/settings/?session=*");
  const root = settings.locator("[data-agent-chat]"),
    save = root.getByRole("button", { name: "保存配置", exact: true });
  await expect(save).toBeDisabled();
  await expect(
    root.getByRole("switch", { name: "搜索项目资料", exact: true }),
  ).toBeChecked();
  assert.equal(calls, 0);
  await expect(chat.locator("textarea")).toHaveValue("保留这条尚未发送的草稿");
  const capture = async (name: string, width: number, height: number) => {
    await settings.setViewportSize({ width, height });
    await settings.evaluate(() => scrollTo(0, 0));
    await root
      .locator(".ae-settings-layout")
      .evaluate((el) => (el.scrollTop = 0));
    await settings.waitForTimeout(180);
    assert.equal(
      await settings.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await settings.screenshot({
      path: `${review}/settings-${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  };
  await capture("tools-desktop", 1440, 1000);
  await capture("tools-mobile", 390, 844);
  await root.getByRole("tab", { name: "知识与记忆", exact: true }).click();
  await expect(
    root.getByRole("switch", { name: "保存新的记忆 · 用户偏好", exact: true }),
  ).toBeDisabled();
  await capture("memory-desktop", 1440, 1000);
  await settings
    .getByRole("button", { name: "切换深色模式", exact: true })
    .click();
  await capture("memory-mobile-dark", 390, 844);
  await settings
    .getByRole("button", { name: "切换浅色模式", exact: true })
    .click();
  await root.getByRole("tab", { name: "Skill", exact: true }).click();
  await capture("skills-desktop", 1440, 1000);
  await root.getByRole("switch", { name: "接入指导", exact: true }).uncheck();
  await root.getByRole("tab", { name: "工具", exact: true }).click();
  const lookup = root.getByRole("switch", {
    name: "搜索项目资料",
    exact: true,
  });
  await lookup.uncheck();
  await root
    .getByRole("switch", { name: "读取资料目录", exact: true })
    .uncheck();
  await expect(
    root.getByRole("switch", { name: "受限资料", exact: true }),
  ).toBeDisabled();
  const search = root.getByRole("searchbox", {
    name: "搜索工具名称或介绍",
    exact: true,
  });
  await search.fill("目录");
  await expect(lookup).not.toBeVisible();
  await search.fill("");
  await root.getByRole("tab", { name: "知识与记忆", exact: true }).click();
  await root.getByRole("switch", { name: "产品知识库", exact: true }).uncheck();
  await root
    .getByRole("switch", { name: "读取历史记忆 · 用户偏好", exact: true })
    .uncheck();
  await root.getByRole("tab", { name: "回答与上下文", exact: true }).click();
  await capture("response-desktop", 1440, 1000);
  await root
    .getByRole("switch", { name: "展示思考内容", exact: true })
    .uncheck();
  await root
    .getByRole("switch", { name: "自动整理上下文", exact: true })
    .uncheck();
  await save.click();
  await expect(root.locator(".ae-settings-notice")).toContainText("配置已保存");
  await page.bringToFront();
  await chat.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    chat.locator(".ae-message-agent > .ae-message-text"),
  ).toContainText("配置验证完成");
  assert.equal(calls, 1);
  assert.deepEqual(latestTools, []);
  await settings.reload();
  await expect(
    root.getByRole("switch", { name: "搜索项目资料", exact: true }),
  ).not.toBeChecked();
  await expect(save).toBeDisabled();
  // A second tab retains its draft when another save wins the version check.
  const stale = await context.newPage();
  await stale.goto(settings.url());
  const staleRoot = stale.locator("[data-agent-chat]");
  await expect(
    staleRoot.getByRole("switch", { name: "搜索项目资料", exact: true }),
  ).not.toBeChecked();
  await lookup.check();
  await save.click();
  await expect(save).toBeDisabled();
  await staleRoot
    .getByRole("switch", { name: "读取资料目录", exact: true })
    .check();
  await staleRoot
    .getByRole("button", { name: "保存配置", exact: true })
    .click();
  await expect(staleRoot.locator(".ae-settings-notice")).toContainText(
    "CONFIG_VERSION_CONFLICT",
  );
  await expect(
    staleRoot.getByRole("switch", { name: "读取资料目录", exact: true }),
  ).toBeChecked();
  stale.on("dialog", (dialog) => dialog.accept());
  await stale.close();
  // Lost successful POST is reconciled by reading authoritative settings, without replaying the write.
  await root.getByRole("switch", { name: "读取资料目录", exact: true }).check();
  let lost = 0;
  await settings.route(
    "**/api/agent-chat/sessions/*/settings",
    async (route) => {
      if (route.request().method() === "POST" && lost++ === 0) {
        await route.fetch();
        await route.abort();
      } else await route.continue();
    },
  );
  await save.click();
  await expect(save).toBeDisabled();
  await expect(root.locator(".ae-settings-notice")).toContainText("配置已保存");
  await settings.unrouteAll();
  // Native tab keyboard and reduced-motion switches remain usable.
  await root.getByRole("tab", { name: "工具", exact: true }).focus();
  await settings.keyboard.press("End");
  await expect(
    root.getByRole("tab", { name: "回答与上下文", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await settings.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await root
      .getByRole("switch", { name: "展示思考内容", exact: true })
      .evaluate((el) => getComputedStyle(el, "::after").transitionDuration),
    "0s",
  );
  config.skills = [];
  config.memory = { stores: [] };
  await settings.reload();
  await root.getByRole("tab", { name: "知识与记忆", exact: true }).click();
  await expect(
    root.getByRole("switch", { name: "读取历史记忆", exact: true }),
  ).toBeDisabled();
  await capture("empty-mobile", 390, 844);
  await root.getByRole("tab", { name: "Skill", exact: true }).click();
  await expect(
    root.locator(".ae-settings-empty").filter({ hasText: "尚未接入 Skill" }),
  ).toBeVisible();
  // Review F2: initial reads never announce a write. Hold the real GET response.
  let releaseRead = () => {};
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  await settings.route(
    "**/api/agent-chat/sessions/*/settings",
    async (route) => {
      await readGate;
      await route.continue();
    },
  );
  await settings.reload();
  await expect(
    root.getByRole("button", { name: "正在读取…", exact: true }),
  ).toBeDisabled();
  await expect(root.locator(".ae-settings-save-state")).toHaveText(
    "正在读取配置",
  );
  await capture("loading-desktop", 1440, 1000);
  releaseRead();
  await expect(save).toBeDisabled();
  await expect(lookup).toBeChecked();
  await settings.unrouteAll();
  // Review F1: explicit loss of access clears the stale catalog; recover only after GET succeeds.
  for (const [status, code] of [
    [401, "CHAT_UNAUTHENTICATED"],
    [403, "ACCESS_DENIED"],
    [403, "CHAT_SETTINGS_DISABLED"],
  ] as const) {
    await lookup.uncheck();
    await settings.route("**/api/agent-chat/sessions/*/settings", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code } }),
      }),
    );
    await save.click();
    await expect(root.locator(".ae-settings-notice")).toContainText(code);
    await expect(lookup).not.toBeVisible();
    await expect(save).toBeDisabled();
    await expect(
      root.getByRole("button", { name: "恢复助手默认", exact: true }),
    ).toBeDisabled();
    await expect(root.locator(".ae-settings-save-state")).toHaveText(
      "旧配置已不可用",
    );
    // The same denial during reload cannot restore the old editable view.
    await root
      .getByRole("button", { name: "重新载入配置", exact: true })
      .click();
    await expect(root.locator(".ae-settings-notice")).toContainText(code);
    await expect(save).toBeDisabled();
    if (code === "ACCESS_DENIED") await capture("access-mobile", 390, 844);
    await settings.unrouteAll();
    await root
      .getByRole("button", { name: "重新载入配置", exact: true })
      .click();
    await expect(lookup).toBeChecked();
    await expect(lookup).toBeEnabled();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Chat settings passed: IM opens separate page before first send, draft preserved, actual capability/memory switches, native tabs/search, disabled permissions, save/reload, stale-tab conflict, lost-save reconciliation, reduced motion, read status, revoked access and recovery; nine viewport/state captures.",
  );
} finally {
  await browser.close();
  await new Promise<void>((r) => {
    server.close(() => r());
    server.closeAllConnections();
  });
  await engine.close();
}
