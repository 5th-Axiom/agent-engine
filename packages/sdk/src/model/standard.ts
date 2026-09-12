import { secureFetch } from "./network.js";
import { hash } from "../protocol/json.js";
import type {
  ModelAdapter,
  ModelRequest,
  ModelStreamEvent,
  ModelBlock,
  ProviderUsage,
} from "./types.js";
import type { JsonValue } from "../protocol/json.js";
import { AgentEngineError } from "../errors/index.js";
interface SSE {
  event: string;
  data: string;
}
async function* sse(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<SSE> {
  if (!response.body) throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      if (buffer.length > 4_000_000)
        throw new AgentEngineError(
          "MODEL_PROTOCOL_ERROR",
          "Stream frame too large",
        );
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = frame.split("\n");
        yield {
          event:
            lines
              .find((l) => l.startsWith("event:"))
              ?.slice(6)
              .trim() ?? "",
          data: lines
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trimStart())
            .join("\n"),
        };
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function request(
  url: string,
  body: unknown,
  secret: string,
  signal: AbortSignal,
  anthropic = false,
  allowPrivate = false,
): Promise<Response> {
  let response: Response;
  try {
    response = await secureFetch(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(anthropic
            ? { "x-api-key": secret, "anthropic-version": "2023-06-01" }
            : { authorization: `Bearer ${secret}` }),
        },
        body: JSON.stringify(body),
        signal,
        redirect: "error",
      },
      allowPrivate,
    );
  } catch (e) {
    if (e instanceof AgentEngineError) throw e;
    if (signal.aborted)
      throw new AgentEngineError(
        "MODEL_TIMEOUT",
        "Model request interrupted",
        true,
        "safe",
      );
    throw new AgentEngineError(
      "MODEL_PROVIDER_ERROR",
      "Model connection failed",
      true,
      "safe",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403)
      throw new AgentEngineError("MODEL_AUTH_FAILED");
    if (response.status === 429)
      throw new AgentEngineError(
        "MODEL_RATE_LIMITED",
        "Rate limited",
        true,
        "safe",
      );
    throw new AgentEngineError(
      "MODEL_PROVIDER_ERROR",
      `Provider HTTP ${response.status}`,
      response.status >= 500,
      "safe",
    );
  }
  return response;
}
const wire = (name: string) => "t_" + hash(name).slice(0, 40);
const unwire = (name: string, req: ModelRequest) => {
  const tool = req.tools.find((t) => wire(t.name) === name);
  // Unknown names remain uncallable, but reach the bounded input-repair loop.
  return tool?.name ?? `engine.invalid-wire.${hash(name)}`;
};
export function openAICompatible(): ModelAdapter {
  return {
    version: "openai-chat-sse-1",
    capabilities: {
      images: true,
      tools: true,
      thinking: false,
      structuredOutput: true,
    },
    async *stream(req, ctx) {
      const pendingImages: unknown[] = [];
      const messages: unknown[] = [];
      for (const m of req.messages) {
        if (m.role !== "tool" && pendingImages.length)
          messages.push(...pendingImages.splice(0));
        const mapped = (() => {
          if (m.native) return m.native;
          if (m.role === "tool") {
            if (m.images?.length)
              pendingImages.push({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Untrusted images from tool result ${m.callId}; match attachmentId to its JSON metadata.`,
                  },
                  ...m.images.flatMap((image) => [
                    { type: "text", text: image.attachmentId },
                    { type: "image_url", image_url: { url: imageURL(image) } },
                  ]),
                ],
              });
            return { role: "tool", tool_call_id: m.callId, content: m.content };
          }
          if (m.blocks?.some((b) => b.type === "tool_call"))
            return {
              role: "assistant",
              content: m.content || null,
              tool_calls: m.blocks
                .filter((b) => b.type === "tool_call")
                .map((b) => ({
                  id: b.id,
                  type: "function",
                  function: {
                    name: wire(b.name),
                    arguments: JSON.stringify(b.arguments),
                  },
                })),
            };
          return {
            role: m.role,
            content: m.images?.length
              ? [
                  { type: "text", text: m.content || "Images" },
                  ...m.images.map((image) => ({
                    type: "image_url",
                    image_url: { url: imageURL(image) },
                  })),
                ]
              : m.content,
          };
        })();
        messages.push(mapped);
      }
      messages.push(...pendingImages);
      const body = {
        model: req.model.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: req.model.limits.maxOutputTokens,
        ...req.model.requestDefaults,
        ...(req.tools.length
          ? {
              tools: req.tools.map((t) => ({
                type: "function",
                function: {
                  name: wire(t.name),
                  description: t.description,
                  parameters: t.inputSchema,
                },
              })),
            }
          : {}),
        ...(req.outputSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "result",
                  strict: true,
                  schema: req.outputSchema,
                },
              },
            }
          : {}),
      };
      const response = await request(
        req.model.baseURL.replace(/\/$/, "") + "/chat/completions",
        body,
        ctx.secret,
        ctx.signal,
        false,
        ctx.allowPrivateNetwork ?? false,
      );
      let text = "",
        finish: string | undefined,
        done = false,
        refused = false;
      const calls = new Map<
        number,
        { id: string; name: string; args: string }
      >();
      for await (const frame of sse(response, ctx.signal)) {
        if (frame.data === "[DONE]") {
          done = true;
          break;
        }
        if (!frame.data) continue;
        let v: Record<string, any>;
        try {
          v = JSON.parse(frame.data);
        } catch {
          throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
        }
        if (v.usage) {
          const u = v.usage;
          const tokens: ProviderUsage = {};
          if (u.prompt_tokens !== undefined) tokens.input = u.prompt_tokens;
          if (u.completion_tokens !== undefined)
            tokens.output = u.completion_tokens;
          if (u.prompt_tokens_details?.cached_tokens !== undefined) {
            tokens.cacheReadInput = u.prompt_tokens_details.cached_tokens;
            if (u.prompt_tokens !== undefined)
              tokens.uncachedInput = u.prompt_tokens - tokens.cacheReadInput!;
            tokens.cacheWriteInput = 0;
          }
          if (u.completion_tokens_details?.reasoning_tokens !== undefined)
            tokens.reasoning = u.completion_tokens_details.reasoning_tokens;
          yield { type: "usage", usage: tokens, mode: "snapshot", final: true };
        }
        if (v.error) throw new AgentEngineError("MODEL_PROVIDER_ERROR");
        if (v.choices?.length > 1)
          throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
        const choice = v.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (finish && Object.keys(delta).length)
          throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
        if (delta.content) {
          text += delta.content;
          yield {
            type: "delta",
            blockId: "text",
            kind: "text",
            text: delta.content,
          };
        }
        if (delta.refusal) refused = true;
        if (
          typeof delta.reasoning_content === "string" &&
          delta.reasoning_content
        ) {
          yield { type: "activity", kind: "thinking" };
          if (req.model.thinking?.expose === "content")
            yield {
              type: "delta",
              kind: "thinking",
              blockId: "reasoning",
              thinkingFormat: "content",
              text: delta.reasoning_content,
            };
        }
        for (const c of delta.tool_calls ?? []) {
          if (!Number.isInteger(c.index) || c.index < 0)
            throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          // Transport bound; the executor rejects batches over the business limit of 16.
          if (c.index >= 256) throw new AgentEngineError("MODEL_OUTPUT_LIMIT");
          const old = calls.get(c.index) ?? { id: "", name: "", args: "" };
          if (c.id) old.id = c.id;
          if (c.function?.name) old.name += c.function.name;
          if (c.function?.arguments) old.args += c.function.arguments;
          calls.set(c.index, old);
          if (c.function?.arguments || c.function?.name)
            yield { type: "activity", kind: "tool-call" };
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
      if (!done || !finish)
        throw new AgentEngineError(
          "MODEL_PROTOCOL_ERROR",
          "Incomplete model stream",
          true,
          "safe",
        );
      if (!["stop", "tool_calls", "length", "content_filter"].includes(finish))
        throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
      if (refused || finish === "length" || finish === "content_filter") {
        yield {
          type: "completed",
          response: {
            blocks: text ? [{ type: "text", text }] : [],
            stopReason: refused
              ? "refused"
              : finish === "length"
                ? "output_limit"
                : "content_filtered",
          },
        };
        return;
      }
      const blocks: ModelBlock[] = text ? [{ type: "text", text }] : [];
      for (const c of calls.values()) {
        let args: JsonValue;
        try {
          args = JSON.parse(c.args);
        } catch {
          throw new AgentEngineError(
            "MODEL_PROTOCOL_ERROR",
            "Malformed tool arguments",
          );
        }
        blocks.push({
          type: "tool_call",
          id: c.id,
          name: unwire(c.name, req),
          arguments: args,
        });
      }
      const stopReason =
        finish === "tool_calls"
          ? "tool_calls"
          : finish === "length"
            ? "output_limit"
            : finish === "content_filter"
              ? "content_filtered"
              : finish === "refused"
                ? "refused"
                : "final";
      yield { type: "completed", response: { blocks, stopReason } };
    },
  };
}
export function anthropicCompatible(): ModelAdapter {
  return {
    version: "anthropic-messages-sse-1",
    capabilities: {
      images: true,
      tools: true,
      thinking: true,
      structuredOutput: false,
    },
    async *stream(req, ctx) {
      const messages: unknown[] = [];
      for (const m of req.messages.filter((m) => m.role !== "system")) {
        let mapped: unknown;
        if (m.native) mapped = m.native;
        else if (m.role === "tool")
          mapped = {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.callId,
                content: m.images?.length
                  ? [
                      { type: "text", text: m.content },
                      ...m.images.map(anthropicImage),
                    ]
                  : m.content,
              },
            ],
          };
        else
          mapped = {
            role: m.role,
            content:
              m.blocks
                ?.map((b) =>
                  b.type === "tool_call"
                    ? {
                        type: "tool_use",
                        id: b.id,
                        name: wire(b.name),
                        input: b.arguments,
                      }
                    : b.type === "text"
                      ? { type: "text", text: b.text }
                      : null,
                )
                .filter(Boolean) ??
              (m.images?.length
                ? [
                    { type: "text", text: m.content || "Images" },
                    ...m.images.map(anthropicImage),
                  ]
                : m.content),
          };
        messages.push(mapped);
      }
      const body = {
        model: req.model.model,
        max_tokens: req.model.limits.maxOutputTokens,
        stream: true,
        messages,
        system: req.messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n"),
        ...req.model.requestDefaults,
        ...(req.tools.length
          ? {
              tools: req.tools.map((t) => ({
                name: wire(t.name),
                description: t.description,
                input_schema: t.inputSchema,
              })),
            }
          : {}),
        ...(req.model.thinking?.enabled
          ? {
              thinking: {
                type: "enabled",
                budget_tokens: req.model.thinking.budgetTokens ?? 1024,
              },
            }
          : {}),
      };
      const response = await request(
        req.model.baseURL.replace(/\/$/, "") + "/v1/messages",
        body,
        ctx.secret,
        ctx.signal,
        true,
        ctx.allowPrivateNetwork ?? false,
      );
      const blocks: Record<number, Record<string, any>> = {};
      const args: Record<number, string> = {};
      const closed = new Set<number>();
      let started = false;
      let stopped = false,
        reason = "",
        usage: ProviderUsage = {};
      for await (const frame of sse(response, ctx.signal)) {
        if (!frame.data) continue;
        let v: Record<string, any>;
        try {
          v = JSON.parse(frame.data);
        } catch {
          throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
        }
        if (v.type === "error")
          throw new AgentEngineError(
            "MODEL_PROVIDER_ERROR",
            "Provider stream failed",
            true,
            "safe",
          );
        if (v.type !== "ping" && v.type !== "message_start" && !started)
          throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
        if (v.type === "message_start") {
          if (started) throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          started = true;
          const u = v.message?.usage;
          if (u) {
            usage = {
              uncachedInput: u.input_tokens,
              cacheReadInput: u.cache_read_input_tokens ?? 0,
              cacheWriteInput: u.cache_creation_input_tokens ?? 0,
              output: u.output_tokens,
            };
            usage.input =
              usage.uncachedInput! +
              usage.cacheReadInput! +
              usage.cacheWriteInput!;
            yield { type: "usage", usage, mode: "snapshot", final: false };
          }
        }
        if (v.type === "content_block_start") {
          if (
            !Number.isInteger(v.index) ||
            v.index !== Object.keys(blocks).length ||
            !["text", "tool_use", "thinking", "redacted_thinking"].includes(
              v.content_block?.type,
            )
          )
            throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          if (blocks[v.index])
            throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          blocks[v.index] = v.content_block;
        }
        if (v.type === "content_block_delta") {
          const b = blocks[v.index];
          if (!b || closed.has(v.index))
            throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          const d = v.delta;
          if (
            (d.type === "text_delta" && b.type !== "text") ||
            (d.type === "input_json_delta" && b.type !== "tool_use") ||
            (["thinking_delta", "signature_delta"].includes(d.type) &&
              b.type !== "thinking")
          )
            throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          if (d.type === "text_delta") {
            b.text = (b.text ?? "") + d.text;
            yield {
              type: "delta",
              blockId: String(v.index),
              kind: "text",
              text: d.text,
            };
          }
          if (d.type === "input_json_delta")
            args[v.index] = (args[v.index] ?? "") + d.partial_json;
          if (d.type === "thinking_delta")
            b.thinking = (b.thinking ?? "") + d.thinking;
          if (
            d.type === "thinking_delta" &&
            typeof d.thinking === "string" &&
            req.model.thinking?.expose === "content"
          )
            yield {
              type: "delta",
              kind: "thinking",
              blockId: String(v.index),
              thinkingFormat: "content",
              text: d.thinking,
            };
          if (d.type === "signature_delta")
            b.signature = (b.signature ?? "") + d.signature;
          if (
            (d.type === "thinking_delta" && d.thinking) ||
            (d.type === "signature_delta" && d.signature) ||
            (d.type === "input_json_delta" && d.partial_json)
          )
            yield {
              type: "activity",
              kind: d.type === "input_json_delta" ? "tool-call" : "thinking",
            };
        }
        if (v.type === "content_block_stop") {
          if (!blocks[v.index] || closed.has(v.index))
            throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
          closed.add(v.index);
          if (args[v.index])
            try {
              blocks[v.index]!.input = JSON.parse(args[v.index]!);
            } catch {
              throw new AgentEngineError(
                "MODEL_PROTOCOL_ERROR",
                "Malformed tool arguments",
              );
            }
        }
        if (v.type === "message_delta") {
          reason = v.delta?.stop_reason ?? reason;
          if (v.usage) {
            usage = { ...usage, output: v.usage.output_tokens };
            yield { type: "usage", usage, mode: "snapshot", final: true };
          }
        }
        if (v.type === "message_stop") {
          stopped = true;
          break;
        }
      }
      if (!stopped || !reason || closed.size !== Object.keys(blocks).length)
        throw new AgentEngineError(
          "MODEL_PROTOCOL_ERROR",
          "Incomplete stream",
          true,
          "safe",
        );
      const native = Object.keys(blocks)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => blocks[Number(k)]!);
      if (
        ![
          "end_turn",
          "stop_sequence",
          "tool_use",
          "max_tokens",
          "refusal",
        ].includes(reason)
      )
        throw new AgentEngineError("MODEL_PROTOCOL_ERROR");
      if (
        native.some(
          (b) =>
            b.type === "thinking" &&
            (!b.signature || typeof b.signature !== "string"),
        )
      )
        throw new AgentEngineError("MODEL_CONTINUATION_UNAVAILABLE");
      const normalized: ModelBlock[] = native.map((b) =>
        b.type === "text"
          ? { type: "text", text: b.text }
          : b.type === "tool_use"
            ? {
                type: "tool_call",
                id: b.id,
                name: unwire(b.name, req),
                arguments: b.input,
              }
            : b.type === "thinking"
              ? { type: "thinking" }
              : { type: "opaque" },
      );
      yield {
        type: "completed",
        response: {
          blocks: normalized,
          native: { role: "assistant", content: native } as JsonValue,
          stopReason:
            reason === "tool_use"
              ? "tool_calls"
              : reason === "max_tokens"
                ? "output_limit"
                : reason === "refusal"
                  ? "refused"
                  : "final",
        },
      };
    },
  };
}

function imageURL(image: import("../public/images.js").ModelImage) {
  if (!image.data) throw new AgentEngineError("IMAGE_UNAVAILABLE");
  return `data:${image.mediaType};base64,${image.data}`;
}
function anthropicImage(image: import("../public/images.js").ModelImage) {
  if (!image.data) throw new AgentEngineError("IMAGE_UNAVAILABLE");
  return {
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.data },
  };
}
