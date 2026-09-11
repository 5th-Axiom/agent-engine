import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const bundle = await readFile("packages/chat-ui/dist/agent-chat.mjs", "utf8");
const html = await readFile("examples/playground/index.html", "utf8");
const app = await readFile("examples/playground/app.js", "utf8");
const css = await readFile("examples/playground/app.css", "utf8");
const browser = await chromium.launch();
const checks = [];
try {
  for (const hostname of ["localhost", "review.synthetic.invalid"]) {
    const context = await browser.newContext();
    await context.route("**/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: route.request().url().endsWith(".mjs")
          ? "application/javascript"
          : "text/html",
        body: route.request().url().endsWith(".mjs")
          ? bundle
          : "<!doctype html><html><body></body></html>",
      }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://${hostname}/`);
    const observed = await page.evaluate(async () => {
      const sdk = await import("/agent-chat.mjs");
      const id = "11111111-1111-4111-8111-111111111111";
      const config = {
        protocolVersion: 1,
        assistants: [{ id: "a", label: "A" }],
        defaultAssistant: "a",
        maxInputLength: 8000,
      };
      let sent = 0;
      const transport = {
        getConfig: async () => config,
        listSessions: async () => [],
        createSession: async (input) => {
          if (!/^[a-f0-9-]{36}$/.test(input.requestId))
            throw Error("invalid request ID");
          return { id };
        },
        sendMessage: async (_id, input) => {
          if (!/^[a-f0-9-]{36}$/.test(input.requestId))
            throw Error("invalid request ID");
          sent++;
          return { runId: "22222222-2222-4222-8222-222222222222" };
        },
        readSession: async () => ({
          id,
          assistantId: "a",
          runs: [],
          snapshotSequence: 0,
        }),
      };
      const notifications = [];
      const widget = sdk.mountChatWidget({
        transport,
        onOpenChange: (value) => notifications.push(value),
      });
      await widget.ready;
      widget.open();
      widget.controller.setDraft("hello");
      await widget.controller.send();
      widget.destroy();
      widget.destroy();
      const composer = sdk.createComposer({
        onDraft() {},
        onSend() {},
        onCancel() {},
      });
      document.body.append(composer.element);
      const state = {
        connection: "ready",
        sessions: [],
        draft: "hello",
        sending: false,
        pending: false,
        cancelling: false,
        config,
      };
      composer.update(state);
      composer.focus();
      composer.update({ ...state, sending: true });
      await new Promise(requestAnimationFrame);
      const during = document.activeElement === composer.input;
      composer.update({ ...state, draft: "" });
      await new Promise(requestAnimationFrame);
      const after = document.activeElement === composer.input;
      composer.element.remove();
      let invalidTheme = false;
      const before = document.querySelectorAll("[data-agent-chat]").length;
      try {
        sdk.mountChatWidget({
          transport,
          theme: { mode: "system", tokens: { text: "#172b42" } },
        });
      } catch (error) {
        invalidTheme = error.message === "CHAT_THEME_CONTRAST";
      }
      const roots = document.querySelectorAll("[data-agent-chat]").length;
      const element = document.createElement("div");
      document.body.append(element);
      window.theme = sdk.applyChatTheme(element, { mode: "system" });
      window.themedElement = element;
      const controller = new sdk.ChatController(transport, {
        idlePollMs: 60000,
      });
      const view = sdk.createChatPage(controller);
      document.body.append(view.element);
      await controller.start();
      controller.send = async () => {
        throw new sdk.ChatError("INVALID_INPUT");
      };
      controller.setDraft("test");
      view.element.querySelector("form").requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.setDraft("background emission");
      const persisted = !view.element.querySelector("[role=alert]").hidden;
      const input = view.element.querySelector("textarea");
      input.value = "user correction";
      input.dispatchEvent(new Event("input"));
      const cleared = view.element.querySelector("[role=alert]").hidden;
      view.destroy();
      controller.dispose();
      return {
        sent,
        notifications,
        isOpen: widget.isOpen,
        during,
        after,
        invalidTheme,
        noLeakedRoot: before === roots,
        persisted,
        cleared,
        secure: isSecureContext,
      };
    });
    assert.equal(observed.sent, 1);
    assert.deepEqual(observed.notifications, [true, false]);
    assert.equal(observed.isOpen, false);
    for (const key of [
      "during",
      "after",
      "invalidTheme",
      "noLeakedRoot",
      "persisted",
      "cleared",
    ])
      assert.equal(observed[key], true, key);
    if (hostname !== "localhost") assert.equal(observed.secure, false);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(
      () => window.themedElement.style.colorScheme === "dark",
    );
    assert.deepEqual(errors, []);
    await context.close();
    checks.push(
      `${hostname}: mount/send UUID, focus, destroy, system theme, local errors`,
    );
  }
  for (const scenario of [
    "expired",
    "transient",
    "html-error",
    "stale-session",
  ]) {
    const context = await browser.newContext();
    let releaseStale, startedStale;
    const staleGate = new Promise((resolve) => {
      releaseStale = resolve;
    });
    const staleStarted = new Promise((resolve) => {
      startedStale = resolve;
    });
    await context.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body,
        contentType = "application/json",
        status = 200;
      if (path === "/") {
        body = html;
        contentType = "text/html";
      } else if (path.endsWith(".js")) {
        body = app;
        contentType = "application/javascript";
      } else if (path.endsWith(".css")) {
        body = css;
        contentType = "text/css";
      } else if (path === "/api/config")
        body = JSON.stringify({
          defaultProfile: "test",
          profiles: [{ id: "test", model: "synthetic", maxOutputTokens: 1000 }],
        });
      else if (path === "/api/sessions")
        body = JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Expired synthetic session",
            profile: "test",
          },
          ...(scenario === "stale-session"
            ? [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  title: "Current synthetic session",
                  profile: "test",
                },
              ]
            : []),
        ]);
      else if (
        scenario === "stale-session" &&
        path.endsWith("22222222-2222-4222-8222-222222222222")
      ) {
        body = JSON.stringify({
          profile: "test",
          scenario: "chat",
          model: "synthetic",
          totalRuns: 0,
          runs: [],
          debugURL: "/debug/",
        });
      } else {
        if (scenario === "stale-session") {
          startedStale();
          await staleGate;
        }
        if (scenario === "transient") return route.abort("failed");
        status = ["expired", "stale-session"].includes(scenario) ? 403 : 502;
        body = ["expired", "stale-session"].includes(scenario)
          ? JSON.stringify({ error: { code: "DATA_RETENTION_EXPIRED" } })
          : "<html>Gateway unavailable</html>";
      }
      return route.fulfill({ status, contentType, body });
    });
    const page = await context.newPage();
    await page.goto("http://localhost/");
    await page.locator("#sessions button").first().click();
    if (scenario === "stale-session") {
      await staleStarted;
      await page.locator("#sessions button").nth(1).click();
      await page.locator("#prompt").fill("current question");
      await page.waitForFunction(
        () => !document.querySelector("#send").disabled,
      );
      const returned = page.waitForResponse((response) =>
        response.url().endsWith("11111111-1111-4111-8111-111111111111"),
      );
      releaseStale();
      await returned;
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert.equal(
        new URL(page.url()).searchParams.get("session"),
        "22222222-2222-4222-8222-222222222222",
      );
      assert.equal(await page.locator("#feedback").isHidden(), true);
      assert.equal(await page.locator("#send").isEnabled(), true);
      await context.close();
      checks.push("Playground ignores stale session failure");
      continue;
    }
    await page.locator("#feedback:not([hidden])").waitFor();
    await page.locator("#prompt").fill("another question");
    if (scenario === "expired") {
      assert.equal(new URL(page.url()).searchParams.has("session"), false);
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("agent-playground-session"),
        ),
        null,
      );
      assert.equal(await page.locator("#model").isEnabled(), true);
      assert.equal(await page.locator("#send").isEnabled(), true);
    } else {
      assert.equal(await page.locator("#send").isDisabled(), true);
      assert.equal(await page.locator("#reconnect").isVisible(), true);
      assert(
        (await page.locator("#feedback-text").innerText()).includes(
          "NETWORK_ERROR",
        ),
      );
    }
    await context.close();
    checks.push(`Playground ${scenario} recovery`);
  }
  console.log(
    JSON.stringify({
      passed: true,
      checks,
      model: "synthetic browser transport; no provider calls",
    }),
  );
} finally {
  await browser.close();
}
