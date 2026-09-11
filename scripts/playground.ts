import { randomBytes } from "node:crypto";
import { Client } from "pg";
import {
  createAgentEngine,
  PostgresStore,
  AgentEngineError,
} from "@agent-runtime/sdk";
import {
  loadLocalModels,
  LocalModelConfigError,
} from "./lib/local-model-config.js";
import {
  inventoryBinding,
  startPlayground,
} from "../examples/playground/server.js";

const defaultDatabase =
  "postgresql://postgres@127.0.0.1:55439/agent_engine_playground";
let engine: Awaited<ReturnType<typeof createAgentEngine>> | undefined;
let host: Awaited<ReturnType<typeof startPlayground>> | undefined;
let store: PostgresStore | undefined;
try {
  const local = await loadLocalModels();
  if (!process.env.AGENT_PLAYGROUND_DATABASE_URL) {
    // Only the dedicated default local database is created automatically.
    const admin = new Client({
      connectionString: defaultDatabase.replace(
        /agent_engine_playground$/,
        "postgres",
      ),
      connectionTimeoutMillis: 5000,
    });
    try {
      await admin.connect();
      const found = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = 'agent_engine_playground'",
      );
      if (!found.rowCount) {
        try {
          await admin.query("CREATE DATABASE agent_engine_playground");
        } catch (error) {
          if ((error as { code?: string }).code !== "42P04") throw error;
        }
      }
    } finally {
      await admin.end();
    }
  }
  store = PostgresStore.fromConnectionString(
    process.env.AGENT_PLAYGROUND_DATABASE_URL ?? defaultDatabase,
  );
  await store.migrate();
  const debugToken = randomBytes(32).toString("hex");
  const refs = new Map<
    string,
    Awaited<ReturnType<typeof loadLocalModels>>["profiles"][number]
  >();
  for (const profile of local.profiles) {
    refs.set(profile.model.apiKey.secretRef, profile);
    refs.set(profile.protocolKey.secretRef, profile);
  }
  engine = await createAgentEngine({
    store,
    principal: { tenantId: "local-playground", subjectId: "developer" },
    protocolKey: local.profiles[0]!.protocolKey,
    secrets: {
      resolve: async (ref) => {
        if (ref === "playground-debug") return debugToken;
        const profile = refs.get(ref);
        if (!profile) throw new LocalModelConfigError("LOCAL_SECRET_NOT_FOUND");
        return profile.secrets.resolve(ref);
      },
    },
    bindings: { "playground.inventory": inventoryBinding },
    limits: { maxConcurrentModelRequests: 2, maxAcceptedRuns: 8 },
    policy: {
      allowedOrigins: [
        ...new Set(local.profiles.map((p) => new URL(p.model.baseURL).origin)),
      ],
      allowPrivateOrigins: [
        ...new Set(
          local.profiles
            .filter((p) => p.allowPrivateNetwork)
            .map((p) => new URL(p.model.baseURL).origin),
        ),
      ],
      allowedModelTargets: local.profiles.map((p) => ({
        provider: p.model.provider,
        origin: new URL(p.model.baseURL).origin,
        credentialScopes: [p.model.apiKey.secretRef],
      })),
      allowedExecutorTypes: ["binding"],
      thinkingDisplayRetention: "none",
    },
  });
  const port = Number(process.env.AGENT_PLAYGROUND_PORT ?? 4318);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("INVALID_PORT");
  host = await startPlayground({
    engine,
    profiles: local.profiles,
    defaultProfile: local.defaultProfile,
    debugSecretRef: "playground-debug",
    port,
  });
  console.log(
    `本地测试：${host.url}\nDebug 调试：${host.url}/debug/\n按 Ctrl+C 停止。模型凭据仅在服务端读取；测试会话保存在独立数据库。`,
  );
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await host?.close();
    await engine?.close();
  };
  process.once("SIGINT", () => {
    void stop();
  });
  process.once("SIGTERM", () => {
    void stop();
  });
} catch (error) {
  const code =
    error instanceof LocalModelConfigError || error instanceof AgentEngineError
      ? error.code
      : "PLAYGROUND_START_FAILED";
  console.error(
    `${code}：请检查本地配置和端口；数据库容器可用 docker start agent-engine-test-pg 启动。`,
  );
  await host?.close();
  if (engine) await engine.close();
  else await store?.close();
  process.exitCode = 1;
}
