import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";

// Live local HTTP / database smoke. Creates one anonymous empty session; no model calls.
const url = process.env.AGENT_DOCS_SMOKE_URL ?? "http://127.0.0.1:4320";
if (new URL(url).hostname !== "127.0.0.1")
  throw Error("SMOKE_REQUIRES_LOCAL_HOST");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(url + "/ai/");
  const chat = page.locator("[data-agent-chat]");
  await expect(chat.locator(".ae-sidebar")).toBeVisible();
  await chat
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(chat.locator(".ae-tool-item")).toHaveCount(6);
  await page.keyboard.press("Escape");
  const created = await context.request.post(url + "/api/agent-chat/sessions", {
    headers: { Origin: new URL(url).origin, "X-Agent-Chat": "1" },
    data: { assistantId: "docs", requestId: randomUUID() },
  });
  assert.equal(created.status(), 201);
  const { id } = await created.json();
  const response = await context.request.get(
    url + "/api/agent-chat/sessions/" + id,
  );
  assert.equal(response.status(), 200);
  const saved = await response.json();
  assert.equal(saved.tools.length, 6);
  assert.ok(saved.createdAt > Date.now() - 60000);
  assert.ok(saved.configVersion >= 1);
  assert.equal(saved.totalRuns, 0);
  await chat.locator(`[data-session-id="${id}"]`).click();
  await chat.getByRole("button", { name: "当前会话", exact: true }).click();
  await expect(chat.locator(".ae-detail-panel")).toContainText(id);
  await chat
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(chat.locator(".ae-tool-list")).toContainText("code.read");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(chat.locator(`[data-session-id="${id}"]`)).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.goto(url + "/docs/frontend-customize/");
  await page.getByRole("button", { name: "打开文档助手", exact: true }).click();
  await chat.getByRole("button", { name: "对话列表", exact: true }).click();
  await expect(chat.locator(".ae-sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await chat
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(chat.locator(".ae-tool-item")).toHaveCount(6);
  console.log(
    JSON.stringify({
      passed: true,
      liveLocalHost: true,
      modelCalls: 0,
      checks: [
        "new-session-preview",
        "persisted-metadata",
        "session-details",
        "six-tools",
        "reload",
        "traditional-widget",
      ],
    }),
  );
} finally {
  await browser.close();
}
