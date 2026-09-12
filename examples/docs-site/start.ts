import { closeResources } from "../../scripts/lib/close-resources.js";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  createAgentEngine,
  PostgresStore,
  AgentEngineError,
  parseConfig,
} from "@agent-runtime/sdk";
import {
  loadLocalModel,
  loadLocalModels,
  LocalModelConfigError,
} from "../../scripts/lib/local-model-config.js";
import { loadArticles } from "./content.js";
import { docsAssistant, docsBinding, startDocsSite } from "./server.js";
import {
  createKnowledge,
  loadProjectSnapshot,
  knowledgeTools,
} from "./knowledge.js";

const defaultDatabase =
  "postgresql://postgres@127.0.0.1:55439/agent_engine_docs";
const readOnly = process.argv.includes("--read-only");
let engine: Awaited<ReturnType<typeof createAgentEngine>> | undefined;
let store: PostgresStore | undefined;
let host: Awaited<ReturnType<typeof startDocsSite>> | undefined;
try {
  const port = Number(process.env.AGENT_DOCS_PORT ?? 4320);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT_INVALID");
  const articles = await loadArticles();
  const knowledge = createKnowledge(articles, await loadProjectSnapshot());
  let cookieSecret: string | Buffer = randomBytes(32),
    assistant;
  if (!readOnly) {
    const local = await loadLocalModel(
      process.env.AGENT_DOCS_MODEL_PROFILE,
      fileURLToPath(new URL("../../", import.meta.url)),
    );
    const configured = await loadLocalModels(
      fileURLToPath(new URL("../../", import.meta.url)),
    );
    const profiles = configured.profiles;
    const secretRefs = new Set(
      profiles.map((profile) => profile.model.apiKey.secretRef),
    );
    secretRefs.add(local.protocolKey.secretRef);
    if (!process.env.AGENT_DOCS_DATABASE_URL) {
      const admin = new Client({
        connectionString: defaultDatabase.replace(
          /agent_engine_docs$/,
          "postgres",
        ),
        connectionTimeoutMillis: 5000,
      });
      try {
        await admin.connect();
        const found = await admin.query(
          "SELECT 1 FROM pg_database WHERE datname='agent_engine_docs'",
        );
        if (!found.rowCount) {
          try {
            await admin.query("CREATE DATABASE agent_engine_docs");
          } catch (error) {
            if ((error as { code?: string }).code !== "42P04") throw error;
          }
        }
      } finally {
        await admin.end();
      }
    }
    const databaseUrl = process.env.AGENT_DOCS_DATABASE_URL ?? defaultDatabase;
    if (
      ["/agent_engine_playground", "/agent_engine_test"].includes(
        new URL(databaseUrl).pathname,
      )
    )
      throw new Error("DOCS_DATABASE_MUST_BE_SEPARATE");
    store = PostgresStore.fromConnectionString(databaseUrl);
    await store.migrate();
    cookieSecret = createHmac(
      "sha256",
      await local.secrets.resolve(local.protocolKey.secretRef),
    )
      .update("agent-engine-docs-cookie-key-v1")
      .digest();
    engine = await createAgentEngine({
      store,
      principal: { tenantId: "docs-site", subjectId: "docs-host" },
      protocolKey: local.protocolKey,
      secrets: {
        resolve: async (ref) => {
          const profile = profiles.find(
            (profile) =>
              profile.model.apiKey.secretRef === ref ||
              profile.protocolKey.secretRef === ref,
          );
          if (!profile)
            throw new LocalModelConfigError("LOCAL_SECRET_NOT_FOUND");
          return profile.secrets.resolve(ref);
        },
      },
      authorize: async ({ principal, sideEffect, action, resource }) => {
        if (
          principal.tenantId !== "docs-site" ||
          (sideEffect === "write" &&
            !(action === "data" && resource === "image:upload")) ||
          action === "resolve"
        )
          return false;
        if (action === "secret") return secretRefs.has(resource);
        if (action === "model")
          return profiles.some((profile) => resource === profile.model.baseURL);
        if (action === "capability")
          return [
            "docs.search",
            "docs.search.v1",
            ...knowledgeTools.flatMap((t) => [t.name, t.name + ".v1"]),
          ].includes(resource);
        return true;
      },
      bindings: {
        "docs.search.v1": docsBinding(articles),
        ...knowledge.bindings,
      },
      limits: { maxConcurrentModelRequests: 2, maxAcceptedRuns: 8 },
      policy: {
        allowedOrigins: [
          ...new Set(
            profiles.map((profile) => new URL(profile.model.baseURL).origin),
          ),
        ],
        allowPrivateOrigins: [
          ...new Set(
            profiles
              .filter((profile) => profile.allowPrivateNetwork)
              .map((profile) => new URL(profile.model.baseURL).origin),
          ),
        ],
        allowedModelTargets: profiles.map((profile) => ({
          provider: profile.model.provider,
          origin: new URL(profile.model.baseURL).origin,
          credentialScopes: [profile.model.apiKey.secretRef],
        })),
        allowedExecutorTypes: ["binding"],
        thinkingDisplayRetention: "session",
      },
    });
    const output = Number(process.env.AGENT_DOCS_MAX_OUTPUT_TOKENS ?? 1536);
    if (
      !Number.isInteger(output) ||
      output < 256 ||
      output > 4096 ||
      output >= local.model.limits.contextWindowTokens
    )
      throw new Error("OUTPUT_LIMIT_INVALID");
    assistant = docsAssistant(
      {
        ...local.model,
        limits: { ...local.model.limits, maxOutputTokens: output },
      },
      knowledge,
    );
    const assistantConfig = parseConfig(assistant.config);
    assistant.thinkingDisplay = "content";
    assistant.modelDisplay = { primary: { label: local.profileName } };
    for (const profile of profiles) {
      if (profile.profileName === local.profileName) continue;
      assistantConfig.models[profile.profileName] = {
        ...profile.model,
        limits: {
          ...profile.model.limits,
          maxOutputTokens: Math.min(
            output,
            profile.model.limits.maxOutputTokens,
          ),
        },
      };
      assistant.modelDisplay[profile.profileName] = {
        label: profile.profileName,
      };
    }
    for (const model of Object.values(assistantConfig.models)) {
      model.thinking = {
        ...model.thinking,
        enabled: model.thinking?.enabled ?? false,
        expose: "content",
      };
    }
    assistantConfig.metadata = {
      ...assistantConfig.metadata,
      docsAssistantVersion:
        "reply-v2:" +
        String(assistantConfig.metadata?.docsAssistantVersion) +
        ":" +
        createHash("sha256")
          .update(JSON.stringify(assistantConfig.models))
          .digest("hex")
          .slice(0, 16),
    };
    assistant.config = assistantConfig;
  }
  host = await startDocsSite({
    articles,
    knowledge,
    engine,
    assistant,
    cookieSecret,
    port,
  });
  console.log(
    `文档站：${host.url}\n${readOnly ? "仅阅读模式：搜索可用，助手未连接。" : "文档助手已接入，发消息时调用真实模型。"}\n按 Ctrl+C 停止本站。`,
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await closeResources(host, engine ?? store);
  };
  process.once("SIGINT", () => {
    void close().catch(() => {
      console.error("DOCS_CLOSE_FAILED");
      process.exitCode = 1;
    });
  });
  process.once("SIGTERM", () => {
    void close().catch(() => {
      console.error("DOCS_CLOSE_FAILED");
      process.exitCode = 1;
    });
  });
} catch (error) {
  const code =
    error instanceof LocalModelConfigError || error instanceof AgentEngineError
      ? error.code
      : "DOCS_START_FAILED";
  console.error(
    `${code}：请检查模型配置、独立数据库和端口。仅阅读可使用：pnpm exec tsx examples/docs-site/start.ts --read-only`,
  );
  await closeResources(host, engine ?? store).catch(() => {});
  process.exitCode = 1;
}
