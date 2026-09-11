import {
  createAgentEngine,
  PostgresStore,
  type EngineOptions,
} from "@agent-runtime/sdk";
import { readSettings } from "./settings.js";

export async function createBackend(
  options: Pick<EngineOptions, "principal" | "authorize" | "bindings">,
) {
  const settings = readSettings();
  const store = PostgresStore.fromConnectionString(settings.databaseURL);
  try {
    // 仅在服务启动阶段执行；此时不能有其他 Engine 占用这个数据库。
    await store.migrate();
    const engine = await createAgentEngine({
      store,
      principal: options.principal,
      authorize: options.authorize,
      bindings: options.bindings,
      secrets: settings.secrets,
      protocolKey: { secretRef: "PROTOCOL_KEY" },
      policy: {
        allowedOrigins: [settings.modelOrigin],
        allowPrivateOrigins: settings.allowPrivateModelOrigin
          ? [settings.modelOrigin]
          : [],
        allowedModelTargets: [
          {
            provider: "openai-compatible",
            origin: settings.modelOrigin,
            credentialScopes: ["MODEL_API_KEY"],
          },
        ],
        allowedExecutorTypes: ["binding"],
      },
    });
    return { engine, config: settings.config };
  } catch (error) {
    await store.close();
    throw error;
  }
}
