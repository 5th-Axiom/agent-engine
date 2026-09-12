import {
  chatAssistantConfig,
  applyChatPreferences,
  readChatSettings,
} from "./settings.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ProcessJournal } from "./process.js";
import { z } from "zod";
import {
  AgentEngineError,
  parseConfig,
  terminal,
  imageLimits,
  imageMediaTypes,
} from "@agent-runtime/sdk";
import {
  ChatError,
  assistantIdSchema,
  assistantSchema,
  createSessionSchema,
  sendMessageSchema,
  cancelRunSchema,
  updateChatSettingsSchema,
} from "@agent-runtime/chat-core";
import {
  assistantFor,
  listChatSessions,
  readChatSession,
  publicTools,
  publicComposer,
} from "./projection.js";
import { resolveChatInputSchema } from "@agent-runtime/chat-core";
import type { ChatHandlerOptions } from "./types.js";
export * from "./types.js";
export { chatAssistantConfig, restoreChatPreferences } from "./settings.js";
export { ChatError } from "@agent-runtime/chat-core";

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage, limit = 40000): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new ChatError("CHAT_JSON_REQUIRED", 415);
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new ChatError("CHAT_INPUT_TOO_LARGE", 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ChatError("INVALID_INPUT", 400);
  }
}
/** Framework-neutral Node handler. Returns false only when the path belongs to another route. */
export function createChatHandler(options: ChatHandlerOptions) {
  const journal = new ProcessJournal();
  const base = options.basePath ?? "/api/agent-chat";
  if (
    !/^\/[a-zA-Z0-9_/-]+$/.test(base) ||
    base.endsWith("/") ||
    !assistantIdSchema.safeParse(options.namespace).success
  )
    throw new ChatError("CHAT_INVALID_OPTIONS");
  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> => {
    const path = new URL(req.url ?? "/", "http://local.invalid").pathname;
    if (path !== base && !path.startsWith(base + "/")) return false;
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("vary", "Origin");
    try {
      const origins =
        typeof options.allowedOrigins === "function"
          ? options.allowedOrigins()
          : options.allowedOrigins;
      if (
        !origins.length ||
        origins.some((origin) => {
          try {
            return (
              new URL(origin).origin !== origin || !/^https?:/.test(origin)
            );
          } catch {
            return true;
          }
        })
      )
        throw new ChatError("CHAT_INVALID_ORIGINS", 500);
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin))
        throw new ChatError("CHAT_ORIGIN_DENIED", 403);
      if (origin) {
        res.setHeader("access-control-allow-origin", origin);
        if (options.allowCredentials)
          res.setHeader("access-control-allow-credentials", "true");
      }
      if (req.method === "OPTIONS") {
        if (!origin) throw new ChatError("CHAT_ORIGIN_REQUIRED", 403);
        res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
        res.setHeader(
          "access-control-allow-headers",
          [
            "content-type",
            "x-agent-chat",
            "authorization",
            "x-csrf-token",
            ...(options.allowedHeaders ?? []),
          ].join(", "),
        );
        res.writeHead(204);
        res.end();
        return true;
      }
      if (
        req.method !== "GET" &&
        (req.method !== "POST" ||
          !origin ||
          req.headers["x-agent-chat"] !== "1")
      )
        throw new ChatError("CHAT_ORIGIN_REQUIRED", 403);
      const context = await options.resolveContext(req);
      if (!context?.engine) throw new ChatError("CHAT_UNAUTHENTICATED", 401);
      const publicAssistants = context.assistants.map((a) =>
        assistantSchema.parse({
          ...a,
          ...(a.settings ? { settingsEnabled: true } : {}),
          ...publicComposer(parseConfig(a.config), a),
          supportsImages:
            parseConfig(a.config).models[parseConfig(a.config).routing.primary]
              ?.capabilities?.images === true,
          tools: publicTools(parseConfig(a.config).tools, a.toolDisplay),
        }),
      );
      if (
        !publicAssistants.length ||
        new Set(publicAssistants.map((a) => a.id)).size !==
          publicAssistants.length
      )
        throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE", 403);
      const defaultAssistant =
        context.defaultAssistant ?? publicAssistants[0]!.id;
      if (!publicAssistants.some((a) => a.id === defaultAssistant))
        throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE", 403);
      const route = path.slice(base.length);
      if (options.images && route === "/images" && req.method === "POST") {
        const data = z
          .strictObject({
            mediaType: z.enum(imageMediaTypes),
            data: z
              .string()
              .max(7_000_000)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
            filename: z.string().max(120).optional(),
          })
          .parse(await body(req, 7_100_000));
        const ref = await context.engine.uploadImage({
          data: Buffer.from(data.data, "base64"),
          mediaType: data.mediaType,
          filename: data.filename,
        });
        json(res, 201, ref);
        return true;
      }
      const imageRoute = /^\/images\/([a-f0-9-]{36})$/i.exec(route);
      if (options.images && imageRoute && req.method === "GET") {
        const image = await context.engine.readImage(imageRoute[1]!);
        json(res, 200, {
          mediaType: image.mediaType,
          data: image.data.toString("base64"),
        });
        return true;
      }
      if (route === "/config" && req.method === "GET") {
        json(res, 200, {
          ...(options.images ? { images: imageLimits } : {}),
          protocolVersion: 1,
          assistants: publicAssistants,
          defaultAssistant,
          maxInputLength: 8000,
        });
        return true;
      }
      if (route === "/sessions") {
        if (req.method === "GET") {
          json(res, 200, await listChatSessions(context, options.namespace));
          return true;
        }
        const data = createSessionSchema.parse(await body(req));
        const assistant = context.assistants.find(
          (a) => a.id === data.assistantId,
        );
        if (!assistant) throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE", 403);
        const config = chatAssistantConfig(assistant);
        config.metadata = {
          ...config.metadata,
          agentChat: {
            namespace: options.namespace,
            assistantId: assistant.id,
          },
        };
        const session = await context.engine.createSession({
          config,
          requestId: `chat:${options.namespace}:${data.requestId}`,
        });
        json(res, 201, { id: session.id });
        return true;
      }
      const match =
        /^\/sessions\/([a-f0-9-]{36})(?:\/(runs|cancel|settings|input))?$/i.exec(
          route,
        );
      if (!match || !z.uuid().safeParse(match[1]).success)
        throw new ChatError("CHAT_NOT_FOUND", 404);
      const id = match[1]!;
      const record = await context.engine.readSession(id);
      const assistant = assistantFor(record, context, options.namespace);
      if (match[2] === "input") {
        if (req.method !== "POST")
          throw new ChatError("CHAT_METHOD_NOT_ALLOWED", 405);
        if (!assistant.interaction)
          throw new ChatError("CHAT_INTERACTION_UNAVAILABLE", 403);
        const { id: pendingId, ...value } = resolveChatInputSchema.parse(
          await body(req),
        );
        await (
          await context.engine.loadSession(id)
        ).resolveInput(pendingId, value);
        json(res, 200, { accepted: true });
        return true;
      }
      if (match[2] === "settings") {
        const current = readChatSettings(record, assistant);
        if (req.method === "GET") {
          json(res, 200, current);
          return true;
        }
        if (!current.editable) throw new ChatError("SESSION_ARCHIVED", 409);
        const input = updateChatSettingsSchema.parse(await body(req));
        const next = applyChatPreferences(
          chatAssistantConfig(assistant),
          input.preferences,
        );
        next.metadata = {
          ...record.config.metadata,
          ...next.metadata,
          agentChat: record.config.metadata!.agentChat!,
        };
        await (
          await context.engine.loadSession(id)
        ).replaceConfig({ ifVersion: input.ifVersion, config: next });
        json(
          res,
          200,
          readChatSettings(await context.engine.readSession(id), assistant),
        );
        return true;
      }
      if (!match[2] && req.method === "GET") {
        const debug = options.debugPath?.(id);
        if (
          debug &&
          (!debug.startsWith("/") ||
            debug.startsWith("//") ||
            debug.includes("\\"))
        )
          throw new ChatError("CHAT_INVALID_DEBUG_PATH", 500);
        json(
          res,
          200,
          await readChatSession(context, options.namespace, id, debug, journal),
        );
        return true;
      }
      if (req.method === "POST") {
        const session = await context.engine.loadSession(id);
        if (match[2] === "runs") {
          const input = sendMessageSchema.parse(await body(req));
          const available = publicComposer(record.config, assistant);
          const selected = input.modelId ?? record.config.routing.primary;
          if (!available.models.some((model) => model.id === selected))
            throw new ChatError("CHAT_MODEL_UNAVAILABLE", 409);
          if (
            input.skillId &&
            !available.skills.some((skill) => skill.id === input.skillId)
          )
            throw new ChatError("CHAT_SKILL_UNAVAILABLE", 409);
          const { modelId, skillId, contextRef, ...message } = input;
          if (contextRef && !options.resolveRunContext)
            throw new ChatError("CHAT_CONTEXT_UNAVAILABLE", 400);
          const runContext = await options.resolveRunContext?.({
            context,
            sessionId: id,
            requestId: input.requestId,
            ...(contextRef ? { contextRef } : {}),
          });
          const handle = await session.startRun({
            ...message,
            ...(runContext ? { context: runContext } : {}),
            ...(modelId ? { overrides: { model: modelId } } : {}),
            ...(skillId ? { skill: skillId } : {}),
          });
          void handle.result.catch(() => {});
          json(res, 202, { runId: handle.runId });
          return true;
        }
        if (match[2] === "cancel") {
          const input = cancelRunSchema.parse(await body(req));
          const run = await context.engine.readRun(id, input.runId);
          if (!terminal(run.state)) await session.cancelRun(run.id);
          json(res, 200, { accepted: true });
          return true;
        }
      }
      throw new ChatError("CHAT_METHOD_NOT_ALLOWED", 405);
    } catch (error) {
      const code =
        error instanceof ChatError || error instanceof AgentEngineError
          ? error.code
          : error instanceof z.ZodError
            ? "INVALID_INPUT"
            : "CHAT_SERVER_ERROR";
      const status =
        error instanceof ChatError
          ? (error.status ?? 409)
          : error instanceof z.ZodError
            ? 400
            : code === "ACCESS_DENIED"
              ? 403
              : error instanceof AgentEngineError
                ? 409
                : 500;
      if (!res.headersSent) json(res, status, { error: { code } });
      else res.end();
      return true;
    }
  };
}
