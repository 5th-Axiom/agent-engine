import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import {
  createAgentEngine,
  AgentEngineError,
  type ModelAdapter,
  type ModelStreamEvent,
} from "@agent-runtime/sdk";
import { MemoryStore } from "@agent-runtime/testing";
import {
  startPlayground,
  inventoryBinding,
} from "../examples/playground/server.js";

let modelCalls = 0;
const usage: ModelStreamEvent = {
  type: "usage",
  mode: "snapshot",
  final: true,
  usage: { input: 32, output: 16, total: 48 },
};
const model: ModelAdapter = {
  version: "browser-fixture-1",
  capabilities: { tools: true, thinking: false, structuredOutput: false },
  async *stream(req, ctx) {
    modelCalls++;
    const input =
      req.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    if (input.includes("失败"))
      throw new AgentEngineError(
        "MODEL_PROVIDER_ERROR",
        "private-provider-body",
      );
    if (input.includes("取消")) {
      yield {
        type: "delta",
        blockId: "text",
        kind: "text",
        text: "等待取消的草稿",
      };
      await new Promise<void>((r) => {
        if (ctx.signal.aborted) r();
        else ctx.signal.addEventListener("abort", () => r(), { once: true });
      });
      ctx.signal.throwIfAborted();
      return;
    }
    if (req.tools.length && req.messages.at(-1)?.role !== "tool") {
      yield usage;
      yield {
        type: "completed",
        response: {
          blocks: [
            {
              type: "tool_call",
              id: "inventory",
              name: "demo.inventory",
              arguments: { sku: "DEMO-1" },
            },
          ],
          stopReason: "tool_calls",
        },
      };
      return;
    }
    if (input.includes("滚动")) {
      const lines = Array.from(
        { length: 45 },
        (_, i) => `合成历史第 ${i + 1} 行，供滚动验证。`,
      ).join("\n");
      yield { type: "delta", blockId: "text", kind: "text", text: lines };
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 180));
        yield {
          type: "delta",
          blockId: "text",
          kind: "text",
          text: "\n正在追加合成内容。",
        };
      }
      yield usage;
      yield {
        type: "completed",
        response: {
          blocks: [{ type: "text", text: lines + "\n合成追加结束。" }],
          stopReason: "final",
        },
      };
      return;
    }
    yield {
      type: "delta",
      blockId: "text",
      kind: "text",
      text: "正在整理合成回答…",
    };
    await new Promise((r) => setTimeout(r, 250));
    yield usage;
    yield {
      type: "completed",
      response: {
        blocks: [
          {
            type: "text",
            text: req.tools.length
              ? "DEMO-1 的合成库存是 24 件。"
              : `合成回答：${input}`,
          },
        ],
        stopReason: "final",
      },
    };
  },
};
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "synthetic-browser", subjectId: "tester" },
  secrets: { resolve: async () => "private-synthetic-browser-key" },
  adapters: { models: { synthetic: model } },
  bindings: { "playground.inventory": inventoryBinding },
  policy: { allowedOrigins: ["https://model.example.com"] },
});
const host = await startPlayground({
  engine,
  port: 0,
  debugSecretRef: "debug",
  defaultProfile: "demo",
  profiles: [
    {
      profileName: "demo",
      model: {
        provider: "synthetic",
        model: "synthetic-only",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "MODEL" },
        limits: { contextWindowTokens: 32000, maxOutputTokens: 256 },
      },
    },
  ],
});
const browser = await chromium.launch({ headless: true });
let diagnostic: (() => Promise<unknown>) | undefined;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.setDefaultTimeout(10000);
  diagnostic = () =>
    page.evaluate(() => {
      const state = (window as any).chatExample?.widget.controller.snapshot;
      return {
        connection: state?.connection,
        error: state?.error,
        sending: state?.sending,
        cancelling: state?.cancelling,
        awaitingRunId: state?.awaitingRunId,
        runs: state?.session?.runs.map((r: any) => ({
          state: r.state,
          errorCode: r.errorCode,
          cancelRequested: r.cancelRequested,
        })),
        domStates: Array.from(
          document
            .querySelector("[data-presentation=widget]")
            ?.shadowRoot?.querySelectorAll(".ae-turn-state") ?? [],
        ).map((n) => n.textContent),
      };
    });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(host.url + "/embed/");
  const widget = page.locator("[data-presentation=widget]");
  await widget
    .getByText("已连接", { exact: true })
    .waitFor({ state: "attached" });
  await widget
    .getByRole("button", { name: "打开聊天助手", exact: true })
    .click();
  const input = widget.getByRole("textbox", { name: "输入消息…", exact: true });
  const send = async (text: string) => {
    const before = await widget.locator(".ae-turn").count();
    await input.fill(text);
    await widget.getByRole("button", { name: "发送", exact: true }).click();
    await page.waitForFunction(
      (n) =>
        document
          .querySelector("[data-presentation=widget]")!
          .shadowRoot!.querySelectorAll(".ae-turn").length > n,
      before,
    );
  };
  const waitDone = async (state = "已完成") => {
    await widget
      .locator(".ae-turn-state")
      .last()
      .filter({ hasText: state })
      .waitFor();
  };
  await send("浏览器首条消息 <img src=x onerror=alert(1)>");
  await waitDone();
  assert.equal(await widget.locator(".ae-message-text img").count(), 0);
  await send("继续");
  await waitDone();
  assert.equal(await widget.locator(".ae-turn").count(), 2);
  await input.fill("保留的输入");
  await input.evaluate((el) =>
    (el as HTMLTextAreaElement).setSelectionRange(2, 4),
  );
  await page.evaluate(() => {
    (window as any).chatExample.widget.updateTheme({
      mode: "dark",
      skin: "rounded",
      accent: "#27a37c",
    });
  });
  assert.equal(await input.inputValue(), "保留的输入");
  assert.equal(
    await input.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    2,
  );
  assert.equal(
    await widget
      .locator(".ae-page")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(17, 27, 40)",
  );
  // Host resets cannot cross the Shadow DOM boundary.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      "button{font-size:55px!important;color:red!important}textarea{font-size:60px!important}",
    );
    document.adoptedStyleSheets = [sheet];
  });
  assert.equal(
    await input.evaluate((el) => getComputedStyle(el).fontSize),
    "16px",
  );
  await page.evaluate(() => {
    document.adoptedStyleSheets = [];
  });
  const beforeComposition = modelCalls;
  await input.evaluate((el) => {
    el.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
      }),
    );
  });
  assert.equal(modelCalls, beforeComposition);
  await input.evaluate((el) =>
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })),
  );
  const beforeKeyboard = await widget.locator(".ae-turn").count();
  await input.press("Control+Enter");
  await page.waitForFunction(
    (n) =>
      document
        .querySelector("[data-presentation=widget]")!
        .shadowRoot!.querySelectorAll(".ae-turn").length > n,
    beforeKeyboard,
  );
  await waitDone();
  await widget.getByRole("button", { name: "新对话", exact: true }).click();
  await send("滚动验证");
  await widget.getByText(/合成历史第 45 行/).waitFor();
  await widget.locator(".ae-transcript").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(700);
  assert(
    (await widget.locator(".ae-transcript").evaluate((el) => el.scrollTop)) <
      10,
  );
  await widget
    .getByRole("button", { name: "回到最新消息", exact: true })
    .click();
  await waitDone();
  await send("取消验证");
  await widget.getByText("等待取消的草稿", { exact: true }).waitFor();
  await widget.getByRole("button", { name: "停止", exact: true }).click();
  await waitDone("已停止");
  assert.equal(
    await widget.getByText("等待取消的草稿", { exact: true }).count(),
    0,
  );
  await send("失败验证");
  await widget.locator(".ae-error-text").last().waitFor();
  assert(
    !(await widget.locator(".ae-page").innerText()).includes(
      "private-provider-body",
    ),
  );
  await widget.getByRole("button", { name: "收起聊天", exact: true }).click();
  await page
    .getByRole("button", { name: "询问助手", exact: true })
    .first()
    .click();
  await widget.getByRole("button", { name: "发送", exact: true }).click();
  await widget
    .getByText("DEMO-1 的合成库存是 24 件。", { exact: true })
    .waitFor();
  await waitDone();
  await widget.locator(".ae-run-details").last().locator("summary").click();
  await widget.getByText("demo.inventory", { exact: true }).last().waitFor();
  assert(
    (await widget.locator(".ae-run-details").last().innerText()).includes(
      "96 Token",
    ),
  );
  // Independent page instance, resize by container instead of only by window width.
  await widget.getByRole("button", { name: "收起聊天", exact: true }).click();
  await page
    .getByRole("button", { name: "加载嵌入式聊天页", exact: true })
    .click();
  const inline = page.locator("#inline-chat [data-agent-chat]");
  await inline.getByText("已连接", { exact: true }).waitFor();
  assert.equal(await inline.locator(".ae-turn").count(), 0);
  await inline.getByRole("textbox").fill("独立输入");
  await page.evaluate(() => {
    (document.querySelector("#inline-chat") as HTMLElement).style.width =
      "340px";
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector("#inline-chat [data-agent-chat]")
        ?.shadowRoot?.querySelector(".ae-page")
        ?.getAttribute("data-narrow") === "true",
  );
  await page.evaluate(() => {
    (document.querySelector("#inline-chat") as HTMLElement).style.width = "";
  });
  await widget
    .getByRole("button", { name: "打开聊天助手", exact: true })
    .click();
  assert.equal(await input.inputValue(), "");
  // Capture only settled geometry/motion; opening animations are not final visual evidence.
  const settleLayout = async () => {
    await page.evaluate(async () => {
      const roots = [...document.querySelectorAll("[data-agent-chat]")].map(
        (el) => el.shadowRoot!,
      );
      await Promise.all(
        roots
          .flatMap((root) => root.getAnimations())
          .map((animation) => animation.finished.catch(() => {})),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
  };
  await settleLayout();
  const inlineWidths = await inline.locator(".ae-page").evaluate((el) => ({
    page: el.getBoundingClientRect().width,
    main: el.querySelector(".ae-chat-main")!.getBoundingClientRect().width,
    sidebar: el.querySelector(".ae-sidebar")!.getBoundingClientRect().width,
    composer: el.querySelector(".ae-composer")!.getBoundingClientRect().width,
    input: el.querySelector(".ae-input")!.getBoundingClientRect().width,
  }));
  assert(
    Math.abs(inlineWidths.page - inlineWidths.main - inlineWidths.sidebar) <= 2,
  );
  assert(
    Math.abs(Math.min(760, inlineWidths.main) - inlineWidths.composer) <= 2,
  );
  assert(inlineWidths.input > inlineWidths.composer - 50);
  // One batched visual checkpoint; functional-only runs do not consume visual rounds.
  if (!process.argv.includes("--functional-only")) {
    const path = "packages/chat-ui/.impeccable/review";
    await mkdir(path, { recursive: true });
    for (const mode of ["light", "dark"]) {
      await page.locator("#theme").selectOption(mode);
      await page.locator("#skin").selectOption("workbench");
      await settleLayout();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${path}/desktop-${mode}.png`,
        animations: "disabled",
      });
    }
    await widget.getByRole("button", { name: "收起聊天", exact: true }).click();
    await page.locator("#theme").selectOption("light");
    await settleLayout();
    await page.screenshot({
      path: `${path}/desktop-closed.png`,
      animations: "disabled",
    });
    await page.locator("#inline").scrollIntoViewIfNeeded();
    await settleLayout();
    await page.screenshot({
      path: `${path}/inline.png`,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await widget.locator("dialog").isVisible())) {
    await widget
      .getByRole("button", { name: "打开聊天助手", exact: true })
      .click();
  }
  await page.waitForFunction(() =>
    document
      .querySelector("[data-presentation=widget]")
      ?.shadowRoot?.querySelector("dialog")
      ?.matches(":modal"),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await widget
      .locator(".ae-page")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  const rect = await widget.locator("dialog").boundingBox();
  assert(rect && rect.width <= 390 && rect.height <= 844);
  if (!process.argv.includes("--functional-only")) {
    for (const mode of ["light", "dark"]) {
      await page.evaluate(
        (mode) =>
          (window as any).chatExample.widget.updateTheme({
            mode,
            skin: "rounded",
          }),
        mode,
      );
      await settleLayout();
      await page.screenshot({
        path: `packages/chat-ui/.impeccable/review/mobile-${mode}.png`,
        animations: "disabled",
      });
    }
  }
  await input.press("Escape");
  assert.equal(
    await widget
      .getByRole("button", { name: "打开聊天助手", exact: true })
      .evaluate((el) => el === (el.getRootNode() as ShadowRoot).activeElement),
    true,
  );
  // Unmount owns network/DOM cleanup; remount works without global singleton state.
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  assert.equal(await page.locator("[data-agent-chat]").count(), 2);
  await page.evaluate(() => {
    (window as any).chatExample.widget.destroy();
    (window as any).chatExample.inline.destroy();
  });
  assert.equal(await page.locator("[data-agent-chat]").count(), 0);
  // The standalone classic script works without a module loader or framework.
  await page.addScriptTag({ url: host.url + "/sdk/agent-chat.js" });
  const globalReady = await page.evaluate(async () => {
    const api = (window as any).AgentChat;
    const classic = api.mountChatWidget({
      transport: api.createHttpChatTransport({ baseURL: "/api/agent-chat" }),
    });
    await classic.ready;
    classic.open();
    const connected =
      classic.controller.snapshot.connection === "ready" && classic.isOpen;
    classic.destroy();
    return connected;
  });
  assert(globalReady);
  const references = await page.evaluate(async () => {
    const api = (window as any).AgentChat;
    const timeline = api.createMessageTimeline(undefined, {
      getRunSources() {
        return [
          { href: "javascript:alert(1)", label: "unsafe" },
          { href: "data:text/html,<script>alert(1)</script>", label: "unsafe" },
          { href: "https://user:password@example.invalid/", label: "private" },
          { href: "/docs/", label: "<img src=x onerror=alert(1)>" },
        ];
      },
    });
    timeline.update([
      {
        id: "synthetic-source",
        sequence: 1,
        input: "合成引用测试",
        output: "合成回答",
        draft: "",
        state: "completed",
        cancelRequested: false,
        steps: 1,
        attempts: 1,
        operations: [],
        usage: { complete: false, costComplete: false },
      },
    ]);
    return {
      count: timeline.element.querySelectorAll(".ae-sources a").length,
      href: timeline.element
        .querySelector(".ae-sources a")
        ?.getAttribute("href"),
      label: timeline.element.querySelector(".ae-sources a")?.textContent,
      images: timeline.element.querySelectorAll("img, script").length,
    };
  });
  assert.equal(references.count, 1);
  assert.equal(references.href, host.url + "/docs/");
  assert.equal(references.label, "<img src=x onerror=alert(1)>");
  assert.equal(references.images, 0);

  assert.equal(await page.locator("[data-agent-chat]").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      completed: true,
      model: "deterministic",
      modelCalls,
      browserErrors: errors.length,
      checks: [
        "entry",
        "send",
        "continue",
        "text-safety",
        "reference-url-and-text-safety",
        "theme-state",
        "style-isolation",
        "ime",
        "scroll-preservation",
        "cancel",
        "failure",
        "tool",
        "usage",
        "inline",
        "container-resize",
        "mobile-modal",
        "focus-return",
        "bfcache-preserves-mounts",
        "destroy",
        "classic-script",
      ],
    }),
  );
  await context.close();
} catch (error) {
  if (diagnostic) console.error(JSON.stringify(await diagnostic()));
  throw error;
} finally {
  await browser.close();
  await host.close();
  await engine.close();
}
