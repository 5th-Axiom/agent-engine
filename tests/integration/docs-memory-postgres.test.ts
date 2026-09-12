import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { it, expect } from "vitest";
import { createAgentEngine, PostgresStore } from "@agent-runtime/sdk";
import { scriptedModel, toolCall, finalText } from "@agent-runtime/testing";
import { createDocsCapabilities } from "../../examples/docs-site/capabilities.js";
import { loadArticles } from "../../examples/docs-site/content.js";
it("docs memory approval survives PostgreSQL Engine restart and approved memory is recalled across sessions", async () => {
  const testUrl = new URL(
      process.env.AGENT_TEST_DATABASE_URL ??
        "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
    ),
    name = "docs_cap_" + randomUUID().replaceAll("-", "");
  testUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: testUrl.toString() });
  await admin.connect();
  await admin.query('CREATE DATABASE "' + name + '"');
  testUrl.pathname = "/" + name;
  const articles = await loadArticles(),
    key = randomBytes(32),
    principal = { tenantId: "docs-site", subjectId: randomUUID() };
  let engine: Awaited<ReturnType<typeof createAgentEngine>> | undefined;
  const boot = async (model: ReturnType<typeof scriptedModel>) => {
    const store = PostgresStore.fromConnectionString(testUrl.toString());
    await store.migrate();
    const caps = createDocsCapabilities({ articles, store, memoryKey: key });
    engine = await createAgentEngine({
      store,
      principal,
      secrets: { resolve: async () => "synthetic" },
      bindings: caps.bindings,
      adapters: { models: { fake: model } },
      policy: { allowedOrigins: ["https://model.example.com"] },
    });
    return { caps, engine };
  };
  try {
    const first = await boot(
      scriptedModel([
        toolCall("engine.memory.write.preferences", {
          id: "preference",
          content: "合成偏好：回答包含验证步骤",
          expectedVersion: null,
          evidenceRefs: ["user-request"],
        }),
      ]),
    );
    const assistant = first.caps.assistant(
      {
        id: "docs",
        label: "文档助手",
        config: {
          models: {
            p: {
              provider: "fake",
              model: "fake",
              baseURL: "https://model.example.com",
              apiKey: { secretRef: "test" },
              limits: { contextWindowTokens: 64000, maxOutputTokens: 1000 },
            },
          },
          routing: { primary: "p" },
        },
      },
      principal,
    );
    const s = await first.engine.createSession({ config: assistant.config }),
      h = await s.startRun({ input: "记住偏好" });
    h.result.catch(() => {});
    await expect
      .poll(async () => (await s.getRun(h.runId)).state)
      .toBe("awaiting_input");
    const pending = (await s.getRun(h.runId)).pending!;
    expect(await first.caps.list(principal)).toHaveLength(0);
    await first.engine.close();
    engine = undefined;
    const model = scriptedModel([
        finalText("记忆已保存"),
        finalText("读取已有偏好"),
      ]),
      second = await boot(model),
      restored = await second.engine.loadSession(s.id);
    await restored.resolveInput(pending.id, {
      kind: "permission",
      decision: "allow_once",
    });
    await expect
      .poll(async () => (await restored.getRun(h.runId)).state)
      .toBe("completed");
    expect(await second.caps.list(principal)).toHaveLength(1);
    const next = await second.engine.createSession({
      config: assistant.config,
    });
    await next.run({ input: "回忆偏好" });
    expect(JSON.stringify(model.requests.at(-1)!.messages)).toContain(
      "回答包含验证步骤",
    );
    expect(
      JSON.stringify(
        await second.engine.options.store.transaction((tx) =>
          tx.list("docs_memory_v1"),
        ),
      ),
    ).not.toContain("回答包含验证步骤");
  } finally {
    await engine?.close();
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
