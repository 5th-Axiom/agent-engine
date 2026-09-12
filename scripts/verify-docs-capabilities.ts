import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createAgentEngine, parseConfig } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
import { createDocsCapabilities } from "../examples/docs-site/capabilities.js";
import { startDocsRemoteCapabilities } from "../examples/docs-site/remote-capabilities.js";
import {
  docsAssistant,
  docsBinding,
  startDocsSite,
} from "../examples/docs-site/server.js";
import { loadArticles } from "../examples/docs-site/content.js";
import {
  createKnowledge,
  loadProjectSnapshot,
} from "../examples/docs-site/knowledge.js";
const articles = await loadArticles(),
  knowledge = createKnowledge(articles, await loadProjectSnapshot()),
  store = new MemoryStore(),
  capabilities = createDocsCapabilities({
    articles,
    store,
    memoryKey: randomBytes(32),
  }),
  remote = await startDocsRemoteCapabilities(articles);
const model = scriptedModel([
  toolCall("engine.memory.write.preferences", {
    id: "guide-preference",
    content: "接入偏好：使用 TypeScript；回答包含最小示例和验证步骤。",
    expectedVersion: null,
    evidenceRefs: ["user-request"],
  }),
  finalText("已记住你的接入偏好。"),
  toolCall("engine.question", {
    question: "你准备先接后端 SDK，还是完整聊天页面？",
  }),
  finalText("收到，我们先接后端。"),
  toolCall("engine.form.integration", {
    question: "补充接入需求后，我会给出具体步骤。",
  }),
  finalText("收到接入需求。"),
]);
const engine = await createAgentEngine({
  store,
  principal: { tenantId: "docs-site", subjectId: "host" },
  authorize: async () => true,
  secrets: { resolve: async () => "synthetic" },
  adapters: { models: { scripted: model } },
  bindings: {
    "docs.search.v1": docsBinding(articles),
    ...knowledge.bindings,
    ...capabilities.bindings,
  },
  remoteContracts: remote.contracts,
  policy: {
    allowedOrigins: ["https://model.example.com", remote.origin],
    allowPrivateOrigins: [remote.origin],
  },
});
const assistant = docsAssistant(
    {
      provider: "scripted",
      model: "合成验收模型",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "test" },
      limits: { contextWindowTokens: 64000, maxOutputTokens: 1500 },
    },
    knowledge,
  ),
  config = parseConfig(assistant.config);
config.tools.push(...remote.tools);
assistant.config = config;
const host = await startDocsSite({
    engine,
    assistant,
    articles,
    knowledge,
    capabilities,
    cookieSecret: "synthetic-ui-cookie",
    port: 0,
  }),
  browser = await chromium.launch({ headless: true }),
  dir = "examples/docs-site/.impeccable/review";
