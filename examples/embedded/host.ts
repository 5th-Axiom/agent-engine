import type { IncomingMessage } from "node:http";
import type { AgentEngine } from "@agent-runtime/sdk";
import {
  createChatHandler,
  ChatError,
  type ChatAssistantDefinition,
} from "@agent-runtime/chat-server";

type Principal = Parameters<AgentEngine["forPrincipal"]>[0];

/** Integrate this handler before the host's existing 404 route. No authentication is invented here. */
export function createHostChat(options: {
  engine: AgentEngine;
  origin: string;
  namespace: string;
  verifyLogin: (request: IncomingMessage) => Promise<Principal | null>;
  assistantsFor: (principal: Principal) => Promise<ChatAssistantDefinition[]>;
}) {
  return createChatHandler({
    namespace: options.namespace,
    allowedOrigins: [options.origin],
    resolveContext: async (request) => {
      const principal = await options.verifyLogin(request);
      if (!principal) throw new ChatError("CHAT_UNAUTHENTICATED", 401);
      return {
        engine: options.engine.forPrincipal(principal),
        assistants: await options.assistantsFor(principal),
      };
    },
  });
}
