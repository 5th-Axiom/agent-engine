import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Explicit provider smoke: sends three public, non-sensitive questions to an already running local host.
const url = process.env.AGENT_DOCS_SMOKE_URL ?? "http://127.0.0.1:4320";
if (new URL(url).hostname !== "127.0.0.1")
  throw Error("SMOKE_REQUIRES_LOCAL_HOST");
const browser = await chromium.launch({ headless: true });
const directory = new URL("./.impeccable/review/", import.meta.url);
await mkdir(directory, { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute(
    "data-chat-available",
    "true",
  );
  await page.getByRole("button", { name: "打开文档助手", exact: true }).click();
  const widget = page.locator("[data-agent-chat]");
  const questions = [
    "我第一次使用这个项目，API Key 应该放在哪里？请简短解释。",
    "先不谈项目，请给正在学习新东西的我一句简短的鼓励。",
    "这个项目现在支持多 Worker 分布式调度吗？包已经发布到公共 npm 了吗？请简短回答。",
  ];
  const report = [];
  for (const question of questions) {
    await widget.locator("textarea").fill(question);
    await widget.getByRole("button", { name: "发送", exact: true }).click();
    await expect(widget.locator(".ae-turn").last()).toContainText(question);
    await expect(
      widget.locator(".ae-turn").last().locator(".ae-turn-state"),
    ).toContainText(/已完成|\([A-Z_]+\)/, { timeout: 100000 });
    const cookie = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const sessionList = (await (
      await fetch(url + "/api/agent-chat/sessions", { headers: { cookie } })
    ).json()) as { id: string }[];
    const session = (await (
      await fetch(url + "/api/agent-chat/sessions/" + sessionList[0]!.id, {
        headers: { cookie },
      })
    ).json()) as {
      id: string;
      runs: {
        state: string;
        errorCode?: string;
        output: string;
        operations: { name: string; state: string }[];
      }[];
    };
    const run = session.runs.at(-1)!;
    assert.equal(
      run.state,
      "completed",
      run.errorCode ?? `unexpected state: ${run.state}`,
    );
    if (report.length === 1)
      assert.equal(
        run.operations.length,
        0,
        "ordinary chat should not require docs search",
      );
    else {
      assert.ok(
        run.operations.some(
          (o) => o.name === "docs.search" && o.state === "succeeded",
        ),
      );
      assert.match(run.output, /\/docs\/[a-z-]+\//);
    }
    report.push({ question, ...run, sessionId: session.id });
  }
  assert.match(report[0]!.output, /credentials\.json/);
  assert.match(report[2]!.output, /未|没有|不支持|不包括|不属于|不在/);
  for (const run of report)
    assert.ok(
      !run.output.includes("**") && !run.output.includes("```"),
      "default answers should suit the plain-text IM",
    );
  await page.reload();
  await page.getByRole("button", { name: "打开文档助手", exact: true }).click();
  await expect(widget.locator(".ae-turn")).toHaveCount(3);
  await page.screenshot({
    path: new URL("live-chat.png", directory).pathname,
    fullPage: false,
  });
  await writeFile(
    new URL("provider-smoke.json", directory),
    JSON.stringify(
      { at: new Date().toISOString(), passed: true, report },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      passed: true,
      realProvider: true,
      questions: report.length,
      docsSearchVerified: true,
      ordinaryChatVerified: true,
      scopeAnswerVerified: true,
      sessionId: report[0]!.sessionId,
    }),
  );
} finally {
  await browser.close();
}
