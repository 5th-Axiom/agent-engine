import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Explicit provider smoke: sends four public, non-sensitive questions to an already running local host.
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
  const widget = page.locator("[data-agent-chat]");
  const questions = [
    "我要把聊天图标接入自己的管理后台。前端 SDK 用哪个挂载方法，是否还需要后端？请简短解释。",
    "先不谈项目，请给正在学习新东西的我一句简短的鼓励。",
    "我想只接后端 SDK，怎么创建会话、发消息和续聊？是否必须安装前端 SDK？请给准确的方法名并简短回答。",
    "请先用 api.lookup 定位 createSessionMemory，再用 code.read 阅读函数实现：浏览器存储读写失败时会怎样？请给源码路径、行号和提交版本，简短回答。",
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
          (o) =>
            [
              "docs.search",
              "docs.read",
              "api.lookup",
              "examples.find",
              "code.search",
              "code.read",
            ].includes(o.name) && o.state === "succeeded",
        ),
      );
      assert.match(run.output, /\/(?:docs|sources)\//);
    }
    report.push({ question, ...run, sessionId: session.id });
  }
  assert.match(report[0]!.output, /mountChatWidget/);
  assert.match(report[0]!.output, /后端|服务端/);
  assert.match(report[2]!.output, /createSession/);
  assert.match(report[2]!.output, /loadSession/);
  assert.match(report[2]!.output, /无需|不需|不必|不用/);
  for (const name of ["api.lookup", "code.read"])
    assert.ok(
      report[3]!.operations.some(
        (o) => o.name === name && o.state === "succeeded",
      ),
      name,
    );
  assert.match(report[3]!.output, /\/sources\/[a-f0-9]{40,64}\/.+#L\d+/);
  for (const run of report)
    assert.ok(
      !run.output.includes("**") && !run.output.includes("```"),
      "default answers should suit the plain-text IM",
    );
  await page.reload();
  await expect(widget.locator(".ae-turn")).toHaveCount(4);
  await expect(widget.locator(".ae-sidebar")).toBeVisible();
  await widget.getByRole("button", { name: "当前会话", exact: true }).click();
  await expect(widget.locator(".ae-detail-panel")).toContainText(
    report[0]!.sessionId,
  );
  await widget
    .getByRole("button", { name: "已接入工具（6）", exact: true })
    .click();
  await expect(widget.locator(".ae-tool-item")).toHaveCount(6);
  await expect(widget.locator(".ae-tool-list")).toContainText("code.read");
  await page.keyboard.press("Escape");
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
      projectRetrievalVerified: true,
      ordinaryChatVerified: true,
      integrationAnswersVerified: true,
      publicApiAndSourceReadVerified: true,
      sessionId: report[0]!.sessionId,
    }),
  );
} finally {
  await browser.close();
}
