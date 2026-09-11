import type { JsonValue } from "../protocol/json.js";
import type { ModelConfig } from "../config/schema.js";
import type { AgentEngineError } from "../errors/index.js";
export type ModelBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; summary?: string }
  | { type: "tool_call"; id: string; name: string; arguments: JsonValue }
  | { type: "opaque" };
export interface ContextDataRef {
  kind: "knowledge" | "memory" | "tool";
  id: string;
  expiresAt?: string;
  source?: JsonValue;
}
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  callId?: string;
  operationId?: string;
  blocks?: ModelBlock[];
  native?: JsonValue;
  dataRefs?: ContextDataRef[];
}
export interface ModelRequest {
  model: ModelConfig;
  messages: ModelMessage[];
  tools: { name: string; description: string; inputSchema: JsonValue }[];
  outputSchema?: JsonValue;
  purpose: "decision" | "input-repair" | "output-repair" | "compaction";
}
export interface ProviderUsage {
  input?: number;
  uncachedInput?: number;
  cacheReadInput?: number;
  cacheWriteInput?: number;
  output?: number;
  reasoning?: number;
  total?: number;
}
export interface ModelResponse {
  blocks: ModelBlock[];
  stopReason:
    "final" | "tool_calls" | "output_limit" | "refused" | "content_filtered";
  native?: JsonValue;
  providerResponseId?: string;
}
export type ModelStreamEvent =
  // Valid private payload progress, without disclosing its contents to consumers.
  | { type: "activity" }
  | { type: "delta"; blockId: string; kind: "text" | "thinking"; text: string }
  | {
      type: "usage";
      usage: ProviderUsage;
      mode: "snapshot" | "delta";
      final: boolean;
      sourceEventId?: string;
    }
  | { type: "completed"; response: ModelResponse }
  | { type: "failed"; error: AgentEngineError };
export interface ModelAdapter {
  version: string;
  capabilities: {
    tools: boolean;
    thinking: boolean;
    structuredOutput: boolean;
  };
  stream(
    request: ModelRequest,
    context: {
      signal: AbortSignal;
      secret: string;
      allowPrivateNetwork?: boolean;
      reportUsage?: (
        event: Extract<ModelStreamEvent, { type: "usage" }>,
      ) => Promise<void>;
    },
  ): AsyncIterable<ModelStreamEvent>;
}
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  random(): number;
}
export const systemClock: Clock = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", abort, { once: true });
    }),
};
