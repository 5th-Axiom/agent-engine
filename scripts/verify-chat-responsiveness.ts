import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { ChatSession, ChatRun } from "@agent-runtime/chat-core";

// Synthetic HTTP fixtures deliberately hold each independent request open.
// No provider credentials, real conversations or private response payloads are used.
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}
const a = randomUUID(),
  b = randomUUID(),
  c = randomUUID(),
  runId = randomUUID();
const run = (input: string, output = "已完成的合成回答"): ChatRun => ({
  id: randomUUID(),
  sequence: 1,
  input,
  output,
  draft: "",
  state: "completed",
  cancelRequested: false,
  steps: 1,
  attempts: 1,
  operations: [],
  usage: { complete: false, costComplete: false },
});
const session = (id: string, input: string): ChatSession => ({
  id,
  assistantId: "demo",
  title: input,
  createdAt: 1,
  runs: [run(input)],
  totalRuns: 1,
  snapshotSequence: 1,
});
const sessions = new Map<string, ChatSession>([
  [a, session(a, "合成会话 A")],
  [b, session(b, "合成会话 B")],
  [c, { ...session(c, "新对话"), runs: [], totalRuns: 0 }],
]);
const createGate = gate(),
  acceptGate = gate(),
  snapshotGate = gate(),
  historyGate = gate();
let heldRead: { id: string; gate: ReturnType<typeof gate> } | undefined;
let slowHistory = false,
  lists = 0,
  currentReads = 0,
  sends = 0,
  loseAcceptance = false;
