import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { ChatRun, ChatProcessEntry } from "@agent-runtime/chat-core";

const bundle = await readFile("packages/chat-ui/dist/agent-chat.mjs");
const server = createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url === "/chat.mjs" ? "text/javascript" : "text/html;charset=utf-8",
  );
  res.end(
    req.url === "/chat.mjs"
      ? bundle
      : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>回复状态验证</title><style>body{margin:0}#host{display:block;height:100dvh}</style><div id="host"></div><script type="module">
import{createMessageTimeline,installChatStyles,applyChatTheme}from"/chat.mjs";
const host=document.querySelector('#host'),root=host.attachShadow({mode:'open'});installChatStyles(root);applyChatTheme(host,{});
const surface=document.createElement('div');surface.className='ae-root ae-page';surface.style.cssText='height:100%;overflow:auto;padding:24px;box-sizing:border-box';root.append(surface);
window.reset=()=>{window.timeline?.destroy();window.timeline=createMessageTimeline(undefined,{getRunSources:()=>[{label:'合成资料',href:'https://example.com/guide'}]});window.timeline.element.style.cssText='max-width:760px;margin:auto;width:100%';surface.replaceChildren(window.timeline.element)};
window.reset();window.show=run=>window.timeline.update([run]);
</script></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const base: ChatRun = {
  id: "synthetic",
  sequence: 1,
  cancelRequested: false,
  input: "请检查接入配置，说明依据并给出结论。",
  state: "running",
  draft: "",
  output: "",
  steps: 1,
  attempts: 1,
  operations: [],
  usage: { complete: false, costComplete: false },
  process: { entries: [], activeMs: 1200, observedAt: 1200, complete: true },
};
const entry = (
  id: string,
  sequence: number,
  kind: ChatProcessEntry["kind"],
  output?: string,
): ChatProcessEntry => ({
  id,
  sequence,
  kind,
  label:
    kind === "thinking" ? "思考过程" : kind === "message" ? "正文" : "搜索文档",
  state: "completed",
  startedAt: 0,
  endedAt: 800,
  ...(output ? { output } : {}),
});
const main =
  "## 配置检查\n\n模型和工具需要在服务端完成配置。浏览器使用已鉴权的聊天接口，服务端检查工具输入与返回值。\n\n```ts\nconst session = await engine.createSession({ config });\n```\n\n保存会话标识，在下一次访问时继续对话。";
try {
  await mkdir("examples/docs-site/.impeccable/review", { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript("window.__name = value => value");
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    );
    await page.waitForFunction(() => !!(window as any).show);
    const root = page.locator("#host");
    const row = (id: string) => root.locator(`[data-entry-id="${id}"]`);
    const show = async (
      entries: ChatProcessEntry[],
      changes: Partial<ChatRun> = {},
    ) => {
      await page.evaluate(
        (run) => (window as any).show(JSON.parse(run)),
        JSON.stringify({
          ...base,
          ...changes,
          process: { ...base.process!, entries },
        }),
      );
    };
    const thinking = {
      ...entry("thinking", 1, "thinking"),
      state: "running" as const,
    };
    await show([thinking]);
    await expect(root.locator(".ae-thinking-content")).toHaveCount(0);
    await expect(root.locator(".ae-process-current")).toBeVisible();
    thinking.output = "合成分析：先读取配置，再检查工具绑定。";
    await show([thinking]);
    await expect(row("thinking").locator("details")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await expect(root.locator(".ae-thinking-content")).toContainText(
      "检查工具绑定",
    );
    await show([entry("thinking", 1, "thinking", thinking.output)], {
      draft: "我先查看接入文档。",
      reply: { id: "intro", sequence: 2 },
    });
    await expect(row("thinking").locator("details")).toHaveAttribute(
      "data-expanded",
      "false",
    );
    await expect(row("intro")).toContainText("接入文档");
    await row("intro").evaluate((el) => {
      (window as any).intro = el;
    });
    const prefix = [
      entry("thinking", 1, "thinking", thinking.output),
      entry("intro", 2, "message", "我先查看接入文档。"),
    ];
    const tools = [
      entry("tool1", 3, "tool", "已找到接入指南。"),
      entry("tool2", 4, "tool", "已确认配置示例。"),
    ];
    await show([...prefix, ...tools]);
    assert.equal(
      await row("intro").evaluate((el) => el === (window as any).intro),
      true,
    );
    await expect(root.locator('[data-group="group:tool1"]')).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await show([...prefix, ...tools], {
      draft: main,
      reply: { id: "main", sequence: 5 },
    });
    await expect(root.locator('[data-group="group:tool1"]')).toHaveAttribute(
      "data-expanded",
      "false",
    );
    await expect(row("main")).toContainText("下一次访问");
    await row("main").evaluate((el) => {
      (window as any).main = el;
      (window as any).code = el.querySelector("pre");
    });
    const all = [
      ...prefix,
      ...tools,
      entry("main", 5, "message", main),
      entry("middle", 6, "message", "再确认最后一个细节。"),
      entry("tool3", 7, "tool", "确认完成。"),
    ];
    await show(all, {
      draft: "结论：配置检查通过。",
      reply: { id: "final", sequence: 8 },
    });
    await expect(row("final")).toContainText("配置检查通过");
    // The last received text must drain before completion folds and footer appear.
    const completion = await page.evaluate(
      (serialized) => {
        (window as any).show(JSON.parse(serialized));
        const root = document.querySelector("#host")!.shadowRoot!;
        return {
          sourcesHidden: (root.querySelector(".ae-sources") as HTMLElement)
            .hidden,
          settled: (root.querySelector(".ae-process") as HTMLElement).dataset
            .settled,
        };
      },
      JSON.stringify({
        ...base,
        state: "completed",
        output: "结论：配置检查通过。" + "完成后的合成补充。".repeat(12),
        reply: { id: "final", sequence: 8 },
        usage: { total: 800, complete: true, costComplete: false },
        process: { ...base.process!, entries: all },
      }),
    );
    assert.equal(completion.sourcesHidden, true);
    assert.equal(completion.settled, "false");
    await expect(root.locator(".ae-process")).toHaveAttribute(
      "data-settled",
      "true",
    );
    await expect(root.locator(".ae-sources")).toBeVisible();
    await expect(root.locator(".ae-run-details")).toBeVisible();
    await expect(root.locator(".ae-process-current")).toBeHidden();
    // Make the main body the unique longest anchor; the terminal addition above is shorter.
    assert.equal(
      await row("main").evaluate(
        (el) =>
          el === (window as any).main &&
          el.querySelector("pre") === (window as any).code,
      ),
      true,
    );
    await expect(row("main")).toBeVisible();
    await expect(row("final")).toBeVisible();
    await expect(row("intro")).toBeHidden();
    await expect(row("middle")).toBeHidden();
    assert.deepEqual(
      await root
        .locator(".ae-process-content > *")
        .evaluateAll((els) =>
          els.map(
            (el) =>
              (el as HTMLElement).dataset.group ??
              (el as HTMLElement).dataset.entryId,
          ),
        ),
      ["completed", "main", "between:middle", "final"],
    );
    const group = root.locator('[data-group="completed"]');
    await group.locator(":scope > summary").click();
    await expect(row("intro")).toBeVisible();
    const interrupted = await group.evaluate(async (el) => {
      const summary = el.querySelector("summary")!;
      const shell = el.querySelector(".ae-disclosure-shell")!;
      await new Promise((r) => setTimeout(r, 270));
      summary.click();
      await new Promise((r) => setTimeout(r, 70));
      const before = shell.getBoundingClientRect().height;
      summary.click();
      const after = shell.getBoundingClientRect().height;
      return {
        difference: Math.abs(after - before),
        animated: shell.getAnimations().length > 0,
      };
    });
    assert.ok(
      interrupted.difference < 2 && interrupted.animated,
      JSON.stringify(interrupted),
    );
    await expect(group).toHaveAttribute("data-expanded", "true");
    await group.locator(":scope > summary").click();
    await expect(group).not.toHaveAttribute("open", "");
    await page.screenshot({
      path: `examples/docs-site/.impeccable/review/presentation-completed-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    assert.equal(
      await root
        .locator(".ae-page")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    // An explicitly opened tool stays open through completion and retains its node/focus.
    await page.evaluate(() => (window as any).reset());
    const pinned = {
      ...entry("pinned", 1, "tool", "供用户查看的安全结果"),
      state: "running" as const,
    };
    await show([pinned]);
    await row("pinned").locator("summary").click();
    await row("pinned").locator("summary").focus();
    await show([{ ...pinned, state: "completed" }], {
      state: "completed",
      output: "已完成。",
      reply: { id: "reply", sequence: 2 },
    });
    await expect(row("pinned").locator("summary")).toBeFocused();
    await expect(root.locator('[data-group="completed"]')).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await root.locator('[data-group="completed"] > summary').click();
    assert.equal(
      await root
        .locator('[data-group="completed"] > .ae-disclosure-shell')
        .evaluate((el) => el.getAnimations().length),
      0,
    );
    // History has no replay animation and no pending buffer.
    await page.evaluate(() => (window as any).reset());
    await show(all, {
      state: "completed",
      output: "完成。",
      reply: { id: "final", sequence: 8 },
    });
    assert.equal(await root.locator('[data-revealing="true"]').count(), 0);
    await page.evaluate(() => (window as any).timeline.destroy());
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Reply presentation passed at 1440/390: empty/active/successor thinking, draft identity, chronological local folds, completion anchors and drain-gated footer, interruptible motion, manual focus, reduced motion, historical render, no overflow/errors.",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