await mkdir(dir, { recursive: true });
const captures: string[] = [],
  errors: string[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const page = await context.newPage();
  await page.goto(host.url + "/ai/");
  const chat = page.locator("[data-agent-chat]");
  const send = async (text: string) => {
    await chat.locator(".ae-composer textarea").fill(text);
    await chat.getByRole("button", { name: "发送", exact: true }).click();
  };
  const capture = async (p: typeof page, name: string) => {
    await p.evaluate(() => scrollTo(0, 0));
    await expect
      .poll(() =>
        p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const path = dir + "/capabilities-" + name + ".png";
    await p.screenshot({ path, fullPage: true });
    captures.push(path);
  };
  await send("请记住我的接入偏好，使用 TypeScript，回答附验证步骤。");
  await expect(
    chat.getByRole("button", { name: "允许这一次", exact: true }),
  ).toBeVisible();
  await capture(page, "approval-desktop");
  await chat.getByRole("button", { name: "允许这一次", exact: true }).click();
  await expect(chat.locator(".ae-turn").last()).toContainText(
    "已记住你的接入偏好。",
  );
  const workspace = await context.newPage();
  await workspace.goto(host.url + "/ai/capabilities/");
  await expect(workspace.locator("#cap-overview")).toContainText("接入指南");
  await capture(workspace, "overview-desktop");
  await workspace.getByRole("link", { name: "长期记忆", exact: true }).click();
  await expect(workspace.locator("#memory-list")).toContainText(
    "使用 TypeScript",
  );
  await capture(workspace, "memory-desktop");
  await workspace.getByRole("link", { name: "配置实验", exact: true }).click();
  await workspace
    .getByRole("button", { name: "运行实验", exact: true })
    .click();
  await expect(workspace.locator("#experiment-result h3")).toHaveText(
    "检查通过",
  );
  await capture(workspace, "experiment-desktop");
  await workspace.getByLabel("允许一次输出修复").uncheck();
  await workspace
    .getByRole("button", { name: "运行实验", exact: true })
    .click();
  await expect(workspace.locator("#experiment-result")).toContainText(
    "OUTPUT_SCHEMA_INVALID",
  );
  await expect(workspace.locator("#experiment-result h3")).toHaveText(
    "检查通过",
  );
  await send("帮我选择接入范围");
  const pending = chat.locator(".ae-pending-input:not([hidden])");
  await expect(pending.getByLabel("你的回答")).toBeVisible();
  await pending.getByLabel("你的回答").fill("先接后端 SDK");
  await expect
    .poll(() => pending.getByLabel("你的回答").inputValue())
    .toBe("先接后端 SDK");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "question-mobile");
  await pending.getByRole("button", { name: "提交并继续" }).click();
  await expect(chat.locator(".ae-turn").last()).toContainText(
    "收到，我们先接后端。",
  );
  await send("收集接入需求");
  await expect(pending.getByLabel("接入目标")).toBeVisible();
  await pending.getByLabel("接入目标").selectOption("后端 SDK");
  await pending.getByLabel("开发语言").selectOption("TypeScript");
  await pending.getByLabel("你希望完成什么").fill("支持多轮对话和工具调用。");
  await capture(page, "form-mobile");
  await pending.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await capture(page, "form-mobile-top");
  await pending.getByRole("button", { name: "提交并继续" }).click();
  await expect(chat.locator(".ae-turn").last()).toContainText("收到接入需求。");
  await workspace.getByRole("link", { name: "会话调试", exact: true }).click();
  await expect(workspace.locator("#debug-select option")).toHaveCount(2);
  await workspace.locator("#debug-select").selectOption({ index: 1 });
  await expect(workspace.locator("#debug-result")).toContainText("运行次数");
  await workspace.setViewportSize({ width: 390, height: 844 });
  await workspace.getByRole("button", { name: "切换深色模式" }).click();
  await capture(workspace, "debug-mobile-dark");
  const settings = await context.newPage();
  const sessions = await (
    await context.request.get(host.url + "/api/agent-chat/sessions")
  ).json();
  await settings.goto(host.url + "/ai/settings/?session=" + sessions[0].id);
  await settings
    .locator("[data-agent-chat]")
    .getByRole("tab", { name: "知识与记忆", exact: true })
    .click();
  await expect(
    settings.getByRole("switch", { name: /^读取历史记忆 · / }),
  ).toBeEnabled();
  await capture(settings, "settings-desktop");
  await workspace.setViewportSize({ width: 390, height: 844 });
  await workspace.getByRole("link", { name: "长期记忆", exact: true }).click();
  await expect(workspace.locator("#memory-list")).toContainText(
    "使用 TypeScript",
  );
  await capture(workspace, "memory-mobile-dark");
  await workspace.getByRole("button", { name: "删除", exact: true }).click();
  await workspace.getByRole("button", { name: "保留", exact: true }).click();
  await expect(
    workspace.getByRole("button", { name: "删除", exact: true }),
  ).toBeFocused();
  await workspace.getByRole("button", { name: "删除", exact: true }).click();
  await workspace
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(workspace.locator("#memory-list")).toContainText(
    "还没有保存记忆",
  );
  await expect(
    workspace.getByRole("button", { name: "刷新记忆", exact: true }),
  ).toBeFocused();
  await workspace.getByRole("link", { name: "会话调试", exact: true }).click();
  await workspace.locator("#debug-select").selectOption(sessions[0].id);
  await workspace
    .getByRole("button", { name: "删除会话", exact: true })
    .click();
  await workspace
    .getByRole("button", { name: "保留会话", exact: true })
    .click();
  await expect(
    workspace.getByRole("button", { name: "删除会话", exact: true }),
  ).toBeFocused();
  await workspace
    .getByRole("button", { name: "归档会话", exact: true })
    .click();
  await expect(
    workspace.getByRole("button", { name: "取消归档", exact: true }),
  ).toBeFocused();
  await workspace
    .getByRole("button", { name: "取消归档", exact: true })
    .click();
  await expect(
    workspace.getByRole("button", { name: "归档会话", exact: true }),
  ).toBeFocused();
  const deniedUrl =
    host.url + "/api/docs-capabilities/sessions/" + sessions[0].id;
  await workspace.route(deniedUrl, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "ACCESS_DENIED" } }),
    }),
  );
  await workspace
    .getByRole("button", { name: "刷新会话", exact: true })
    .click();
  await expect(workspace.locator("#debug-select option")).toHaveCount(1);
  await expect(workspace.locator("#debug-result")).not.toContainText(
    "打开会话配置",
  );
  await capture(workspace, "denied-mobile-dark");
  await workspace.unroute(deniedUrl);
  await workspace.reload();
  await workspace.getByRole("link", { name: "配置实验", exact: true }).click();
  await expect(
    workspace.locator("#experiment-history .cap-report-row"),
  ).toHaveCount(2);
  await workspace.getByRole("link", { name: "会话调试", exact: true }).click();
  await expect(workspace.locator("#debug-select option")).toHaveCount(2);
  const lateList = await (
      await context.request.get(host.url + "/api/docs-capabilities/sessions")
    ).json(),
    savedCookies = await context.cookies();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await workspace.route(
    host.url + "/api/docs-capabilities/sessions",
    async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(lateList),
      });
    },
  );
  await workspace
    .getByRole("button", { name: "刷新会话", exact: true })
    .click();
  await context.clearCookies();
  await workspace.getByRole("link", { name: "长期记忆", exact: true }).click();
  await expect(
    workspace.getByRole("button", { name: "重新连接", exact: true }),
  ).toBeVisible();
  release();
  await expect(workspace.locator("#debug-select option")).toHaveCount(0);
  await expect(workspace.locator("#experiment-history")).toBeEmpty();
  await expect(workspace.locator("#debug-result")).toBeEmpty();
  await expect(
    workspace.getByRole("button", { name: "刷新记忆", exact: true }),
  ).toBeDisabled();
  await capture(workspace, "unauthenticated-mobile-dark");
  await workspace.unroute(host.url + "/api/docs-capabilities/sessions");
  await context.addCookies(savedCookies);
  await workspace.goto(host.url + "/ai/capabilities/#debug");
  await workspace.reload();
  await workspace.locator("#debug-select").selectOption(sessions[0].id);
  await workspace
    .getByRole("button", { name: "删除会话", exact: true })
    .click();
  await workspace
    .getByRole("button", { name: "确认删除会话", exact: true })
    .click();
  await expect(workspace.locator("#debug-select")).toBeFocused();
  await expect(workspace.locator("#debug-select option")).toHaveCount(1);
  assert.deepEqual(errors, []);
  assert.equal(model.requests.length, 6);
  await writeFile(
    dir + "/capabilities-ui-evidence.json",
    JSON.stringify(
      {
        passed: true,
        model: "deterministic",
        captures,
        checks: [
          "approval-before-memory-write",
          "pending-question-submit",
          "native-form-submit",
          "poll-preserves-draft",
          "13-real-engine-experiments",
          "repair-off-behavior",
          "scoped-debug",
          "live-settings-switches",
          "memory-delete",
          "401-clears-identity-and-invalidates-late-responses",
          "403-drops-record-refreshes-valid-list",
          "cancel-delete-archive-restores-focus",
          "desktop-mobile-dark",
          "no-overflow",
          "no-browser-errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      captures: captures.length,
      modelCalls: model.requests.length,
      browserErrors: errors.length,
    }),
  );
} finally {
  await browser.close();
  await host.close();
  await engine.close();
  await remote.close();
}
