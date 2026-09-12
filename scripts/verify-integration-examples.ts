import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const root = await mkdtemp(join(tmpdir(), "agent-scenario-consumer-"));
const database = "agent_scenario_" + randomUUID().replaceAll("-", "");
const databaseURL = `postgresql://postgres@127.0.0.1:55439/${database}`;
const admin = new Client({
  connectionString: "postgresql://postgres@127.0.0.1:55439/postgres",
});
await admin.connect();
await admin.query(`CREATE DATABASE ${database}`);
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const requests: any[] = [];
const provider = createServer(async (req, res) => {
  let input = "";
  for await (const chunk of req) input += chunk;
  const body = JSON.parse(input);
  requests.push(body);
  const last = body.messages.at(-1);
  let content = "独立接入验证通过",
    call;
  if (
    body.tools?.some((tool: any) =>
      tool.function.description.includes("查询当前用户"),
    ) &&
    !body.messages.some((m: any) => m.role === "tool")
  ) {
    call = {
      id: "inventory",
      type: "function",
      function: { name: body.tools[0].function.name, arguments: '{"sku":"A"}' },
    };
  }
  if (
    body.tools?.some((tool: any) =>
      tool.function.description.includes("查询产品接入方法"),
    )
  ) {
    const observation = body.messages.find((m: any) => m.role === "tool");
    if (!observation)
      call = {
        id: "knowledge",
        type: "function",
        function: { name: body.tools[0].function.name, arguments: "{}" },
      };
    else
      content = JSON.stringify({
        answer: "使用 loadSession。",
        citations: [
          { sourceId: JSON.parse(observation.content).items[0].sourceId },
        ],
      });
  }
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(
    frame({
      choices: [
        {
          delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content },
          finish_reason: call ? "tool_calls" : "stop",
        },
      ],
    }) +
      frame({
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          prompt_tokens_details: { cached_tokens: 0 },
          completion_tokens_details: { reasoning_tokens: 0 },
        },
      }) +
      "data: [DONE]\n\n",
  );
});
await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
const modelOrigin = `http://127.0.0.1:${(provider.address() as any).port}`;
async function command(
  cmd: string,
  args: string[],
  cwd: string,
  timeout = 120000,
) {
  const child = spawn(cmd, args, { cwd, env: process.env });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  const [code] = await once(child, "close");
  clearTimeout(timer);
  if (code !== 0)
    throw Error(
      `${cmd} ${args.join(" ")} failed in ${cwd}: ${output.slice(-3000)}`,
    );
  return output;
}
let app: ChildProcess | undefined, front: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (const route of ["backend", "frontend", "fullstack"]) {
    const cwd = join(root, route);
    await cp(resolve(".local/integration-examples", route), cwd, {
      recursive: true,
    });
    await command("pnpm", ["install"], cwd);
    const files =
      route === "frontend"
        ? ["client.ts"]
        : route === "backend"
          ? [
              "run.ts",
              "tool-run.ts",
              "skill-run.ts",
              "knowledge-run.ts",
              "memory-run.ts",
              "image-run.ts",
              "event-run.ts",
              "debug-run.ts",
            ]
          : ["server.ts"];
    await command("pnpm", ["exec", "tsc", "--noEmit"], cwd);
    const env = `DATABASE_URL=${databaseURL}\nMODEL_BASE_URL=${modelOrigin}\nMODEL_ALLOW_PRIVATE_ORIGIN=true\nMODEL_NAME=synthetic\nMODEL_API_KEY=synthetic-model-key\nPROTOCOL_KEY=synthetic-stable-protection-key-only\nDEMO_LOGIN_PASSWORD=synthetic-demo-password-only\nPORT=44322\nFRONTEND_ORIGIN=http://127.0.0.1:44323\n`;
    await writeFile(join(cwd, ".env"), env, { mode: 0o600 });
    if (route === "backend") {
      const first = await command("pnpm", ["start"], cwd);
      const id = first.match(/[a-f0-9]{8}-[a-f0-9-]{27}/)?.[0];
      assert.ok(id);
      await writeFile(join(cwd, ".env"), env + `SESSION_ID=${id}\n`, {
        mode: 0o600,
      });
      await command("pnpm", ["start"], cwd);
      for (const scenario of ["tool", "skill", "knowledge", "memory", "event"])
        await command("pnpm", [scenario], cwd);
      assert.ok(
        requests.some((body) =>
          body.messages.some((m: any) =>
            m.content?.includes?.("先用一句话解释"),
          ),
        ),
      );
    }
  }
  const cwd = join(root, "fullstack");
  app = spawn(
    process.execPath,
    ["--env-file=.env", "--import", "tsx", "server.ts"],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
  );
  const appErrors: string[] = [];
  app.stderr!.on("data", (data) => appErrors.push(String(data)));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Fullstack did not start: " + appErrors.join(""))),
      20000,
    );
    app!.stdout!.on("data", (data) => {
      if (String(data).includes("Open http")) {
        clearTimeout(timer);
        resolve();
      }
    });
    app!.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Fullstack exited: " + appErrors.join("")));
    });
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    httpCredentials: {
      username: "demo",
      password: "synthetic-demo-password-only",
    },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:44322");
  await page.locator("textarea").fill("独立目录发消息");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".ae-message-agent")).toContainText(
    "独立接入验证通过",
  );
  await page.reload();
  await expect(page.locator(".ae-message-agent")).toContainText(
    "独立接入验证通过",
  );
  assert.deepEqual(errors, []);
  const frontend = join(root, "frontend");
  await writeFile(
    join(frontend, ".env"),
    "CHAT_API_URL=http://127.0.0.1:44322/api/agent-chat\nPORT=44323\n",
    { mode: 0o600 },
  );
  front = spawn(process.execPath, ["--env-file=.env", "serve.mjs"], {
    cwd: frontend,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Frontend did not start")),
      20000,
    );
    front!.stdout!.on("data", (data) => {
      if (String(data).includes("Open http")) {
        clearTimeout(timer);
        resolve();
      }
    });
    front!.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Frontend exited"));
    });
  });
  await page.goto("http://127.0.0.1:44323");
  await page.locator("textarea").fill("独立前端跨域发送");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".ae-message-agent")).toContainText(
    "独立接入验证通过",
  );
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "Independent consumers: all three routes installed/typechecked; backend restart + five scenarios and authenticated fullstack browser send/reload and separate frontend cross-origin send passed.",
  );
} finally {
  await browser?.close();
  for (const child of [front, app])
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  await new Promise<void>((r) => provider.close(() => r()));
  await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
}
