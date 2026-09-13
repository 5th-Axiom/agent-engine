import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Only synthetic summaries. Measure the same selection/metadata changes before and after.
const bundle = await readFile("packages/chat-ui/dist/agent-chat.mjs");
const server = createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url === "/chat.mjs" ? "text/javascript" : "text/html;charset=utf-8",
  );
  res.end(
    req.url === "/chat.mjs"
      ? bundle
      : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>列表缓存验证</title><style>body{margin:0}#host{height:100dvh}</style><div id="host"></div><script type="module">
import * as sdk from '/chat.mjs'; window.sdk=sdk;
window.sessions=Array.from({length:30},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),title:'合成会话 '+(i+1),assistantId:'demo',createdAt:1,active:false}));
window.config={protocolVersion:1,defaultAssistant:'demo',maxInputLength:8000,assistants:[{id:'demo',label:'合成助手'}]};
window.mount=(scope='fixture',widget=false)=>{
 window.reads=0; window.hold=new Promise(resolve=>window.release=resolve);window.failure=undefined;
 const transport={getConfig:async()=>config,listSessions:async()=>{window.reads++;await window.hold;if(window.failure)throw new sdk.ChatError('ACCESS_DENIED',window.failure);return structuredClone(window.sessions)},readSession:async id=>({...window.sessions.find(s=>s.id===id),runs:[],totalRuns:0,snapshotSequence:1})};
 window.memory=sdk.createSessionListMemory(sessionStorage,scope);
 const options={transport,historyMemory:window.memory,theme:{skin:'workbench'},copy:{title:'合成助手'}};
 const start=performance.now();window.chat=widget?sdk.mountChatWidget(options):sdk.mountChatPage(document.querySelector('#host'),options);
 return {rows:chat.element.shadowRoot.querySelectorAll('.ae-history-item').length,ms:performance.now()-start};
};
window.measure=()=>{
 const host=document.querySelector('#host'),shadow=host.attachShadow({mode:'open'});sdk.installChatStyles(shadow);sdk.applyChatTheme(host,{});
 const list=sdk.createSessionList(id=>window.selected=id);window.list=list;shadow.append(list.element);list.element.style.cssText='max-height:400px;width:232px';
 list.update(sessions,undefined,false,config.assistants);
 const items=shadow.querySelector('.ae-history-items'),first=items.firstChild,focused=items.children[8];focused.focus();list.element.scrollTop=240;
 const observer=new MutationObserver(()=>{});observer.observe(items,{childList:true});
 const start=performance.now();for(let i=0;i<50;i++)list.update(sessions,sessions[i%30].id,false,config.assistants);
 const records=observer.takeRecords(),result={removed:records.reduce((n,r)=>n+r.removedNodes.length,0),added:records.reduce((n,r)=>n+r.addedNodes.length,0),stable:first===items.firstChild,focusStable:shadow.activeElement===focused,scroll:list.element.scrollTop,ms:performance.now()-start};observer.disconnect();return result;
};
</script></html>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto(origin);
  await page.waitForFunction(() => !!(window as any).measure);
  const metrics = await page.evaluate(() => (window as any).measure());
  console.log(JSON.stringify({ selectionUpdates: 50, rows: 30, ...metrics }));
  if (!process.argv.includes("--measure")) {
    assert.equal(metrics.removed, 0);
    assert.equal(metrics.added, 0);
    assert.equal(metrics.stable, true);
    assert.equal(metrics.focusStable, true);
    assert.equal(metrics.scroll, 240);
    // Reordering and changing one title/status must retain the other focused row.
    await page.evaluate(() => {
      const w = window as any,
        root = document.querySelector("#host")!.shadowRoot!;
      const focused = root.activeElement,
        kept = root.querySelector(
          '[data-session-id="' + w.sessions[8].id + '"]',
        );
      const reordered = [...w.sessions].reverse().slice(0, 29);
      reordered[0] = {
        ...reordered[0],
        title: "更新后的合成标题",
        active: true,
      };
      w.list.update(
        reordered,
        kept!.getAttribute("data-session-id"),
        false,
        w.config.assistants,
      );
      if (root.activeElement !== focused || !kept!.isConnected)
        throw Error("REORDER_LOST_FOCUS");
      (kept as HTMLButtonElement).click();
      if (w.selected !== w.sessions[8].id) throw Error("STALE_CLICK_HANDLER");
    });
    await expect(page.locator("#host .ae-history-item").first()).toContainText(
      "更新后的合成标题",
    );
    await expect(page.locator("#host .ae-history-item").first()).toContainText(
      "正在执行",
    );
    await expect(page.locator("#host .ae-history-item")).toHaveCount(29);

    await mkdir("examples/docs-site/.impeccable/review", { recursive: true });
    const hydration: unknown[] = [];
    for (const width of [1440, 390]) {
      const p = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const errors: string[] = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(origin);
      await p.waitForFunction(() => !!(window as any).mount);
      await p.evaluate(() => (window as any).mount());
      const root = p.locator("[data-agent-chat]");
      const toggle = root
        .locator(".ae-header")
        .getByRole("button", { name: "对话列表", exact: true });
      if (width === 390) await toggle.click();
      await expect(root.locator(".ae-history-status")).toHaveText(
        "正在加载对话列表…",
      );
      await expect(root.locator(".ae-history .ae-status")).toHaveCount(0);
      await p.evaluate(() => (window as any).release());
      await expect(root.locator(".ae-history-item")).toHaveCount(30);
      await expect(root.locator(".ae-history-status")).toBeHidden();
      await root.locator(".ae-history").evaluate((el) => {
        (window as any).row = el.querySelector(".ae-history-item");
        el.scrollTop = 300;
      });
      if (width === 390)
        await root
          .locator(".ae-sidebar-header")
          .getByRole("button", { name: "关闭面板" })
          .click();
      else await toggle.click();
      await toggle.click();
      assert.equal(
        await root
          .locator(".ae-history")
          .evaluate(
            (el) =>
              el.querySelector(".ae-history-item") === (window as any).row &&
              el.scrollTop === 300,
          ),
        true,
      );
      await p.reload();
      await p.waitForFunction(() => !!(window as any).mount);
      const warm = await p.evaluate(() => (window as any).mount());
      assert.equal(
        warm.rows,
        30,
        "reload must hydrate before the first history request finishes",
      );
      hydration.push({ width, ...warm });
      if (width === 390) await toggle.click();
      await expect(root.locator(".ae-history-status")).toBeHidden();
      // The pending background read must not remove a cached row, including at paint boundaries.
      await p.evaluate(async () => {
        const w = window as any,
          shadow = w.chat.element.shadowRoot,
          rows = Array.from(shadow.querySelectorAll(".ae-history-item"));
        for (let i = 0; i < 8; i++) {
          await new Promise(requestAnimationFrame);
          if (rows.some((row: any) => !row.isConnected))
            throw Error("CACHE_FLASH_DURING_READ");
        }
        w.sessions[0].title = "后台更新后的合成会话";
        w.release();
        await w.chat.ready;
        if (rows.some((row: any) => !row.isConnected))
          throw Error("REFRESH_REBUILT_LIST");
      });
      await expect(root.locator(".ae-history-item").first()).toContainText(
        "后台更新后的合成会话",
      );
      await p.screenshot({
        path: `examples/docs-site/.impeccable/review/session-list-${width}.png`,
      });
      // A transient failure retains the cache; a denied identity removes it immediately.
      await p.evaluate(async () => {
        const w = window as any;
        w.failure = 500;
        await w.chat.controller.refresh();
      });
      await expect(root.locator(".ae-history-item")).toHaveCount(30);
      await expect(root.locator(".ae-history-status")).toBeVisible();
      await p.evaluate(async () => {
        const w = window as any;
        w.failure = 403;
        await w.chat.controller.refresh();
      });
      await expect(root.locator(".ae-history-item")).toHaveCount(0);
      assert.equal(await p.evaluate(() => (window as any).memory.read()), null);
      // Cached widget close/open uses the same row nodes and controller.
      await p.reload();
      await p.waitForFunction(() => !!(window as any).mount);
      await p.evaluate(() => {
        const w = window as any;
        w.sdk
          .createSessionListMemory(sessionStorage, "widget")
          .write(w.sessions);
        w.mount("widget", true);
        w.chat.open();
      });
      await root
        .locator(".ae-history-item")
        .first()
        .evaluate((el) => ((window as any).widgetRow = el));
      await p.evaluate(() => {
        const w = window as any;
        w.chat.close();
        w.chat.open();
        if (
          !w.widgetRow.isConnected ||
          !w.chat.element.shadowRoot.contains(w.widgetRow)
        )
          throw Error("WIDGET_REOPEN_REBUILT_LIST");
        w.release();
      });
      assert.deepEqual(errors, []);
      await p.close();
    }
    console.log(
      JSON.stringify({
        passed: true,
        hydration,
        browserErrors: 0,
        checks: [
          "cold-load",
          "reload-cache",
          "background-revalidation",
          "row-reorder-focus",
          "sidebar-scroll-reopen",
          "widget-reopen",
          "transient-failure",
          "authorization-clears-cache",
        ],
      }),
    );
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
