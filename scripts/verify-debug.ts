import { closeResources } from "./lib/close-resources.js";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createAgentEngine } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import { startDebugServer } from "@agent-runtime/debug";
const token = randomBytes(24).toString("hex");
const model = scriptedModel([
  toolCall("inventory.read", { sku: "DEMO-1" }),
  finalText("Synthetic example: 24 units available."),
  toolCall("inventory.read", { sku: "DEMO-2" }),
  finalText("Synthetic second run."),
]);
const engine = await createAgentEngine({
  store: new MemoryStore(),
  principal: { tenantId: "synthetic-demo", subjectId: "reviewer" },
  secrets: { resolve: async () => token },
  adapters: { models: { scripted: model } },
  policy: { allowedOrigins: ["https://model.example.com"] },
  bindings: {
    "inventory.v1": {
      version: "1",
      sideEffect: "read",
      execute: async () => ({ available: 24 }),
    },
  },
});
let server: Awaited<ReturnType<typeof startDebugServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const s = await engine.createSession({
    config: {
      models: {
        primary: {
          provider: "scripted",
          model: "deterministic-demo",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "demo" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "primary" },
      tools: [
        {
          name: "inventory.read",
          description: "Read synthetic inventory",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          execution: {
            type: "binding",
            bindingKey: "inventory.v1",
            sideEffect: "read",
          },
        },
      ],
    },
  });
  await s.run({ input: "Show synthetic inventory" });
  const config = await s.getConfig();
  await s.replaceConfig({
    ifVersion: config.version,
    config: {
      ...config.value,
      instructions: { text: "Synthetic configuration version two" },
    },
  });
  await s.run({ input: "Show second synthetic inventory" });
  server = await startDebugServer({
    engine,
    port: 0,
    auth: { type: "token", secretRef: "debug" },
  });
  browser = await chromium.launch();
  await mkdir("packages/debug/.impeccable/review", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      httpCredentials: { username: "debug", password: token },
    });
    const page = await context.newPage();
    await page.goto(`${server.url}/sessions/${s.id}`);
    await page.getByRole("heading", { name: "Runs", exact: true }).waitFor();
    await page.screenshot({
      path: `packages/debug/.impeccable/review/${name}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw Error(`${name}: document overflow`);
    await context.close();
  }
} finally {
  await closeResources(browser, server, engine);
}
console.log("Debug desktop/mobile screenshots verified; no document overflow.");
