import type { IncomingMessage } from "node:http";
import type {
  AgentEngine,
  SessionAgentConfig,
  VerifiedPrincipal,
} from "@agent-runtime/sdk";
import { createChatHandler, ChatError } from "@agent-runtime/chat-server";

// verifyLogin 是接入方的业务函数，不是 SDK 导出的方法。
export function connectChat(options: {
  engine: AgentEngine;
  config: SessionAgentConfig;
  frontendOrigin: string;
  verifyLogin: (req: IncomingMessage) => Promise<VerifiedPrincipal | null>;
}) {
  return createChatHandler({
    basePath: "/api/agent-chat",
    namespace: "my-product",
    allowedOrigins: [options.frontendOrigin],
    resolveContext: async (req) => {
      const principal = await options.verifyLogin(req);
      if (!principal) throw new ChatError("CHAT_UNAUTHENTICATED", 401);
      return {
        engine: options.engine.forPrincipal(principal),
        // 本例中的产品助手对所有已获授权用户可用。
        assistants: [
          {
            id: "support",
            label: "产品助手",
            description: "介绍产品功能和使用方法",
            config: options.config,
          },
        ],
        defaultAssistant: "support",
      };
    },
  });
}
