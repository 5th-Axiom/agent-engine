import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import {
  createEngineTestHarness,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
import { loadArticles, searchArticles } from "./content.js";
import { renderArticle } from "./render.js";
import {
  docsBinding,
  docsAssistant,
  startDocsSite,
  clipExcerpt,
} from "./server.js";

const articles = await loadArticles();
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
  for (const match of page.html.matchAll(/href="(\/docs\/[^"#]+)(?:#[^"]*)?"/g))
    assert.ok(
      articles.some((a) => `/docs/${a.id}/` === match[1]),
      match[1],
    );
}
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

const model = scriptedModel([
  toolCall("docs.search", { query: "API Key 密钥文件" }),
  finalText(
    "合成测试回答：模型密钥放在 .secrets/credentials.json，模型连接放在 .local/models.json。参考：模型与密钥 /docs/models/",
  ),
  finalText("合成普通聊天回答：你好，今天也可以聊聊你的想法。"),
]);
const harness = await createEngineTestHarness({
  model,
  bindings: { "docs.search.v1": docsBinding(articles) },
  authorize: async () => true,
});
const host = await startDocsSite({
  articles,
  engine: harness.engine,
  assistant: docsAssistant(harness.modelConfig.models.primary),
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
  await page.goto(host.url);
  await expect(
    page.getByRole("button", { name: "打开文档助手", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "从第一句「你好」开始", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: new URL("desktop.png", captures).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "搜索文档…" }).click();
  await page.getByRole("searchbox", { name: "搜索文档内容" }).fill("密钥");
  await expect(page.locator("#search-results a").first()).toContainText(
    "模型与密钥",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/docs\/models\/$/);
  await expect(
    page.getByRole("heading", { name: "模型与密钥", exact: true }),
  ).toBeVisible();
  const firstCopy = page.getByRole("button", { name: "复制代码" }).first();
  await firstCopy.click();
  assert.ok(
    (await page.evaluate(() => navigator.clipboard.readText())).includes(
      "chmod 700",
    ),
  );
  const keyCommand = await page.locator("pre code").nth(1).textContent();
  assert.ok(
    keyCommand?.includes("+ '\\n'"),
    "generated key command must preserve a JS newline escape",
  );
  await page.getByRole("button", { name: "询问本文", exact: true }).click();
  await expect(page.locator("[data-agent-chat] textarea")).toHaveValue(
    /模型与密钥/,
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
  await expect(page.locator("#assistant-sources")).toContainText("模型与密钥");
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
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  assert.ok(cookies.find((c) => c.name.startsWith("ae_docs_"))?.httpOnly);
  const sessions = (await (
    await fetch(host.url + "/api/agent-chat/sessions", {
      headers: { cookie: cookieHeader },
    })
  ).json()) as { id: string }[];
  assert.equal(sessions.length, 1);
  assert.equal(
    (await fetch(host.url + "/api/agent-chat/sessions")).status,
    401,
  );
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(host.url);
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
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "把聊天图标接入你的后台", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/frontend\/$/);
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
  await page.goto(host.url + "/docs/quickstart/");
  await page.screenshot({
    path: new URL("desktop-article.png", captures).pathname,
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(host.url);
  await page.screenshot({
    path: new URL("mobile.png", captures).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开文档目录" }).click();
  await page
    .locator("#mobile-nav")
    .getByRole("link", { name: "模型与密钥", exact: true })
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
      ],
      model: "deterministic fixture; no provider calls",
    }),
  );
} finally {
  await browser.close();
  await host.close();
  await harness.close();
}
