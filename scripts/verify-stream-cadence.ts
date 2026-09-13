import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// A repeatable bursty snapshot source. Measure wall-clock gaps between visible
// changes, not just mutation counts (many mutations can still hide long stalls).
const measure = process.argv.includes("--measure");
const bundle = await readFile("packages/chat-ui/dist/agent-chat.mjs");
const server = createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url === "/chat.mjs" ? "text/javascript" : "text/html;charset=utf-8",
  );
  res.end(
    req.url === "/chat.mjs"
      ? bundle
      : `<!doctype html><html><meta charset="utf-8"><style>body{margin:0;font:16px/1.8 system-ui}#test{height:100dvh;overflow:auto;padding:24px;box-sizing:border-box}article{max-width:720px;margin:auto}</style><div id="test"><article></article></div><script type="module">import{createMessage}from"/chat.mjs";window.createMessage=createMessage;</script></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript("window.__name = value => value");
    await page.goto(url);
    await page.waitForFunction(() => !!(window as any).createMessage);
    const result = await page.evaluate(async () => {
      const pause = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const prefix = Array.from(
        { length: 100 },
        (_, i) =>
          `已经完成的第 ${i} 段，**重点**和[来源](https://example.com)保持原来的节点。\n\n`,
      ).join("");
      const message = (window as any).createMessage({
        sender: "agent",
        name: "合成助手",
        text: prefix,
        streaming: false,
      });
      document.querySelector("article")!.append(message.element);
      const target = message.element.querySelector(
        ".ae-message-text",
      ) as HTMLElement;
      const firstNode = target.firstChild;
      const samples: { at: number; text: string }[] = [];
      let elements = 0,
        paintTime = 0,
        maximumPaint = 0,
        updates = 0;
      const create = document.createElement.bind(document);
      document.createElement = ((...args: Parameters<typeof create>) => {
        elements++;
        return create(...args);
      }) as typeof document.createElement;
      const observer = new MutationObserver(() => {
        const text = target.textContent ?? "";
        if (samples.at(-1)?.text !== text)
          samples.push({ at: performance.now(), text });
      });
      observer.observe(target, {
        characterData: true,
        subtree: true,
        childList: true,
      });
      const originalRaf = requestAnimationFrame;
      window.requestAnimationFrame = (callback) =>
        originalRaf((now) => {
          const before = performance.now();
          callback(now);
          const elapsed = performance.now() - before;
          paintTime += elapsed;
          maximumPaint = Math.max(maximumPaint, elapsed);
          updates++;
        });
      let text = prefix;
      // Small Chinese batches emulate 250ms polling plus a variable round trip.
      for (const gap of [600, 600, 600, 600, 720, 560, 650, 600]) {
        text += "这是一段逐步到达的中文回答。";
        message.update({
          sender: "agent",
          name: "合成助手",
          text,
          streaming: true,
        });
        await pause(gap);
      }
      const completion = performance.now();
      message.update({
        sender: "agent",
        name: "合成助手",
        text: text + "完成。",
        streaming: false,
      });
      while (
        target.dataset.revealing === "true" &&
        performance.now() - completion < 1000
      )
        await pause(10);
      const settledMs = performance.now() - completion;
      const values = samples.filter(
        (s) => s.at >= samples[0]!.at + 1500 && s.at < completion,
      );
      const gaps = values.slice(1).map((s, i) => s.at - values[i]!.at);
      const allGaps = samples.slice(1).map((s, i) => s.at - samples[i]!.at);
      const textCorrect = target.textContent!.endsWith("完成。");
      const stablePrefix = target.firstChild === firstNode;
      observer.disconnect();
      message.destroy();
      document.createElement = create;
      window.requestAnimationFrame = originalRaf;
      return {
        maxOverallGapMs: Math.round(Math.max(...allGaps)),
        maxVisibleGapMs: Math.round(Math.max(...gaps)),
        pausesOver150ms: gaps.filter((g) => g > 150).length,
        updates,
        elements,
        totalPaintMs: Math.round(paintTime),
        maxPaintMs: Math.round(maximumPaint),
        settledMs: Math.round(settledMs),
        textCorrect,
        stablePrefix,
      };
    });
    results.push({ width, ...result });
    await page.evaluate(async () => {
      const message = (window as any).createMessage({
        sender: "agent",
        name: "合成助手",
        text: "",
        streaming: false,
      });
      document.querySelector("article")!.replaceChildren(message.element);
      const target = message.element.querySelector(
        ".ae-message-text",
      ) as HTMLElement;
      const show = (text: string, streaming = false) =>
        message.update({ sender: "agent", name: "合成助手", text, streaming });
      const check = (condition: boolean, name: string) => {
        if (!condition) throw Error(name);
      };
      show("[参考][ref]\n\n正文");
      check(!target.querySelector("a"), "unresolved reference");
      show("[参考][ref]\n\n正文\n\n[ref]: https://example.com/guide");
      check(
        target.querySelector("a")?.href === "https://example.com/guide",
        "late reference invalidates cached paragraph",
      );
      show("[参考][ref]\n\n正文\n\n[ref]: javascript:alert(1)");
      check(
        !target.querySelector("a"),
        "unsafe reference correction removes link",
      );
      show("标题\n---\n\n```ts\nconst answer = 42;\n```");
      check(
        !!target.querySelector("h4") && !!target.querySelector("pre"),
        "heading and code after correction",
      );
      show("只有正文");
      check(
        target.textContent === "只有正文" && !target.querySelector("pre"),
        "rewind removes obsolete blocks",
      );
      const text = "中文👩🏽‍💻é".repeat(12);
      const segments = [
        ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
          text,
        ),
      ];
      const boundaries = new Set(
        segments.map((s) => s.index + s.segment.length),
      );
      let invalidGrapheme = false;
      const observer = new MutationObserver(() => {
        if (target.textContent && !boundaries.has(target.textContent.length))
          invalidGrapheme = true;
      });
      show("");
      observer.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      for (const [index, segment] of segments.entries()) {
        show(text.slice(0, segment.index + segment.segment.length), true);
        await new Promise((resolve) => setTimeout(resolve, 12));
        if (index === 30)
          check(
            target.textContent!.length > 10,
            "frequent arrivals must not starve fractional reveal",
          );
      }
      show(text);
      await new Promise((resolve) => setTimeout(resolve, 160));
      check(
        target.textContent === text && !invalidGrapheme,
        "grapheme integrity and final flush",
      );
      observer.disconnect();
      show("新的尝试", true);
      check(
        target.textContent === "新的尝试",
        "withdraw old draft immediately",
      );
      show("新的尝试，未显示的后续文字", true);
      message.destroy();
      const stopped = target.textContent;
      await new Promise((resolve) => setTimeout(resolve, 180));
      check(target.textContent === stopped, "destroy cancels pending frames");
    });
    await page.close();
  }
  const directory = "examples/docs-site/.impeccable/review";
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/stream-cadence-${measure ? "before" : "after"}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({ measureOnly: measure, synthetic: true, results }),
  );
  if (!measure)
    for (const result of results) {
      assert.ok(
        result.maxVisibleGapMs < 180,
        "steady received batches must not produce repeated long pauses",
      );
      assert.ok(
        result.elements < 4000,
        "settled Markdown must not rebuild on each reveal frame",
      );
      assert.ok(
        result.settledMs < 180 && result.textCorrect && result.stablePrefix,
      );
    }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
