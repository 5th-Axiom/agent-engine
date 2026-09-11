import { defineSessionConfig } from "@agent-runtime/sdk";

// 仅在服务端调用。真实值由 .env、部署环境或你的 Secret 服务提供。
export function readSettings(env = process.env) {
  function required(name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new Error("Missing server setting: " + name);
    return value;
  }
  const baseURL = required("MODEL_BASE_URL");
  const credentials: Record<string, string> = {
    MODEL_API_KEY: required("MODEL_API_KEY"),
    PROTOCOL_KEY: required("PROTOCOL_KEY"),
  };
  return {
    databaseURL: required("DATABASE_URL"),
    modelOrigin: new URL(baseURL).origin,
    allowPrivateModelOrigin: env.MODEL_ALLOW_PRIVATE_ORIGIN === "true",
    secrets: {
      async resolve(ref: string) {
        const value = credentials[ref];
        if (!value) throw new Error("Unknown secret reference: " + ref);
        return value;
      },
    },
    config: defineSessionConfig({
      models: {
        primary: {
          provider: "openai-compatible",
          baseURL,
          apiKey: { secretRef: "MODEL_API_KEY" },
          model: required("MODEL_NAME"),
          // 示例值，按供应商的模型能力填写。
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
        },
      },
      routing: { primary: "primary" },
      instructions: {
        text: "你是产品助手。用简明中文回答，不确定时明确说明。",
      },
    }),
  };
}
