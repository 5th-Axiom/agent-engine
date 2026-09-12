import { chatSettingsSchema, updateChatSettingsSchema } from "./settings.js";
import { z } from "zod";
import {
  ChatError,
  chatImageSchema,
  configSchema,
  sessionsSchema,
  sessionSchema,
  createdSchema,
  sentSchema,
  cancelledSchema,
  createSessionSchema,
  sendMessageSchema,
  cancelRunSchema,
  resolveChatInputSchema,
  type ChatTransport,
} from "./protocol.js";

export interface HttpChatOptions {
  /** Same-origin API base, e.g. /api/agent-chat. Absolute URLs require explicit cross-origin consent. */
  baseURL: string;
  allowCrossOrigin?: boolean;
  credentials?: RequestCredentials;
  /** Business authentication/CSRF headers, evaluated for every request; never a model API key. */
  headers?: () => HeadersInit | Promise<HeadersInit>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
export function createHttpChatTransport(
  options: HttpChatOptions,
): ChatTransport {
  const locationOrigin = globalThis.location?.origin;
  const url = new URL(options.baseURL, locationOrigin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ChatError("CHAT_INVALID_URL");
  if (
    locationOrigin &&
    url.origin !== locationOrigin &&
    !options.allowCrossOrigin
  )
    throw new ChatError("CHAT_CROSS_ORIGIN_DISABLED");
  const base = url.href.replace(/\/$/, "");
  const timeout = options.timeoutMs ?? 15000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120000)
    throw new ChatError("CHAT_INVALID_TIMEOUT");
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeout);
    let interrupt: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      interrupt = () => reject(new Error("Request interrupted"));
      controller.signal.addEventListener("abort", interrupt, { once: true });
      if (controller.signal.aborted) interrupt();
    });
    try {
      const headers = new Headers(
        await Promise.race([
          Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return options.headers?.();
          }),
          interrupted,
        ]),
      );
      headers.set("accept", "application/json");
      if (body !== undefined) {
        headers.set("content-type", "application/json");
        headers.set("x-agent-chat", "1");
      }
      controller.signal.throwIfAborted();
      const response = await Promise.race([
        (options.fetch ?? globalThis.fetch)(base + path, {
          method: body === undefined ? "GET" : "POST",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: options.credentials ?? "same-origin",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        }),
        interrupted,
      ]);
      const data: unknown = await Promise.race([
        response.json().catch(() => undefined),
        interrupted,
      ]);
      if (!response.ok) {
        const parsed = z
          .object({
            error: z.object({
              code: z.string().regex(/^[A-Z][A-Z0-9_]{0,100}$/),
            }),
          })
          .safeParse(data);
        throw new ChatError(
          parsed.success
            ? parsed.data.error.code
            : response.status === 401
              ? "CHAT_UNAUTHENTICATED"
              : response.status === 403
                ? "ACCESS_DENIED"
                : "CHAT_REQUEST_FAILED",
          response.status,
        );
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new ChatError("CHAT_INVALID_RESPONSE");
      return parsed.data;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError(
        signal?.aborted
          ? "CHAT_ABORTED"
          : controller.signal.aborted
            ? "CHAT_REQUEST_TIMEOUT"
            : "CHAT_CONNECTION_FAILED",
      );
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", interrupt);
      signal?.removeEventListener("abort", abort);
    }
  }
  const sessionPath = (id: string) =>
    "/sessions/" + encodeURIComponent(z.uuid().parse(id));
  return {
    resolveInput: async (id, input, s) => {
      await request(
        sessionPath(id) + "/input",
        z.object({ accepted: z.literal(true) }),
        s,
        resolveChatInputSchema.parse(input),
      );
    },
    readSettings: (id, s) =>
      request(sessionPath(id) + "/settings", chatSettingsSchema, s),
    updateSettings: (id, input, s) =>
      request(
        sessionPath(id) + "/settings",
        chatSettingsSchema,
        s,
        updateChatSettingsSchema.parse(input),
      ),
    uploadImage: async (file, signal) => {
      if (!file.size || file.size > 5 * 1024 * 1024)
        throw new ChatError("IMAGE_INVALID");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return request("/images", chatImageSchema, signal, {
        mediaType: file.type,
        data: btoa(binary),
        filename: "name" in file ? String(file.name).slice(0, 120) : "image",
      });
    },
    readImage: async (id, signal) => {
      const value = await request(
        "/images/" + z.uuid().parse(id),
        z.object({
          mediaType: z.enum([
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ]),
          data: z.string().max(7_000_000),
        }),
        signal,
      );
      return new Blob(
        [Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0))],
        { type: value.mediaType },
      );
    },
    getConfig: (s) => request("/config", configSchema, s),
    listSessions: (s) => request("/sessions", sessionsSchema, s),
    readSession: (id, s) => request(sessionPath(id), sessionSchema, s),
    createSession: (input, s) =>
      request("/sessions", createdSchema, s, createSessionSchema.parse(input)),
    sendMessage: (id, input, s) =>
      request(
        sessionPath(id) + "/runs",
        sentSchema,
        s,
        sendMessageSchema.parse(input),
      ),
    cancelRun: (id, runId, s) =>
      request(
        sessionPath(id) + "/cancel",
        cancelledSchema,
        s,
        cancelRunSchema.parse({ runId }),
      ),
  };
}
