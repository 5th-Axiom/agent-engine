import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { ChatRun } from "@agent-runtime/chat-core";
import { contrast } from "../packages/chat-ui/src/tokens/index.js";

const bundle = await readFile("packages/chat-ui/dist/agent-chat.mjs");
const server = createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url === "/chat.mjs" ? "text/javascript" : "text/html;charset=utf-8",
  );
  res.end(
    req.url === "/chat.mjs"
      ? bundle
      : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>消息复制验证</title><style>body{margin:0}#host{height:100dvh}</style><div id="host"></div><script type="module">
import{createMessageTimeline,installChatStyles,applyChatTheme}from"/chat.mjs";
const host=document.querySelector('#host'),root=host.attachShadow({mode:'open'});installChatStyles(root);window.theme=applyChatTheme(host,{});
const page=document.createElement('main');page.className='ae-page';page.style.cssText='display:block;overflow:auto;padding:24px';root.append(page);
window.timeline=createMessageTimeline();page.append(window.timeline.element);
window.show=run=>window.timeline.update([run]);
</script></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const original = "请检查这个用户的操作记录。\n保留换行、中文和 emoji 👋。";
const answer =
  "## 检查结果\n\n合成用户的操作记录已整理。\n\n```sql\nSELECT '示例';\n```\n\n<b>这段原文不会执行 HTML。</b>";
const base: ChatRun = {
  id: "copy-synthetic",
  sequence: 1,
  cancelRequested: false,
  input: original,
  state: "running",
  output: "",
  draft: "",
  steps: 1,
  attempts: 1,
  operations: [],
  usage: { complete: false, costComplete: false },
};
const artifacts = "examples/docs-site/.impeccable/review";
try {
  await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript("window.__name = value => value");
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    );
    await page.waitForFunction(() => !!(window as any).show);
    const show = (run: ChatRun) =>
      page.evaluate(
        (value) => (window as any).show(JSON.parse(value)),
        JSON.stringify(run),
      );
    const root = page.locator("#host");
    const user = root.locator(".ae-message-self");
    const selfText = user.locator(".ae-message-text");
    const selfCopy = user.getByRole("button", { name: "复制", exact: true });
    await show(base);
    await expect(selfCopy).toBeVisible();
    await expect(
      root.locator(".ae-message-agent .ae-message-actions"),
    ).toBeHidden();
    await selfCopy.click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      original,
    );
    await expect(user.getByRole("status")).toHaveText("已复制");

    // Drag real text in the Shadow DOM; poll updates must retain the native selection.
    const coordinates = await selfText.evaluate((el) => {
      const text = el.firstChild!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 10);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y + rect.height / 2, end: rect.right };
    });
    await page.mouse.move(coordinates.x + 1, coordinates.y);
    await page.mouse.down();
    await page.mouse.move(coordinates.end - 1, coordinates.y, { steps: 12 });
    await page.mouse.up();
    const selected = await page.evaluate(() => getSelection()!.toString());
    assert.ok(selected.length >= 8, "native drag selects the actual message");
    for (let i = 0; i < 4; i++)
      await show({ ...base, steps: i + 2, draft: "正在检查。" });
    assert.equal(
      await page.evaluate(() => getSelection()!.toString()),
      selected,
    );
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+C" : "Control+C",
    );
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      selected,
    );
    for (const mode of ["light", "dark"]) {
      await page.evaluate(
        (value) => (window as any).theme.update({ mode: value }),
        mode,
      );
      const colors = await selfText.evaluate((el) => {
        const hex = (rgb: string) =>
          "#" +
          rgb
            .match(/\d+/g)!
            .slice(0, 3)
            .map((n) => Number(n).toString(16).padStart(2, "0"))
            .join("");
        const selection = getComputedStyle(el, "::selection");
        return {
          background: hex(selection.backgroundColor),
          text: hex(selection.color),
          bubble: hex(getComputedStyle(el).backgroundColor),
        };
      });
      assert.ok(contrast(colors.text, colors.background) >= 4.5);
      assert.ok(
        contrast(colors.bubble, colors.background) >= 3,
        "selection must be distinct from user bubble",
      );
      await page.screenshot({
        path: `${artifacts}/copy-selected-${mode}-${width}.png`,
      });
    }
    await page.evaluate(() => {
      getSelection()!.removeAllRanges();
      (window as any).theme.update({ mode: "light" });
    });
    const processRun: ChatRun = {
      ...base,
      draft: answer,
      reply: { id: "answer", sequence: 3 },
      process: {
        complete: true,
        observedAt: 1200,
        activeMs: 1200,
        entries: [
          {
            id: "intro",
            sequence: 1,
            kind: "message",
            state: "completed",
            label: "正文",
            output: "我先查询操作记录。",
            startedAt: 0,
            endedAt: 100,
          },
          {
            id: "tool",
            sequence: 2,
            kind: "tool",
            state: "completed",
            label: "读取数据",
            output: "工具详情不应进入正文复制。",
            startedAt: 100,
            endedAt: 500,
          },
        ],
      },
    };
    await show(processRun);
    const reply = root.locator('[data-entry-id="answer"]');
    const replyCopy = reply.locator(".ae-message-actions button");
    await expect(reply.locator(".ae-message-text")).toContainText(
      "不会执行 HTML",
    );
    await replyCopy.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      answer,
    );
    await expect(replyCopy).toBeFocused();
    await expect(reply.locator("b")).toHaveCount(0);
    await reply
      .locator("p")
      .first()
      .evaluate((el) => {
        const selection = getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
        (window as any).selectedBody = el;
      });
    const selectedReply = await page.evaluate(() => getSelection()!.toString());
    const completed = {
      ...processRun,
      state: "completed" as const,
      draft: "",
      output: answer + "\n\n检查完成。",
    };
    await show(completed);
    await expect(reply).toContainText("检查完成。");
    assert.equal(
      await page.evaluate(() => getSelection()!.toString()),
      selectedReply,
    );
    assert.ok(
      await reply
        .locator("p")
        .first()
        .evaluate((el) => el === (window as any).selectedBody),
    );
    await replyCopy.click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      completed.output,
    );
    await reply.getByRole("button", { name: "复制代码", exact: true }).click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "SELECT '示例';",
    );

    // Permission denial or an unavailable Clipboard API gives an actionable, visible failure.
    await page.evaluate(() => {
      (window as any).write = navigator.clipboard.writeText.bind(
        navigator.clipboard,
      );
      navigator.clipboard.writeText = async () => {
        throw new DOMException("denied", "NotAllowedError");
      };
    });
    await replyCopy.click();
    await expect(replyCopy).toHaveText("复制失败，请选中文字复制");
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "SELECT '示例';",
    );
    assert.ok(
      await replyCopy.evaluate((el) => el.getBoundingClientRect().height >= 44),
    );
    assert.equal(
      await root
        .locator(".ae-page")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await page.screenshot({
      path: `${artifacts}/copy-error-${width}.png`,
      fullPage: true,
    });
    await page.evaluate(() => {
      navigator.clipboard.writeText = (window as any).write;
    });
    await replyCopy.click();
    await expect(replyCopy).toHaveText("已复制");
    // A history refresh and the non-process consumer also expose the same copy behavior.
    await page.reload();
    await page.waitForFunction(() => !!(window as any).show);
    await show({ ...base, state: "completed", output: answer });
    await root
      .locator(".ae-message-agent > .ae-message-actions button")
      .click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      answer,
    );
    await page.screenshot({
      path: `${artifacts}/copy-completed-${width}.png`,
      fullPage: true,
    });
    await page.evaluate(() => (window as any).timeline.destroy());
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Message copy passed at 1440/390: native drag and keyboard copy, polling/stream completion preserve selection, contrasting light/dark highlights, public Markdown per-message copy, current stream text, code copy, keyboard, permission failure/retry, history, 44px controls and teardown; no overflow or page errors.",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
