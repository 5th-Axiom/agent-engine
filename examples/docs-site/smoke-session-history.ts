import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Explicit provider smoke against the standard launcher. All messages are synthetic;
// a fresh browser identity keeps actual users' conversations out of this check.
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
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url + "/ai/");
  const chat = page.locator("[data-agent-chat]");
  const send = async (input: string) => {
    await chat.locator(".ae-composer textarea").fill(input);
    await chat.getByRole("button", { name: "发送", exact: true }).click();
    await expect(chat.locator(".ae-turn").last()).toContainText(input);
    let view: any;
    await expect
      .poll(
        async () => {
          const sessions = await (
            await context.request.get(url + "/api/agent-chat/sessions")
          ).json();
          if (!sessions[0]) return "pending";
          view = await (
            await context.request.get(
              url + "/api/agent-chat/sessions/" + sessions[0].id,
            )
          ).json();
          return view.runs?.at(-1)?.state ?? "pending";
        },
        { timeout: 110000, intervals: [500, 1000] },
      )
      .toMatch(/^(completed|failed|cancelled)$/);
    const run = view.runs.at(-1);
    assert.equal(run.state, "completed", run.errorCode);
    return { sessionId: view.id as string, run };
  };
  const source = await send(
    "这是跨会话读取的合成验收。青柠项目的约定端口是 7319。只需确认收到，不要保存长期记忆，也不需要查询文档。",
  );
  await chat.getByRole("button", { name: "新对话", exact: true }).click();
  const target = await send(
    "请查一下我在另一个会话中说过：青柠项目约定用哪个端口？请读取那段聊天后简短回答，注明来自哪个会话。",
  );
  assert.notEqual(source.sessionId, target.sessionId);
  for (const name of ["sessions.search", "sessions.read"]) {
    assert.ok(
      target.run.operations.some(
        (o: any) => o.name === name && o.state === "succeeded",
      ),
      name,
    );
  }
  assert.match(target.run.output, /7319/);
  assert.ok(
    !target.run.operations.some(
      (o: any) => o.name === "engine.memory.write.preferences",
    ),
  );
  await expect(chat.locator(".ae-turn").last()).toContainText("7319");
  await expect(
    chat.getByRole("button", { name: "停止", exact: true }),
  ).toHaveCount(0, { timeout: 10000 });
  await page.screenshot({
    path: new URL("history-live-chat.png", directory).pathname,
  });
  await page.goto(url + "/ai/settings/?session=" + target.sessionId);
  for (const name of ["搜索历史会话", "读取会话内容"])
    await expect(page.getByRole("switch", { name, exact: true })).toBeChecked();
  await page.screenshot({
    path: new URL("history-live-settings.png", directory).pathname,
  });
  assert.deepEqual(errors, []);
  const report = {
    at: new Date().toISOString(),
    passed: true,
    realProvider: true,
    runs: 2,
    sourceSessionId: source.sessionId,
    targetSessionId: target.sessionId,
    tools: target.run.operations.map((o: any) => ({
      name: o.name,
      state: o.state,
    })),
    crossSessionAnswerVerified: true,
    settingsVerified: true,
    browserErrors: errors.length,
  };
  await writeFile(
    new URL("history-provider-smoke.json", directory),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
