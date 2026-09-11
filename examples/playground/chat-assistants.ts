import { createHash } from "node:crypto";
import type { ModelConfig, ToolDefinition } from "@agent-runtime/sdk";
import type { ChatAssistantDefinition } from "@agent-runtime/chat-server";
export function makeChatAssistants(
  profiles: { profileName: string; model: ModelConfig }[],
  inventory: ToolDefinition,
): ChatAssistantDefinition[] {
  return profiles.flatMap((profile) =>
    [false, true].map((tool) => ({
      id: tool
        ? "tool-" +
          createHash("sha256")
            .update(profile.profileName)
            .digest("hex")
            .slice(0, 16)
        : profile.profileName,
      label: profile.profileName + (tool ? " · 库存工具" : ""),
      description: tool
        ? "查询 DEMO-1 / DEMO-2 合成库存"
        : "与已配置模型自由对话",
      config: {
        models: { primary: profile.model },
        routing: { primary: "primary" },
        instructions: {
          text: tool
            ? "使用中文回答。查询库存时必须调用 demo.inventory，以工具结果为准，说明是合成演示数据。"
            : "使用中文清楚、简洁地协助用户。",
        },
        tools: tool ? [inventory] : [],
        retry: { model: { maxRetries: 0 } },
        loop: {
          maxSteps: 6,
          maxModelAttempts: 6,
          maxCapabilityInvocations: 8,
          timeoutMs: 90000,
        },
        budgets: { perRun: { maxTotalTokens: 32000 } },
      },
    })),
  );
}
