import type { IncomingMessage } from "node:http";
import type { AgentEngine, JsonValue, JsonObject } from "@agent-runtime/sdk";
import type { ChatAssistant, ChatTool } from "@agent-runtime/chat-core";
export interface ChatAssistantDefinition extends Omit<
  ChatAssistant,
  "tools" | "models" | "skills" | "defaultModelId"
> {
  config: unknown;
  /** Labels only. Actual model availability comes from the configured allowlist. */
  modelDisplay?: Record<string, { label: string }>;
  /** Explicit host permission to show provider summaries or public thinking content; default none. Native/signature blocks are never displayed. */
  thinkingDisplay?: "summary" | "content";
  /** Optional user-facing copy keyed by configured tool name. Never put private instructions here. */
  toolDisplay?: Record<string, Pick<ChatTool, "label" | "description">>;
  /** Opt-in host allowlist of safe query/result summaries. Never return credentials or private prompts. */
  describeProcess?: (operation: {
    name: string;
    input?: JsonValue;
    output?: JsonValue;
  }) => { input?: string; output?: string } | undefined;
}
export interface ChatContext {
  /** Engine must already be scoped to the authenticated caller. Never derive identity from the request body. */
  engine: AgentEngine;
  assistants: ChatAssistantDefinition[];
  defaultAssistant?: string;
}
export interface ChatHandlerOptions {
  /** Enable authenticated image upload/read routes; Engine requires protocolKey. */
  images?: boolean;
  basePath?: string;
  namespace: string;
  allowedOrigins: string[] | (() => string[]);
  /** Called on every request, including reads. Throw ChatError('CHAT_UNAUTHENTICATED',401) on failure. */
  resolveContext: (request: IncomingMessage) => Promise<ChatContext>;
  /** Resolve an opaque reference after session authorization. Must durably reuse the first
   * resolution for (principal, sessionId, requestId), including retries without a reference.
   * Recheck authorization on reuse. Never return credentials or trust browser identity.
   * Called on all submissions when configured; absence preserves existing behavior. */
  resolveRunContext?: (input: {
    context: ChatContext;
    sessionId: string;
    requestId: string;
    contextRef?: string;
  }) => Promise<JsonObject>;
  allowCredentials?: boolean;
  allowedHeaders?: string[];
  /** Optional, trusted relative navigation; absent by default. This does not authorize the Debug route itself. */
  debugPath?: (sessionId: string) => string;
}