const requests: unknown[] = [];
const server = createServer(async (req, res) => {
  const url = req.url ?? "/";
  if (url === "/chat.mjs") {
    res.setHeader("content-type", "text/javascript");
    res.end(await readFile("packages/chat-ui/dist/agent-chat.mjs"));
    return;
  }
  if (!url.startsWith("/api/agent-chat")) {
    res.setHeader("content-type", "text/html;charset=utf-8");
    res.end(
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>对话响应验证</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module">import{mountChatPage,createHttpChatTransport}from"/chat.mjs";window.chat=mountChatPage(document.querySelector("#chat"),{transport:createHttpChatTransport({baseURL:"/api/agent-chat"}),sendShortcut:"enter",prefetchHistory:false});</script></html>`,
    );
    return;
  }
  const json = (value: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (url.endsWith("/config"))
    return json({
      protocolVersion: 1,
      defaultAssistant: "demo",
      maxInputLength: 8000,
      assistants: [{ id: "demo", label: "合成助手" }],
    });
  if (req.method === "GET" && url.endsWith("/sessions")) {
    lists++;
    if (slowHistory) await historyGate.promise;
    return json(
      [...sessions.values()]
        .filter((s) => s.runs.length)
        .map((s) => ({
          id: s.id,
          assistantId: s.assistantId,
          title: s.title,
          createdAt: 1,
          active: false,
        })),
    );
  }
  if (req.method === "POST" && url.endsWith("/sessions")) {
    await createGate.promise;
    return json({ id: c }, 201);
  }
  if (req.method === "POST" && url.endsWith("/runs")) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    sends++;
    await acceptGate.promise;
    if (loseAcceptance) {
      loseAcceptance = false;
      return json({ error: { code: "CHAT_REQUEST_FAILED" } }, 500);
    }
    return json({ runId }, 202);
  }
  const id = url.split("/").at(-1)!;
  if (heldRead?.id === id) await heldRead.gate.promise;
  if (id === c) {
    currentReads++;
    await snapshotGate.promise;
  }
  return json(sessions.get(id));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  const root = page.locator("[data-agent-chat]");
  const history = (id: string) => root.locator(`[data-session-id="${id}"]`);
  const self = root.locator(".ae-message-self .ae-message-text:visible");
  await history(a).click();
  await expect(self).toHaveText("合成会话 A");
  heldRead = { id: b, gate: gate() };
  await history(b).click();
  await expect(history(b)).toHaveAttribute("aria-current", "true");
  await expect(root.locator(".ae-heading .ae-status")).toHaveText(
    "正在打开对话…",
  );
  await expect(root.locator(".ae-welcome")).toBeHidden();
  await expect(self).toHaveCount(0);
  heldRead.gate.release();
  heldRead = undefined;
  await expect(self.filter({ hasText: "合成会话 B" })).toBeVisible();
  heldRead = { id: a, gate: gate() };
  const switchMs = await history(a).evaluate((button) => {
    const start = performance.now();
    (button as HTMLButtonElement).click();
    const shadow =
      (window as any).chat.element?.shadowRoot ??
      document.querySelector("[data-agent-chat]")!.shadowRoot!;
    if (
      !shadow.querySelector(".ae-timeline")?.textContent?.includes("合成会话 A")
    )
      throw Error("CACHE_NOT_IMMEDIATE");
    return performance.now() - start;
  });
  await expect(root.locator(".ae-heading .ae-status")).toHaveText("已连接");
  await expect(root.locator(".ae-session-loading")).toHaveCount(0);
  // An old response arriving after a second click must not replace the chosen view.
  await history(b).click();
  heldRead.gate.release();
  heldRead = undefined;
  await expect(self.filter({ hasText: "合成会话 B" })).toBeVisible();
  await expect(history(b)).toHaveAttribute("aria-current", "true");
  await root.locator(".ae-new-session").click();
  const question = "这条合成消息必须马上显示";
  await root.locator("textarea").fill(question);
  const echoMs = await root
    .getByRole("button", { name: "发送", exact: true })
    .evaluate((button, question) => {
      const start = performance.now();
      (button as HTMLButtonElement).click();
      const shadow = document.querySelector("[data-agent-chat]")!.shadowRoot!;
      const submission = shadow.querySelector<HTMLElement>(".ae-submission")!;
      if (submission.hidden || !submission.textContent?.includes(question))
        throw Error("ECHO_NOT_IMMEDIATE");
      return performance.now() - start;
    }, question);
  assert.equal(
    sends,
    0,
    "echo must appear before even the create request finishes",
  );
  await expect(root.locator(".ae-submission-status")).toHaveText("正在发送…");
  await expect(root.locator(".ae-welcome")).toBeHidden();
  createGate.release();
  loseAcceptance = true;
  acceptGate.release();
  await expect(root.locator(".ae-submission-status")).toContainText("尚未确认");
  await expect(root.locator("textarea")).toHaveValue(question);
  slowHistory = true;
  await root.locator(".ae-feedback-actions button").first().click();
  await expect(root.locator(".ae-submission-status")).toContainText("已发送");
  assert.deepEqual(
    requests[0],
    requests[1],
    "retry must use the same frozen request",
  );
  await expect(root.locator("textarea")).toHaveValue("");
  snapshotGate.release();
  await expect.poll(() => currentReads).toBeGreaterThan(1);
  await expect(root.locator(".ae-submission")).toBeVisible();
  const activeRun = {
    ...run(question, ""),
    id: runId,
    state: "running" as const,
  };
  sessions.set(c, {
    ...sessions.get(c)!,
    runs: [activeRun],
    totalRuns: 1,
    snapshotSequence: 2,
  });
  await expect(root.locator(".ae-submission")).toBeHidden();
  await expect(self.filter({ hasText: question })).toHaveCount(1);
  const answer = root.locator(".ae-message-agent > .ae-message-text");
  await answer.evaluate((el) => {
    (window as any).frames = [];
    new MutationObserver(() =>
      (window as any).frames.push({
        at: performance.now(),
        text: el.textContent,
      }),
    ).observe(el, { subtree: true, characterData: true, childList: true });
  });
  const listsBefore = lists;
  // Continuous, long synthetic output while the history response remains held.
  for (let i = 1; i <= 10; i++) {
    activeRun.draft += `第 ${i} 段合成输出，中文和 👨‍👩‍👧‍👦 都应完整显示。`.repeat(3);
    sessions.get(c)!.snapshotSequence++;
    await new Promise((resolve) => setTimeout(resolve, 280));
  }
  await expect(answer).toContainText("第 10 段");
  assert.equal(lists, listsBefore, "slow history requests must be coalesced");
  const samples = await page.evaluate(
    () => (window as any).frames as { at: number; text: string }[],
  );
  assert.ok(
    new Set(samples.map((s) => s.text)).size > 30,
    "chunks must reveal over many frames",
  );
  const gaps = samples.slice(1).map((s, i) => s.at - samples[i]!.at);
  assert.ok(
    Math.max(...gaps) < 650,
    "local stream rendering must not pause for the held history request",
  );
  assert.ok(
    samples.every(
      (s) =>
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          s.text,
        ),
    ),
  );
  const doneAt = Date.now();
  sessions.get(c)!.runs = [
    { ...activeRun, state: "completed", output: activeRun.draft, draft: "" },
  ];
  sessions.get(c)!.snapshotSequence++;
  await expect(answer).toHaveAttribute("data-streaming", "false");
  await expect(answer).toHaveAttribute("data-revealing", "false");
  const settledMs = Date.now() - doneAt;
  historyGate.release();
  const directory = "examples/docs-site/.impeccable/review";
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/responsiveness-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(root.locator("textarea")).toBeVisible();
  await page.screenshot({ path: `${directory}/responsiveness-mobile.png` });
  await page.evaluate(() => (window as any).chat.destroy());
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      synthetic: true,
      echoMs,
      switchMs,
      frames: samples.length,
      maxFrameGapMs: Math.round(Math.max(...gaps)),
      settledMs,
      browserErrors: errors.length,
    }),
  );
} finally {
  createGate.release();
  acceptGate.release();
  snapshotGate.release();
  historyGate.release();
  heldRead?.gate.release();
  await browser.close();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
