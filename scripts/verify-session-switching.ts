import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const bundle = await readFile("packages/chat-ui/dist/agent-chat.mjs");
const server = createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url === "/chat.mjs" ? "text/javascript" : "text/html;charset=utf-8",
  );
  res.end(
    req.url === "/chat.mjs"
      ? bundle
      : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正文切换验证</title><style>body{margin:0}#host{height:100dvh}</style><div id="host"></div><script type="module">
import * as sdk from '/chat.mjs';
window.ids=Array.from({length:8},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const summary=id=>({id,assistantId:'demo',title:'合成会话 '+ids.indexOf(id),createdAt:1,active:false});
const session=id=>({...summary(id),totalRuns:1,snapshotSequence:1,runs:[{id,sequence:1,input:'合成问题 '+ids.indexOf(id),output:'这段正文属于合成会话 '+ids.indexOf(id),draft:'',state:'completed',cancelRequested:false,steps:1,attempts:1,operations:[],usage:{complete:false,costComplete:false}}]});
window.calls=[];window.holds=new Map();window.hold=id=>{let release;const promise=new Promise(r=>release=r);holds.set(id,{promise,release});};window.release=id=>{holds.get(id)?.release();holds.delete(id)};
const transport={getConfig:async()=>({protocolVersion:1,defaultAssistant:'demo',maxInputLength:8000,assistants:[{id:'demo',label:'合成助手'}]}),listSessions:async()=>ids.map(summary),readSession:async(id,signal)=>{calls.push(id);const held=holds.get(id);if(held)await held.promise;return session(id)}};
window.mount=(prefetchHistory=false)=>{window.chat?.destroy();window.chat=sdk.mountChatPage(document.querySelector('#host'),{transport,prefetchHistory,theme:{skin:'workbench'},copy:{title:'合成助手'}});return chat.ready};
window.select=n=>{window.selecting=chat.controller.selectSession(ids[n]);};
window.mount();
</script></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ headless: true });
try {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(origin);
  await p.waitForFunction(() => !!(window as any).chat);
  await p.evaluate(async () => {
    const w = window as any;
    await w.chat.ready;
    await w.chat.controller.selectSession(w.ids[0]);
    await w.chat.controller.selectSession(w.ids[1]);
  });
  const metrics = await p.evaluate(() => {
    const w = window as any;
    w.hold(w.ids[0]);
    const start = performance.now();
    w.select(0);
    const shadow = w.chat.element.shadowRoot,
      loading = shadow.querySelector(".ae-session-loading");
    return {
      cachedText: shadow
        .querySelector(".ae-timeline")
        .textContent.includes("这段正文属于合成会话 0"),
      inlineLoadingVisible: !!loading && !loading.hidden,
      switchMs: performance.now() - start,
    };
  });
  console.log(JSON.stringify(metrics));
  if (!process.argv.includes("--measure")) {
    assert.equal(metrics.cachedText, true);
    assert.equal(metrics.inlineLoadingVisible, false);
  }
  await p.evaluate(async () => {
    const w = window as any;
    w.release(w.ids[0]);
    await w.selecting;
  });
  if (!process.argv.includes("--measure")) {
    await mkdir("examples/docs-site/.impeccable/review", { recursive: true });
    const results: unknown[] = [];
    for (const width of [1440, 390]) {
      const page =
        width === 1440
          ? p
          : await browser.newPage({ viewport: { width, height: 900 } });
      if (page !== p) {
        await page.goto(origin);
        await page.waitForFunction(() => !!(window as any).chat);
      }
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.evaluate(async () => {
        const w = window as any;
        w.calls = [];
        await w.mount(true);
      });
      await page.waitForFunction(() => {
        const w = window as any;
        return w.ids.slice(0, 4).every((id: string) => w.calls.includes(id));
      });
      const root = page.locator("[data-agent-chat]");
      const status = root.locator(".ae-heading .ae-status");
      const warm = await page.evaluate(async () => {
        const w = window as any;
        w.hold(w.ids[1]);
        const started = performance.now();
        w.select(1);
        const shadow = w.chat.element.shadowRoot,
          body = shadow.querySelector(".ae-timeline"),
          top = body.getBoundingClientRect().top;
        if (!body.textContent.includes("这段正文属于合成会话 1"))
          throw Error("PREFETCH_NOT_IMMEDIATE");
        const ms = performance.now() - started;
        for (let i = 0; i < 20; i++) {
          await new Promise(requestAnimationFrame);
          if (
            shadow.querySelector(".ae-heading .ae-status").textContent !==
            "已连接"
          )
            throw Error("WARM_LOADING_FLASH");
          if (body.getBoundingClientRect().top !== top)
            throw Error("REVALIDATION_SHIFTED_BODY");
        }
        w.release(w.ids[1]);
        await w.selecting;
        return { ms, framesWithoutLoading: 20 };
      });
      await expect(root.locator(".ae-timeline")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      // A sub-200ms first read must never paint the delayed header indicator.
      await page.evaluate(async () => {
        const w = window as any;
        w.hold(w.ids[6]);
        w.select(6);
        const status = w.chat.element.shadowRoot.querySelector(
          ".ae-heading .ae-status",
        );
        let flashed = false;
        const observer = new MutationObserver(() => {
          if (status.textContent.includes("正在打开")) flashed = true;
        });
        observer.observe(status, { childList: true });
        await new Promise((resolve) => setTimeout(resolve, 80));
        w.release(w.ids[6]);
        await w.selecting;
        observer.disconnect();
        if (flashed) throw Error("FAST_READ_FLASH");
      });
      await page.evaluate(() => {
        const w = window as any;
        w.hold(w.ids[7]);
        w.select(7);
      });
      await expect(status).toHaveText("正在打开对话…");
      await expect(root.locator(".ae-session-loading")).toHaveCount(0);
      await expect(root.locator(".ae-timeline")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(root.locator(".ae-timeline")).not.toContainText(
        "这段正文属于合成会话 6",
      );
      await page.screenshot({
        path: `examples/docs-site/.impeccable/review/session-switch-slow-${width}.png`,
      });
      await page.evaluate(async () => {
        const w = window as any;
        w.release(w.ids[7]);
        await w.selecting;
      });
      await expect(status).toHaveText("已连接");
      await page.screenshot({
        path: `examples/docs-site/.impeccable/review/session-switch-ready-${width}.png`,
      });
      // Pointer/keyboard intent warms rows outside the automatic recent set.
      if (width === 390)
        await root
          .locator(".ae-header")
          .getByRole("button", { name: "对话列表", exact: true })
          .click();
      const target = root.locator(
        '[data-session-id="00000000-0000-4000-8000-000000000006"]',
      );
      await target.hover();
      await page.waitForFunction(() => {
        const w = window as any;
        return w.calls.includes(w.ids[5]);
      });
      const intent = await target.evaluate((el) => {
        const w = window as any;
        w.hold(w.ids[5]);
        (el as HTMLButtonElement).click();
        return w.chat.element.shadowRoot
          .querySelector(".ae-timeline")
          .textContent.includes("这段正文属于合成会话 5");
      });
      assert.equal(intent, true);
      await page.evaluate(async () => {
        const w = window as any;
        w.release(w.ids[5]);
      });
      await page.waitForFunction(
        () => !(window as any).chat.controller.snapshot.loadingSession,
      );
      if (width === 390)
        await root
          .locator(".ae-header")
          .getByRole("button", { name: "对话列表", exact: true })
          .click();
      const keyboardTarget = root.locator(
        '[data-session-id="00000000-0000-4000-8000-000000000005"]',
      );
      await keyboardTarget.focus();
      await page.waitForFunction(() => {
        const w = window as any;
        return w.calls.includes(w.ids[4]);
      });
      assert.equal(
        await page.evaluate(() => {
          const w = window as any;
          w.hold(w.ids[4]);
          w.select(4);
          return w.chat.element.shadowRoot
            .querySelector(".ae-timeline")
            .textContent.includes("这段正文属于合成会话 4");
        }),
        true,
      );
      await page.evaluate(async () => {
        const w = window as any;
        w.release(w.ids[4]);
        await w.selecting;
      });
      assert.deepEqual(errors, []);
      results.push({
        width,
        ...warm,
        intentPrefetch: true,
        browserErrors: errors.length,
      });
      if (page !== p) await page.close();
    }
    console.log(
      JSON.stringify({
        passed: true,
        results,
        checks: [
          "cached-body-no-loading",
          "recent-prefetch",
          "stable-layout-during-revalidation",
          "fast-cold-read-no-flash",
          "slow-read-header-only",
          "pointer-intent",
          "keyboard-intent",
          "no-stale-body",
        ],
      }),
    );
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
