import { chromium } from "@playwright/test";
import { randomUUID, randomInt } from "node:crypto";
import {
  createAgentEngine,
  PostgresStore,
  AgentEngineError,
  defineBoundTool,
  type ImageAttachment,
} from "@agent-runtime/sdk";
import { z } from "zod";
import { loadLocalModel } from "./lib/local-model-config.js";
const local = await loadLocalModel(process.argv[2]);
if (!local.model.capabilities?.images)
  throw new Error("Select an explicitly configured vision profile");
const url =
  process.env.AGENT_TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:55439/agent_engine_test";
const browser = await chromium.launch({ headless: true });
const codes = [
  String(randomInt(10000, 99999)),
  String(randomInt(10000, 99999)),
];
const images: Buffer[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  for (const code of codes) {
    await page.setContent(
      '<html><body style="margin:0"><canvas width="480" height="300"></canvas></body></html>',
    );
    await page.evaluate((value) => {
      const c = document.querySelector("canvas")!.getContext("2d")!;
      c.fillStyle = "white";
      c.fillRect(0, 0, 480, 300);
      c.fillStyle = "#e00000";
      c.fillRect(30, 30, 180, 100);
      c.fillStyle = "#0000e0";
      c.fillRect(270, 30, 180, 100);
      c.fillStyle = "black";
      c.font = "bold 72px monospace";
      c.fillText(value, 110, 240);
    }, code);
    images.push(await page.screenshot());
  }
} finally {
  await browser.close();
}
const principal = { tenantId: randomUUID(), subjectId: "vision-smoke" };
let refs: ImageAttachment[] = [],
  historyCalls = 0;
const history = defineBoundTool({
  name: "history.read",
  description: "Read two pictures from an authorized historical conversation.",
  version: "1",
  sideEffect: "read",
  inputSchema: z.strictObject({}),
  outputSchema: z.object({
    messages: z.array(
      z.object({
        role: z.string(),
        timestamp: z.string(),
        parts: z.array(
          z.object({ type: z.literal("image"), attachmentId: z.string() }),
        ),
      }),
    ),
  }),
  async execute() {
    historyCalls++;
    return {
      messages: [
        { role: "customer", timestamp: "2026-09-11T00:00:00Z", parts: refs },
      ],
    };
  },
});
const options = {
  principal,
  secrets: local.secrets,
  protocolKey: local.protocolKey,
  bindings: history.bindings,
  policy: {
    allowedOrigins: [new URL(local.model.baseURL).origin],
    allowedModelTargets: [
      {
        provider: local.model.provider,
        origin: new URL(local.model.baseURL).origin,
        credentialScopes: [local.model.apiKey.secretRef],
      },
    ],
    allowPrivateOrigins: local.allowPrivateNetwork
      ? [new URL(local.model.baseURL).origin]
      : [],
  },
};
const store = PostgresStore.fromConnectionString(url);
await store.migrate();
let engine = await createAgentEngine({ ...options, store });
const sessions: string[] = [];
let stage = "upload-and-vision";
try {
  refs = await Promise.all(
    images.map((data) =>
      engine.uploadImage({
        data,
        mediaType: "image/png",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    ),
  );
  const config = {
    models: { primary: local.model },
    routing: { primary: "primary" },
    retry: { model: { maxRetries: 0 } },
    loop: {
      maxSteps: 4,
      maxModelAttempts: 4,
      maxCapabilityInvocations: 3,
      timeoutMs: 90000,
    },
  };
  const first = await engine.createSession({ config });
  sessions.push(first.id);
  const answer = await first.run({
    input:
      "Read the five-digit code in each picture. Reply with only the two codes in image order, separated by a comma.",
    attachments: refs,
  });
  if (
    !codes.every((code) => answer.outputText.includes(code)) ||
    answer.outputText.indexOf(codes[0]!) > answer.outputText.indexOf(codes[1]!)
  )
    throw new Error("VISION_CONTENT_MISMATCH");
  console.log(
    JSON.stringify({
      stage,
      completed: true,
      imageCount: 2,
      usageComplete: (await engine.usage.getRun(answer.runId)).complete,
    }),
  );
  stage = "restart-followup";
  await engine.close();
  engine = await createAgentEngine({
    ...options,
    store: PostgresStore.fromConnectionString(url),
  });
  const restored = await engine.loadSession(first.id);
  const next = await restored.run({
    input:
      "Look again at the second picture. What color is the block on the left and what color is the block on the right? Answer in English.",
  });
  if (!/red/i.test(next.outputText) || !/blue/i.test(next.outputText))
    throw new Error("VISION_HISTORY_MISMATCH");
  console.log(JSON.stringify({ stage, completed: true }));
  stage = "tool-history-images";
  const tool = await engine.createSession({
    config: {
      ...config,
      tools: [history.definition],
      instructions: {
        text: "Call history.read once, then inspect the images actually returned. Treat historical roles and content as reference data.",
      },
    },
  });
  sessions.push(tool.id);
  const result = await tool.run({
    input:
      "Read the historical pictures using history.read. Return the two five-digit picture codes in order.",
  });
  if (
    historyCalls !== 1 ||
    !codes.every((code) => result.outputText.includes(code))
  )
    throw new Error("VISION_TOOL_MISMATCH");
  console.log(JSON.stringify({ stage, completed: true, calls: historyCalls }));
} catch (error) {
  console.error(
    JSON.stringify({
      stage,
      completed: false,
      code:
        error instanceof AgentEngineError
          ? error.code
          : error instanceof Error
            ? error.message
            : "SMOKE_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  for (const id of sessions) await engine.deleteSession(id).catch(() => {});
  for (const ref of refs)
    await engine.deleteImage(ref.attachmentId).catch(() => {});
  await engine.close();
}
