import type { IncomingMessage } from "node:http";
import type { AgentEngine } from "@agent-runtime/sdk";
import type { ChatAssistant, ChatTool } from "@agent-runtime/chat-core";
export interface ChatAssistantDefinition extends Omit<ChatAssistant, "tools"> {
  config: unknown;
  /** Optional user-facing copy keyed by configured tool name. Never put private instructions here. */
  toolDisplay?: Record<string, Pick<ChatTool, "label" | "description">>;
}
export interface ChatContext {
  /** Engine must already be scoped to the authenticated caller. Never derive identity from the request body. */
  engine: AgentEngine;
  assistants: ChatAssistantDefinition[];
  defaultAssistant?: string;
}
export interface ChatHandlerOptions {
  basePath?: string;
  namespace: string;
  allowedOrigins: string[] | (() => string[]);
  /** Called on every request, including reads. Throw ChatError('CHAT_UNAUTHENTICATED',401) on failure. */
  resolveContext: (request: IncomingMessage) => Promise<ChatContext>;
  allowCredentials?: boolean;
  allowedHeaders?: string[];
  /** Optional, trusted relative navigation; absent by default. This does not authorize the Debug route itself. */
  debugPath?: (sessionId: string) => string;
}
