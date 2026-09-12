import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  AgentEngineError,
  type AgentEngine,
  type BindingContract,
  type ModelConfig,
  type ToolDefinition,
  terminal,
} from "@agent-runtime/sdk";
import { startDebugServer } from "@agent-runtime/debug";
import { createChatHandler } from "@agent-runtime/chat-server";
import { makeChatAssistants } from "./chat-assistants.js";

export interface PlaygroundProfile {
  profileName: string;
  model: ModelConfig;
}
export const inventoryBinding: BindingContract = {
  version: "1",
  sideEffect: "read",
  execute: async (input) => {
    const { sku } = input as { sku: string };
    return { sku, available: sku === "DEMO-1" ? 24 : 7, synthetic: true };
  },
};
const inventoryTool: ToolDefinition = {
  name: "demo.inventory",
  description: "查询合成演示库存，仅有 DEMO-1 与 DEMO-2，不读取真实业务数据。",
  inputSchema: {
    type: "object",
    properties: { sku: { type: "string", enum: ["DEMO-1", "DEMO-2"] } },
    required: ["sku"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      sku: { type: "string" },
      available: { type: "integer" },
      synthetic: { const: true },
    },
    required: ["sku", "available", "synthetic"],
    additionalProperties: false,
  },
  execution: {
    type: "binding",
    bindingKey: "playground.inventory",
    sideEffect: "read",
  },
};
const createSchema = z.strictObject({
  requestId: z.uuid(),
  profile: z.string().min(1).max(64),
  scenario: z.enum(["chat", "tool"]),
});
const runSchema = z.strictObject({
  requestId: z.uuid(),
  input: z.string().trim().min(1).max(8000),
});
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new HttpError(415, "JSON_REQUIRED");
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 40000) throw new HttpError(413, "INPUT_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_INPUT");
  }
}
const publicProfile = (p: PlaygroundProfile) => ({
  id: p.profileName,
  model: p.model.model,
  provider: p.model.provider,
  thinking: !!p.model.thinking?.enabled,
  maxOutputTokens: p.model.limits.maxOutputTokens,
});

