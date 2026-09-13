import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { Marked, type Tokens } from "marked";
import { randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { parseConfig } from "@agent-runtime/sdk";
import {
  createEngineTestHarness,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
import { articleSections, loadArticles, searchArticles } from "./content.js";
import { deliveryForms } from "./delivery.js";
import { renderArticle } from "./render.js";
import { renderSourcePage } from "./ai-render.js";
import { readSettings } from "./snippets/settings.js";
import { inventoryTool, inventoryBinding } from "./snippets/tools.js";
import { createKnowledge, loadProjectSnapshot } from "./knowledge.js";
import { verifyKnowledge } from "./verify-knowledge.js";
import {
  docsBinding,
  docsAssistant,
  startDocsSite,
  clipExcerpt,
} from "./server.js";

const articles = await loadArticles();
const knowledge = createKnowledge(articles, await loadProjectSnapshot());
await verifyKnowledge(articles, knowledge);
assert.equal(new Set(articles.map((a) => a.id)).size, articles.length);
assert.equal(searchArticles(articles, "API Key 密钥")[0]?.id, "models");
assert.ok(
  searchArticles(articles, "React 嵌入").some((a) => a.id === "frontend"),
);
assert.equal(searchArticles(articles, "xyznonexistent876").length, 0);
assert.equal(searchArticles(articles, "").length, 0);
for (const max of [900, 1600]) {
  const clipped = clipExcerpt("中文文档与 emoji 🌱".repeat(800), max);
  assert.ok(Buffer.byteLength(clipped) <= max);
  assert.ok(!clipped.includes("\uFFFD"));
}
const retrieved = await docsBinding(articles).execute(
  { query: "API Key 配置" },
  {} as never,
);
assert.ok(
  Buffer.byteLength(JSON.stringify(retrieved)) < 4000,
  "retrieval must stay bounded across multi-turn chats",
);
for (const a of articles) {
  const page = renderArticle(a, articles);
  assert.ok(page.html.includes("<h1"));
  assert.ok(page.toc.length > 0);
  assert.equal(new Set(page.toc.map((t) => t.id)).size, page.toc.length);
  for (const section of articleSections(a).filter((section) => section.id))
    assert.ok(
      page.html.includes(`id="${section.id}"`),
      `${a.id}: searchable section has a rendered anchor`,
    );
  for (const match of page.html.matchAll(/href="(\/docs\/[^"#]+)(?:#[^"]*)?"/g))
    assert.ok(
      articles.some((a) => `/docs/${a.id}/` === match[1]),
      match[1],
    );
}
assert.deepEqual(
  deliveryForms
    .filter((form) => form.status === "undecided")
    .map((form) => form.id),
  ["npm", "cli", "archive", "installer"],
);
for (const form of deliveryForms.filter((form) => form.status === "undecided"))
  assert.ok(
    !("href" in form),
    "undecided releases must not pretend to be downloadable",
  );
const toolHTML = renderArticle(
  articles.find((a) => a.id === "tools")!,
  articles,
).html;
assert.ok(
  toolHTML.includes("tool-run.ts") && toolHTML.includes("hljs-keyword"),
  "checked source includes filename and syntax highlighting",
);
for (const [id, files] of [
  ["frontend", ["frontend.ts"]],
  ["frontend-server", ["chat-server.ts"]],
  ["sdk", ["backend.ts", "run.ts"]],
  ["models", ["settings.ts"]],
  ["tools", ["tool-run.ts"]],
] as const) {
  const article = articles.find((a) => a.id === id)!;
  const blocks = new Marked()
    .lexer(article.markdown)
    .filter((t): t is Tokens.Code => t.type === "code");
  for (const file of files) {
    const source = (
      await readFile(new URL("./snippets/" + file, import.meta.url), "utf8")
    ).trimEnd();
    assert.ok(
      blocks.some((b) => b.lang?.split(" ")[0] === "ts" && b.text === source),
      id + ": displayed code must exactly match checked source",
    );
  }
}
assert.ok(
  renderArticle(
    articles.find((a) => a.id === "frontend")!,
    articles,
  ).toc.some((h) => h.text === "React 中使用"),
);
assert.ok(
  renderArticle(
    articles.find((a) => a.id === "sdk")!,
    articles,
  ).toc.some((h) => h.text.includes("执行并检查结果")),
);
const malicious = renderArticle(
  {
    ...articles[0]!,
    markdown:
      "<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n![image](https://evil.invalid/pixel)\n\n~~~html\n<img src=x onerror=alert(1)>\n~~~",
  },
  articles,
).html;
assert.ok(!malicious.includes("<script>"));
assert.ok(!malicious.includes('href="javascript:'));
assert.ok(!malicious.includes("<img"));
const sourceHTML = renderSourcePage(
  {
    path: "packages/sdk/src/fixture.ts",
    text: '<script>alert("synthetic")</script>\n<img src=x onerror=alert(1)>',
  },
  knowledge.snapshot.revision,
);
assert.ok(!sourceHTML.includes("<script>alert("));
assert.ok(!sourceHTML.includes("<img"));
assert.ok(sourceHTML.includes("&lt;script&gt;"));

// The rendered snippets share these checked source files; validate real SDK configuration and a host binding.
const settings = readSettings({
  DATABASE_URL: "postgresql://example.invalid/docs",
  MODEL_BASE_URL: "https://model.example.com/v1",
  MODEL_NAME: "synthetic-model",
  MODEL_API_KEY: "synthetic-docs-key",
  PROTOCOL_KEY: "synthetic-docs-protection-key-only",
});
assert.equal(settings.config.models.primary?.apiKey.secretRef, "MODEL_API_KEY");
assert.equal(settings.modelOrigin, "https://model.example.com");
assert.equal(settings.allowPrivateModelOrigin, false);
await assert.rejects(settings.secrets.resolve("UNDECLARED"));
const exampleHarness = await createEngineTestHarness({
  model: scriptedModel([
    toolCall("inventory.read", { sku: "A" }),
    finalText("库存为 24。"),
    finalText("仍是同一段对话。"),
  ]),
  bindings: {
    "inventory.read.v1": inventoryBinding(async (sku, principal) => {
      assert.equal(sku, "A");
      assert.ok(principal.tenantId);
      return { available: 24 };
    }),
  },
});
try {
  const session = await exampleHarness.engine.createSession({
    config: { ...exampleHarness.modelConfig, tools: [inventoryTool] },
    requestId: "docs-example-create",
  });
  const result = await session.run({
    input: "查询 A 库存",
    requestId: "docs-example-first",
  });
  assert.equal(result.outputText, "库存为 24。");
  const restored = await exampleHarness.engine.loadSession(session.id);
  assert.equal(
    (await restored.run({ input: "继续对话", requestId: "docs-example-next" }))
      .outputText,
    "仍是同一段对话。",
  );
  assert.equal(exampleHarness.calls.forBinding("inventory.read.v1").length, 1);
} finally {
  await exampleHarness.close();
}

const model = scriptedModel([
  toolCall("docs.search", { query: "API Key 密钥文件" }),
  finalText(
    "合成测试回答：API Key 由服务端 secrets.resolve 读取；本例通过 --env-file 加载 .env。参考：配置模型与密钥 /docs/models/",
  ),
  finalText("合成普通聊天回答：你好，今天也可以聊聊你的想法。"),
  toolCall("api.lookup", { query: "mountChatWidget" }),
  finalText(
    `合成源码回答：mountChatWidget 是公开挂载入口。参考：/sources/${knowledge.snapshot.revision}/packages/chat-ui/src/pages/mount.ts#L82`,
  ),
  finalText("这是第二段独立的合成对话。"),
]);
const harness = await createEngineTestHarness({
  model,
  bindings: { "docs.search.v1": docsBinding(articles), ...knowledge.bindings },
  authorize: async () => true,
});
const assistant = docsAssistant(harness.modelConfig.models.primary, knowledge);
const assistantConfig = parseConfig(assistant.config);
assistantConfig.models.secondary = {
  ...assistantConfig.models.primary!,
  model: "synthetic-secondary",
};
assistant.config = assistantConfig;
const host = await startDocsSite({
  articles,
  knowledge,
  engine: harness.engine,
  assistant,
  cookieSecret: randomBytes(32),
  port: 0,
});
const browser = await chromium.launch({ headless: true });
const captures = new URL("./.impeccable/review/", import.meta.url);
await mkdir(captures, { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(host.url + "/docs/welcome/");
  await expect(
    page.getByRole("button", { name: "打开文档助手", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "从这里开始", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".product-table").getByRole("link", { name: "嵌入界面" }),
  ).toBeVisible();
  await expect(
    page.locator(".product-table").getByRole("link", { name: "创建对话" }),
  ).toBeVisible();
  await page.screenshot({
    path: new URL("desktop.png", captures).pathname,
    fullPage: true,
  });
  for (const [label, route] of [
    ["嵌入界面", "frontend"],
    ["创建对话", "sdk"],
  ]) {
    await page
      .locator(".product-table")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/docs/${route}/$`));
    await expect(page.locator(".code-block").first()).toBeVisible();
    await page
      .getByRole("link", { name: "Agent Engine 文档首页", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "从这里开始", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "切换深色模式" }).click();
  await page.screenshot({
    path: new URL("intro-dark.png", captures).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换浅色模式" }).click();
  await page.getByRole("button", { name: "搜索文档…" }).click();
  await page.getByRole("searchbox", { name: "搜索文档内容" }).fill("密钥");
  await expect(page.locator("#search-results a").first()).toContainText(
    "配置模型与密钥",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/docs\/models\/$/);
  await expect(
    page.getByRole("heading", { name: "配置模型与密钥", exact: true }),
  ).toBeVisible();
  const firstCopy = page.getByRole("button", { name: "复制代码" }).first();
  await firstCopy.click();
  assert.ok(
    (await page.evaluate(() => navigator.clipboard.readText())).includes(
      "MODEL_API_KEY=REPLACE_WITH_YOUR_PROVIDER_KEY",
    ),
  );
  const settingsCode = await page.locator("pre code").nth(1).textContent();
  assert.ok(settingsCode?.includes('apiKey: { secretRef: "MODEL_API_KEY" }'));
  await page.getByRole("button", { name: "搜索文档…" }).click();
  await page
    .getByRole("searchbox", { name: "搜索文档内容" })
    .fill("MODEL_IMAGE_TOKENS");
  const imageSearch = page
    .locator('#search-results a[href*="/docs/images/"]')
    .first();
  await expect(imageSearch.locator("mark")).toContainText("MODEL_IMAGE_TOKENS");
  const imageSearchHref = await imageSearch.getAttribute("href");
  assert.ok(
    imageSearchHref?.includes("#"),
    "body match links directly to its section",
  );
  await imageSearch.click();
  await expect(page).toHaveURL(/\/docs\/images\/#/);
  const searchedAnchor = decodeURIComponent(new URL(page.url()).hash.slice(1));
  await expect(page.locator(`[id="${searchedAnchor}"]`)).toBeVisible();
  await page.goto(host.url + "/docs/models/");
  await page.getByRole("button", { name: "询问本文", exact: true }).click();
  await expect(page.locator("[data-agent-chat] textarea")).toHaveValue(
    /配置模型与密钥/,
  );
  await page
    .locator("[data-agent-chat] textarea")
    .fill("API Key 应该放在哪里？");
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "发送", exact: true })
    .click();
  await expect(page.locator("[data-agent-chat]")).toContainText(
    "合成测试回答",
    { timeout: 15000 },
  );
  assert.equal(harness.calls.forBinding("docs.search.v1").length, 1);
  await expect(
    page.locator("[data-agent-chat] .ae-turn").first().locator(".ae-sources"),
  ).toContainText("配置模型与密钥");
  await page.locator("[data-agent-chat] textarea").fill("你好，今天聊点别的");
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "发送", exact: true })
    .click();
  await expect(page.locator("[data-agent-chat]")).toContainText(
    "合成普通聊天回答",
    { timeout: 15000 },
  );
  assert.equal(harness.calls.forBinding("docs.search.v1").length, 1);
  await page.locator("[data-agent-chat] textarea").fill("切换模式后保留的问题");
  await page.evaluate(() => window.scrollTo(0, 350));
  const readingY = await page.evaluate(() => window.scrollY);
  const cacheScope = await page
    .locator("body")
    .getAttribute("data-chat-cache-scope");
  assert.match(cacheScope!, /^[a-f0-9]{64}$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(sessionStorage).find((key) =>
          key.startsWith("agent-chat:history:"),
        );
        return key
          ? JSON.parse(sessionStorage.getItem(key)!).sessions.length
          : 0;
      }),
    )
    .toBe(1);
  let releaseHistory!: () => void;
  const heldHistory = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  const historyRoute = "**/api/agent-chat/sessions";
  await page.route(historyRoute, async (route) => {
    if (route.request().method() === "GET") await heldHistory;
    await route.continue();
  });
  // Click the visible sticky link without Playwright scrolling its DOM position to the top.
  const modeBox = await page
    .getByRole("link", { name: "询问文档", exact: true })
    .boundingBox();
  await page.mouse.click(
    modeBox!.x + modeBox!.width / 2,
    modeBox!.y + modeBox!.height / 2,
  );
  await expect(page).toHaveURL(/\/ai\/$/);
  await expect(page.locator("body")).toHaveAttribute(
    "data-chat-cache-scope",
    cacheScope!,
  );
  await expect(page.locator("[data-agent-chat] .ae-history-item")).toHaveCount(
    1,
  );
  await expect(
    page.locator("[data-agent-chat] .ae-history-status"),
  ).toBeHidden();
  releaseHistory();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.locator("#reading-trail a")).toContainText(
    "配置模型与密钥",
  );
  await expect(page.locator("[data-agent-chat]")).toHaveAttribute(
    "data-presentation",
    "page",
  );
  await expect(page.locator("[data-agent-chat] .ae-turn")).toHaveCount(2);
  await expect(page.locator("[data-agent-chat] textarea")).toHaveValue(
    "切换模式后保留的问题",
  );
  await page.screenshot({ path: new URL("ai-history.png", captures).pathname });
  // Simulate a pre-upgrade session belonging to this visitor.
  const remembered = await page.evaluate(() =>
    localStorage.getItem("agent-chat:session:docs-site:" + location.origin),
  );
  const visitorId = (await context.cookies())
    .find((c) => c.name.startsWith("ae_docs_"))!
    .value.split(".")[0]!;
  const owner = harness.engine.forPrincipal({
    tenantId: "docs-site",
    subjectId: visitorId,
  });
  const old = await owner.readSession(remembered!);
  const oldConfig = structuredClone(old.config);
  oldConfig.tools = oldConfig.tools?.filter((t) => t.name === "docs.search");
  delete oldConfig.models.secondary;
  delete oldConfig.metadata!.docsAssistantVersion;
  await (
    await owner.loadSession(old.id)
  ).replaceConfig({ ifVersion: old.version, config: oldConfig });
  const readsBeforeUpgrade = model.requests.length;
  const migrated = await (
    await page.request.get(host.url + "/api/agent-chat/sessions/" + old.id)
  ).json();
  assert.deepEqual(
    migrated.models.map((m: { id: string }) => m.id),
    ["primary", "secondary"],
  );
  assert.equal(migrated.runs.length, 2);
  assert.equal(migrated.configVersion, old.version + 2);
  assert.equal(
    model.requests.length,
    readsBeforeUpgrade,
    "reading idle history updates choices without calling a model",
  );
  await page
    .locator("[data-agent-chat] textarea")
    .fill("查询 mountChatWidget 的源码");
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "发送", exact: true })
    .click();
  await expect(page.locator("[data-agent-chat]")).toContainText(
    "合成源码回答",
    { timeout: 15000 },
  );
  assert.equal(harness.calls.forBinding("api.lookup.v1").length, 1);
  const upgraded = await owner.readSession(old.id);
  assert.equal(upgraded.config.tools?.length, 6);
  assert.ok(upgraded.config.metadata?.docsAssistantVersion);
  const sdk = page.locator("[data-agent-chat]");
  await expect(sdk.locator(".ae-sidebar")).toBeVisible();
  await expect(sdk.locator(".ae-history-item")).toHaveCount(1);
  await expect(sdk.locator(".ae-history-item")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await sdk.getByLabel("更多操作", { exact: true }).click();
  await sdk.getByRole("button", { name: "当前会话", exact: true }).click();
  await expect(sdk.locator(".ae-detail-panel")).toContainText(old.id);
  await page.screenshot({
    path: new URL("ai-session-details.png", captures).pathname,
  });
  await sdk.getByLabel("更多操作", { exact: true }).click();
  await sdk
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(sdk.locator(".ae-tool-item")).toHaveCount(6);
  await expect(sdk.locator(".ae-tool-item").first()).toContainText("搜索文档");
  await expect(sdk.locator(".ae-tool-list")).toContainText("code.read");
  await page.screenshot({ path: new URL("ai-tools.png", captures).pathname });
  await page.getByRole("button", { name: "切换深色模式" }).click();
  await page.screenshot({
    path: new URL("ai-tools-dark.png", captures).pathname,
  });
  await page.getByRole("button", { name: "切换浅色模式" }).click();
  await sdk
    .locator(".ae-detail-panel")
    .getByRole("button", {
      name: "关闭面板",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Escape");
  await expect(sdk.locator(".ae-detail-panel")).not.toBeVisible();
  await expect(sdk.getByLabel("更多操作", { exact: true })).toBeFocused();
  await sdk.getByRole("button", { name: "新对话", exact: true }).click();
  await sdk.locator("textarea").fill("第二个合成问题");
  await sdk.getByRole("button", { name: "发送", exact: true }).click();
  await expect(sdk).toContainText("这是第二段独立的合成对话。", {
    timeout: 15000,
  });
  await expect(sdk.locator(".ae-history-item")).toHaveCount(2);
  await sdk.getByLabel("更多操作", { exact: true }).click();
  await sdk.getByRole("button", { name: "当前会话", exact: true }).click();
  await sdk.locator(`[data-session-id="${old.id}"]`).click();
  await expect(sdk.locator(".ae-detail-panel")).toContainText(old.id);
  await page.keyboard.press("Escape");
  await expect(sdk.locator(".ae-turn")).toHaveCount(3);
  await expect(
    sdk.locator(".ae-turn").last().locator(".ae-sources a"),
  ).toContainText("mount.ts");
  const sourceHref = await sdk
    .locator(".ae-turn")
    .last()
    .locator(".ae-sources a")
    .getAttribute("href");
  const sourcePage = await context.newPage();
  await sourcePage.goto(new URL(sourceHref!, host.url).href);
  await expect(sourcePage.locator(".source-code")).toContainText(
    "mountChatWidget",
  );
  await expect(sourcePage.locator("#L82")).toBeAttached();
  await sourcePage.close();
  for (const path of [
    `/sources/${knowledge.snapshot.revision}/.secrets/credentials.json`,
    `/sources/${"0".repeat(40)}/packages/sdk/src/index.ts`,
    `/sources/${knowledge.snapshot.revision}/packages/sdk/src/../../../../.local/models.json`,
  ])
    assert.equal((await fetch(host.url + path)).status, 404);
  await page.locator("[data-agent-chat] textarea").fill("返回文档时也保留草稿");
  await sdk.getByLabel("更多操作", { exact: true }).click();
  await sdk.getByRole("button", { name: "当前会话", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(sdk.locator("textarea")).toHaveValue("返回文档时也保留草稿");
  await page
    .locator(".mode-switch")
    .getByRole("link", { name: "阅读文档", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/models\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingY);
  const closedReadingBox = await page.locator("main").boundingBox();
  await page.getByRole("button", { name: "打开文档助手", exact: true }).click();
  await expect(page.locator("[data-agent-chat] .ae-sidebar")).not.toBeVisible();
  assert.deepEqual(
    await page.locator("main").boundingBox(),
    closedReadingBox,
    "opening an overlay must not reflow the article or move its reading position",
  );
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1000 });
  await expect
    .poll(async () => {
      const reading = (await page.locator("main").boundingBox())!;
      const panel = (await page
        .locator("[data-agent-chat] dialog")
        .boundingBox())!;
      return reading.x + reading.width <= panel.x;
    })
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "对话列表", exact: true })
    .click();
  await expect(page.locator("[data-agent-chat] .ae-sidebar")).toBeVisible();
  await page.screenshot({
    path: new URL("widget-sidebar.png", captures).pathname,
  });
  await page.keyboard.press("Escape");
  await page
    .locator("[data-agent-chat]")
    .getByLabel("更多操作", { exact: true })
    .click();
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(page.locator("[data-agent-chat] .ae-tool-item")).toHaveCount(6);
  await page.screenshot({
    path: new URL("widget-tools.png", captures).pathname,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-agent-chat] .ae-turn")).toHaveCount(3);
  await expect(page.locator("[data-agent-chat] textarea")).toHaveValue(
    "返回文档时也保留草稿",
  );
  await page.locator("[data-agent-chat] textarea").fill("");
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  assert.ok(cookies.find((c) => c.name.startsWith("ae_docs_"))?.httpOnly);
  const sessions = (await (
    await fetch(host.url + "/api/agent-chat/sessions", {
      headers: { cookie: cookieHeader },
    })
  ).json()) as { id: string }[];
  assert.equal(sessions.length, 2);
  assert.equal(
    (await fetch(host.url + "/api/agent-chat/sessions")).status,
    401,
  );
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(host.url);
  await expect(otherPage).toHaveURL(/\/ai\/$/);
  await expect(otherPage.locator("[data-agent-chat]")).toContainText(
    "你想用 Agent Engine 做什么？",
  );
  await expect(
    otherPage.locator("[data-agent-chat] .ae-welcome h3"),
  ).toBeInViewport();
  await expect(
    otherPage.locator("[data-agent-chat] .ae-suggestions button").last(),
  ).toBeInViewport({ ratio: 1 });
  await otherPage.screenshot({
    path: new URL("ai-desktop.png", captures).pathname,
  });
  await otherPage.getByRole("button", { name: "切换深色模式" }).click();
  await otherPage.screenshot({
    path: new URL("ai-desktop-dark.png", captures).pathname,
  });
  await otherPage.getByRole("button", { name: "切换浅色模式" }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await otherPage.setViewportSize({
      width,
      height: width <= 390 ? 844 : 900,
    });
    assert.equal(
      await otherPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `AI overflow at ${width}`,
    );
    assert.equal(
      await otherPage
        .locator("[data-agent-chat] .ae-transcript")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `SDK transcript overflow at ${width}`,
    );
    assert.equal(
      await otherPage
        .locator("[data-agent-chat] .ae-transcript")
        .evaluate((el) => el.scrollTop),
      0,
      `empty state starts at the heading at ${width}`,
    );
    await expect(
      otherPage.locator("[data-agent-chat] .ae-suggestions button").last(),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      otherPage.locator("[data-agent-chat] textarea"),
    ).toBeInViewport();
    await expect(
      otherPage.getByRole("link", { name: "阅读文档", exact: true }),
    ).toBeVisible();
    if (width === 320 || width === 390 || width === 768)
      await otherPage.screenshot({
        path: new URL(`ai-${width}.png`, captures).pathname,
      });
  }
  const otherCookie = (await other.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  assert.equal(
    (
      await fetch(host.url + "/api/agent-chat/sessions/" + sessions[0]!.id, {
        headers: { cookie: otherCookie },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(host.url + "/api/agent-chat/config", {
        headers: { cookie: cookieHeader + "x" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(host.url + "/api/agent-chat/sessions", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          origin: "https://evil.invalid",
          "x-agent-chat": "1",
          "content-type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  for (const path of [
    "/.secrets/credentials.json",
    "/.local/models.json",
    "/docs/no-such-page/",
    "/assets/../../.secrets/credentials.json",
  ])
    assert.equal((await fetch(host.url + path)).status, 404, path);
  await other.close();
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "收起聊天" })
    .click();
  const scenarios = page
    .locator(".sidebar .nav-group")
    .filter({ has: page.locator("summary", { hasText: "使用场景" }) });
  if ((await scenarios.getAttribute("open")) === null)
    await scenarios.locator("summary").click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "嵌入聊天界面", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/frontend\/$/);
  await page.getByRole("tab", { name: "React", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel")).toContainText("useEffect");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Vue", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("onMounted");
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Vue", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "JavaScript", exact: true }).click();
  await page.getByRole("button", { name: "打开文档助手", exact: true }).click();
  await expect(page.locator("[data-agent-chat]")).toContainText(
    "合成普通聊天回答",
  );
  await page
    .locator("[data-agent-chat]")
    .getByRole("button", { name: "收起聊天" })
    .click();
  await page.getByRole("button", { name: "切换深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: new URL("desktop-dark.png", captures).pathname,
    fullPage: false,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切换浅色模式" }).click();
  await page.goto(host.url + "/docs/sdk/");
  await page.screenshot({
    path: new URL("desktop-article.png", captures).pathname,
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(host.url + "/docs/welcome/");
  await page.screenshot({
    path: new URL("mobile.png", captures).pathname,
    fullPage: true,
  });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const table = page.locator(".product-table");
    assert.equal(
      await table.evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await page.screenshot({
      path: new URL(`intro-${width}.png`, captures).pathname,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开文档目录" }).click();
  await page
    .locator("#mobile-nav summary")
    .filter({ hasText: "使用场景" })
    .click();
  await page
    .locator("#mobile-nav")
    .getByRole("link", { name: "配置模型与密钥", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/models\/$/);
  await expect(page.locator("#mobile-nav")).not.toBeVisible();
  await page.getByRole("button", { name: "询问本文", exact: true }).click();
  await expect(page.locator("[data-agent-chat] dialog")).toHaveAttribute(
    "data-mobile",
    "true",
  );
  const box = await page.locator("[data-agent-chat] dialog").boundingBox();
  assert.equal(Math.round(box!.width), 390);
  await page.screenshot({
    path: new URL("mobile-chat.png", captures).pathname,
    fullPage: false,
  });
  const mobileChat = page.locator("[data-agent-chat]");
  await expect(mobileChat.locator(".ae-sidebar")).not.toBeVisible();
  await mobileChat
    .getByRole("button", { name: "对话列表", exact: true })
    .click();
  await expect(mobileChat.locator(".ae-sidebar")).toBeVisible();
  await page.screenshot({
    path: new URL("mobile-sidebar.png", captures).pathname,
  });
  await mobileChat.locator(`[data-session-id="${old.id}"]`).click();
  await expect(mobileChat.locator(".ae-sidebar")).not.toBeVisible();
  await expect(
    mobileChat.getByRole("button", { name: "对话列表", exact: true }),
  ).toBeFocused();
  await mobileChat.getByLabel("更多操作", { exact: true }).click();
  await mobileChat
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(mobileChat.locator(".ae-tool-item")).toHaveCount(6);
  await page.screenshot({
    path: new URL("mobile-tools.png", captures).pathname,
  });
  await page.keyboard.press("Tab");
  const toolRegion = mobileChat.getByRole("region", {
    name: "已接入工具",
    exact: true,
  });
  await expect(toolRegion).toBeFocused();
  await page.keyboard.press("End");
  await expect(mobileChat.locator(".ae-tool-item").last()).toBeInViewport();
  assert.equal(
    await toolRegion.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.keyboard.press("Escape");
  await expect(mobileChat.locator("dialog")).toBeVisible();
  await expect(
    mobileChat.getByLabel("更多操作", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "打开文档助手", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, `overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  const offline = await startDocsSite({
    articles,
    cookieSecret: randomBytes(32),
    port: 0,
  });
  try {
    await page.goto(offline.url);
    await expect(page).toHaveURL(/\/ai\/$/);
    await expect(
      page.getByRole("heading", { name: "文档助手尚未连接" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".mode-switch")
        .getByRole("link", { name: "阅读文档", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: new URL("ai-offline.png", captures).pathname,
    });
    await page.goto(offline.url + "/docs/welcome/");
    await page
      .getByRole("button", { name: "打开文档助手", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "文档助手尚未连接" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "查看启动方法" }).click();
    await expect(page).toHaveURL(/\/docs\/docs-site\/$/);
  } finally {
    await offline.close();
  }
  console.log(
    JSON.stringify({
      passed: true,
      articles: articles.length,
      checks: [
        "render-links",
        "idle-history-model-catalog-migration",
        "rendered-code-matches-checked-source",
        "backend-config-binding-and-session",
        "html-safety",
        "Chinese-search",
        "copy-code",
        "contextual-question",
        "docs-tool",
        "ordinary-chat",
        "cookie-integrity",
        "visitor-isolation",
        "origin-policy",
        "route-boundary",
        "SPA-chat-persistence",
        "dark-theme",
        "mobile-menu",
        "mobile-chat",
        "5-width-overflow",
        "read-only-mode",
        "AI-default-SDK-page",
        "mode-switch-history-and-draft",
        "visitor-scoped-list-cache-before-delayed-network",
        "six-read-tools-engine-execution",
        "source-version-lines-and-route-boundary",
        "committed-allowlist-no-symlinks-or-dirty-files",
        "lossless-docs-read-pagination",
        "AI-5-widths-dark-offline",
        "sidebar-select-and-current-session-details",
        "public-tool-catalog-and-mobile-panels",
        "docked-reading-without-overlap",
        "mode-return-article-scroll-and-draft",
        "per-reply-allowlisted-references",
        "framework-keyboard-tabs-and-deep-links",
      ],
      model: "deterministic fixture; no provider calls",
    }),
  );
} finally {
  await browser.close();
  await host.close();
  await harness.close();
}