export async function startPlayground(options: {
  engine: AgentEngine;
  profiles: PlaygroundProfile[];
  defaultProfile: string;
  debugSecretRef: string;
  port?: number;
}) {
  const { engine } = options;
  const assets = new Map(
    await Promise.all(
      [
        ["/", "index.html", "text/html; charset=utf-8"],
        ["/app.js", "app.js", "text/javascript; charset=utf-8"],
        ["/app.css", "app.css", "text/css; charset=utf-8"],
        ["/embed/", "../embedded/index.html", "text/html; charset=utf-8"],
        [
          "/embed/app.js",
          "../embedded/app.js",
          "text/javascript; charset=utf-8",
        ],
        ["/embed/app.css", "../embedded/app.css", "text/css; charset=utf-8"],
        [
          "/sdk/agent-chat.mjs",
          "../../packages/chat-ui/dist/agent-chat.mjs",
          "text/javascript; charset=utf-8",
        ],
        [
          "/sdk/agent-chat.js",
          "../../packages/chat-ui/dist/agent-chat.js",
          "text/javascript; charset=utf-8",
        ],
      ].map(
        async ([route, file, type]) =>
          [
            route!,
            {
              content: await readFile(new URL(file!, import.meta.url)),
              type: type!,
            },
          ] as const,
      ),
    ),
  );
  const cookie = randomBytes(32).toString("hex");
  const cookieName = "agent_playground";
  const debugToken = await engine.options.secrets.resolve(
    options.debugSecretRef,
    engine.principal,
  );
  const debug = await startDebugServer({
    engine,
    port: 0,
    basePath: "/debug",
    backLink: { href: "/", label: "返回本地测试" },
    auth: { type: "token", secretRef: options.debugSecretRef },
  });
  let origin = "";
  const chat = createChatHandler({
    namespace: "playground-embedded",
    images: options.profiles.some(
      (profile) => profile.model.capabilities?.images === true,
    ),
    allowedOrigins: () => [origin],
    resolveContext: async () => ({
      engine,
      assistants: makeChatAssistants(options.profiles, inventoryTool),
      defaultAssistant: options.defaultProfile,
    }),
    debugPath: (id) => `/debug/sessions/${encodeURIComponent(id)}`,
  });
  const profiles = new Map(options.profiles.map((p) => [p.profileName, p]));

  async function sessionView(id: string) {
    const session = await engine.readSession(id);
    const inspection = await engine.inspectSession(id);
    if (inspection.runs.some((run) => run.acceptedSequence === undefined))
      throw new HttpError(409, "RUN_ORDER_UNAVAILABLE");
    const selected = inspection.runs.slice(-50);
    const runs = await Promise.all(
      selected.map(async (summary) => {
        const r = await engine.readRun(id, summary.id);
        // Explicit projection: neither native payloads, model credentials, tool
        // receipts nor private reasoning cross the browser boundary.
        return {
          id: r.id,
          input: typeof r.input === "string" ? r.input : "",
          state: r.state,
          cancelRequested: r.cancelRequested,
          output: r.result?.outputText ?? "",
          draft: Object.values(r.drafts ?? {})
            .flatMap((d) =>
              Object.values(d.blocks)
                .filter((b) => b.kind === "text")
                .map((b) => b.text),
            )
            .join(""),
          error: r.error ? { code: r.error.code } : undefined,
          steps: summary.steps.length,
          attempts: summary.usage.attemptCount,
          usage: { ...summary.usage, attempts: undefined },
          operations: inspection.operations
            .filter((o) => o.runId === r.id)
            .map((o) => ({
              id: o.id,
              name: o.name,
              state: o.executionStatus,
              validation: o.validationStatus,
            })),
        };
      }),
    );
    return {
      id,
      profile: session.config.routing.primary,
      model: session.config.models[session.config.routing.primary]?.model,
      scenario: session.config.tools.length ? "tool" : "chat",
      activeRun: session.activeRun,
      runs,
      totalRuns: inspection.runs.length,
      debugURL: `/debug/sessions/${encodeURIComponent(id)}`,
    };
  }

  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
    );
    try {
      // Trusted single-user local host. Exact Host stops DNS rebinding; Fetch
      // Metadata, Origin, SameSite and JSON/custom-header gates stop browser CSRF.
      if (
        req.headers.host !== new URL(origin).host ||
        (req.headers.origin && req.headers.origin !== origin) ||
        ["cross-site", "same-site"].includes(
          String(req.headers["sec-fetch-site"]),
        )
      )
        throw new HttpError(403, "LOCAL_ORIGIN_REQUIRED");
      const url = new URL(req.url ?? "/", origin);
      if (
        (url.pathname === "/" || url.pathname === "/embed/") &&
        req.method === "GET"
      ) {
        res.setHeader(
          "set-cookie",
          `${cookieName}=${cookie}; HttpOnly; SameSite=Strict; Path=/`,
        );
        const asset = assets.get(url.pathname)!;
        res.writeHead(200, { "content-type": asset.type });
        res.end(asset.content);
        return;
      }
      const provided =
        req.headers.cookie
          ?.split(/;\s*/)
          .find((part) => part.startsWith(`${cookieName}=`))
          ?.slice(cookieName.length + 1) ?? "";
      const localDebugNavigation =
        req.method === "GET" &&
        (url.pathname === "/debug" || url.pathname.startsWith("/debug/")) &&
        (!req.headers["sec-fetch-dest"] ||
          req.headers["sec-fetch-dest"] === "document");
      if (localDebugNavigation) {
        res.setHeader(
          "set-cookie",
          `${cookieName}=${cookie}; HttpOnly; SameSite=Strict; Path=/`,
        );
      } else if (
        Buffer.byteLength(provided) !== Buffer.byteLength(cookie) ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(cookie))
      )
        throw new HttpError(401, "LOCAL_SESSION_REQUIRED");
      if (
        req.method !== "GET" &&
        (req.headers.origin !== origin ||
          (req.headers["x-agent-playground"] !== "1" &&
            !(
              url.pathname.startsWith("/api/agent-chat/") &&
              req.headers["x-agent-chat"] === "1"
            )))
      )
        throw new HttpError(403, "LOCAL_ORIGIN_REQUIRED");
      if (await chat(req, res)) return;
      if (url.pathname === "/debug" || url.pathname.startsWith("/debug/")) {
        if (req.method !== "GET") throw new HttpError(405, "READ_ONLY_DEBUG");
        const upstream = await fetch(debug.url + url.pathname + url.search, {
          headers: { authorization: `Bearer ${debugToken}` },
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        res.writeHead(upstream.status, {
          "content-type": upstream.headers.get("content-type") ?? "text/html",
          "content-security-policy":
            upstream.headers.get("content-security-policy") ??
            "default-src 'none'",
        });
        res.end(await upstream.text());
        return;
      }
      const asset = assets.get(url.pathname);
      if (asset && req.method === "GET") {
        res.writeHead(200, { "content-type": asset.type });
        res.end(asset.content);
        return;
      }
      if (url.pathname === "/api/config" && req.method === "GET") {
        json(res, {
          defaultProfile: options.defaultProfile,
          profiles: options.profiles.map(publicProfile),
        });
        return;
      }
      if (url.pathname === "/api/sessions" && req.method === "GET") {
        const sessions = (await engine.listSessions()).filter(
          (s) => !s.archived,
        );
        const items = await Promise.all(
          sessions.map(async (s) => {
            try {
              const record = await engine.readSession(s.id);
              if (record.config.metadata?.agentChat) return null;
              const firstInput = record.history.find(
                (m) => m.role === "user",
              )?.content;
              return {
                id: s.id,
                title: firstInput?.slice(0, 60) || "新对话",
                profile: record.config.routing.primary,
                createdAt: record.createdAt ?? 0,
                active: !!record.activeRun,
              };
            } catch (error) {
              if (
                error instanceof AgentEngineError &&
                error.code === "DATA_RETENTION_EXPIRED"
              )
                return null;
              throw error;
            }
          }),
        );
        json(
          res,
          items
            .filter((s) => s !== null)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 50),
        );
        return;
      }
      if (url.pathname === "/api/sessions" && req.method === "POST") {
        const parsed = createSchema.safeParse(await body(req));
        if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
        const { profile, scenario, requestId } = parsed.data;
        const selected = profiles.get(profile);
        if (!selected) throw new HttpError(400, "UNKNOWN_PROFILE");
        const session = await engine.createSession({
          requestId,
          config: {
            models: {
              [profile]: {
                ...selected.model,
                ...(selected.model.thinking
                  ? {
                      thinking: {
                        ...selected.model.thinking,
                        expose: "none" as const,
                      },
                    }
                  : {}),
              },
            },
            routing: { primary: profile },
            instructions: {
              text:
                scenario === "tool"
                  ? "使用中文回答。用户问库存时，必须使用 demo.inventory 查询一次，以工具结果为准，并明确这是合成演示数据。其他问题正常回答。"
                  : "你正在协助用户在本地测试 Agent Engine。请使用中文清楚、简洁地回答。",
            },
            tools: scenario === "tool" ? [inventoryTool] : [],
            retry: { model: { maxRetries: 0 } },
            loop: {
              maxSteps: 6,
              maxModelAttempts: 6,
              maxCapabilityInvocations: 8,
              timeoutMs: 90000,
            },
            budgets: { perRun: { maxTotalTokens: 32000 } },
          },
        });
        json(res, { id: session.id }, 201);
        return;
      }
      const match =
        /^\/api\/sessions\/([a-f0-9-]{36})(?:\/(runs|cancel))?$/.exec(
          url.pathname,
        );
      if (!match) throw new HttpError(404, "NOT_FOUND");
      const id = match[1]!;
      if (!match[2] && req.method === "GET") {
        json(res, await sessionView(id));
        return;
      }
      const session = await engine.loadSession(id);
      if (match[2] === "runs" && req.method === "POST") {
        const parsed = runSchema.safeParse(await body(req));
        if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
        const handle = await session.startRun(parsed.data);
        void handle.result.catch(() => {}); // Terminal errors are read from the durable Run.
        json(res, { runId: handle.runId }, 202);
        return;
      }
      if (match[2] === "cancel" && req.method === "POST") {
        const parsed = z
          .strictObject({ runId: z.uuid() })
          .safeParse(await body(req));
        if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
        const record = await engine.readRun(id, parsed.data.runId);
        if (!terminal(record.state)) await session.cancelRun(record.id);
        json(res, { accepted: true });
        return;
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED");
    } catch (error) {
      const code =
        error instanceof HttpError || error instanceof AgentEngineError
          ? error.code
          : "LOCAL_SERVER_ERROR";
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof AgentEngineError && error.code === "ACCESS_DENIED"
            ? 403
            : 409;
      if (!res.headersSent) json(res, { error: { code } }, status);
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 4318, "127.0.0.1", resolve);
    });
  } catch (error) {
    await debug.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("LOCAL_LISTEN_FAILED");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    url: origin,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      });
      await debug.close();
    },
  };
}
