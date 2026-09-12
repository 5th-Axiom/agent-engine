import { afterEach, expect, it } from "vitest";
import {
  createAgentEngine,
  AgentEngineError,
  type ModelStreamEvent,
  type SessionConfigInput,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import { ProcessJournal } from "../../packages/chat-server/src/process.js";
import { readChatSession } from "../../packages/chat-server/src/projection.js";
import { sessionSchema } from "@agent-runtime/chat-core";
import type { ChatAssistantDefinition } from "@agent-runtime/chat-server";

const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
const config: SessionConfigInput = {
  models: {
    main: {
      provider: "scripted",
      model: "test",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "hidden-credential" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
    },
  },
  routing: { primary: "main" },
  metadata: { agentChat: { namespace: "process", assistantId: "docs" } },
  skills: [
    {
      id: "guide",
      name: "接入指导",
      description: "Guide",
      instructions: "PRIVATE_SKILL_INSTRUCTION",
      allowedTools: ["docs.search"],
    },
  ],
  tools: [
    {
      name: "docs.search",
      description: "PRIVATE_TOOL_INSTRUCTION",
      inputSchema: { type: "object" },
      outputSchema: true,
      execution: { type: "binding", bindingKey: "search", sideEffect: "read" },
    },
  ],
};
const projectedAssistant = (
  configuration: unknown,
): ChatAssistantDefinition => ({
  id: "docs",
  label: "文档助手",
  config: configuration,
  toolDisplay: { "docs.search": { label: "搜索文档" } },
});
async function fixture(
  events: ModelStreamEvent[][],
  changes: Partial<SessionConfigInput> = {},
) {
  let permitted = true;
  const model = scriptedModel(events);
  const store = new MemoryStore();
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: "t", subjectId: "u" },
    authorize: async () => permitted,
    secrets: { resolve: async () => "PRIVATE_SECRET_VALUE" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      search: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({
          title: "会话指南",
          private: "PRIVATE_RESULT_VALUE",
        }),
      },
    },
  });
  closes.push(() => engine.close());
  const settings = { ...config, ...changes };
  const session = await engine.createSession({ config: settings });
  const assistant = projectedAssistant(settings);
  return {
    engine,
    session,
    store,
    assistant,
    revoke: () => {
      permitted = false;
    },
    context: { engine, assistants: [assistant] },
  };
}
it("projects ordered real skill/model/tool facts, intermediate messages and explicit safe details without private payloads", async () => {
  const f = await fixture([
    toolCall("engine.skill.select", { id: "guide" }),
    [
      { type: "activity", kind: "thinking" },
      { type: "activity", kind: "thinking" },
      {
        type: "delta",
        kind: "thinking",
        blockId: "private",
        text: "PRIVATE_REASONING",
      },
      {
        type: "delta",
        kind: "text",
        blockId: "public",
        text: "我先查看会话指南。",
      },
      ...toolCall(
        "docs.search",
        { query: "会话", internal: "PRIVATE_ARGUMENT" },
        "search-call",
      ),
    ],
    finalText("用 loadSession 继续会话。"),
  ]);
  await f.session.run({ input: "如何续聊" });
  const journal = new ProcessJournal();
  const first = sessionSchema.parse(
    await readChatSession(
      f.context,
      "process",
      f.session.id,
      undefined,
      journal,
    ),
  );
  const entries = first.runs[0]!.process!.entries;
  expect(
    entries.some(
      (e) => e.label === "加载技能 · 接入指导" && e.state === "completed",
    ),
  ).toBe(true);
  expect(entries.filter((e) => e.kind === "thinking")).toHaveLength(1);
  expect(entries.find((e) => e.kind === "message")?.output).toBe(
    "我先查看会话指南。",
  );
  expect(entries.findIndex((e) => e.kind === "thinking")).toBeLessThan(
    entries.findIndex((e) => e.label === "搜索文档"),
  );
  expect(
    entries.every(
      (entry, i) => !i || entry.sequence >= entries[i - 1]!.sequence,
    ),
  ).toBe(true);
  expect(JSON.stringify(first)).not.toContain("PRIVATE_");
  f.assistant.describeProcess = ({ input, output }) => ({
    input: String((input as any).query),
    output: String((output as any).title),
  });
  const second = await readChatSession(
    f.context,
    "process",
    f.session.id,
    undefined,
    journal,
  );
  expect(
    second.runs[0]!.process!.entries.find((e) => e.label === "搜索文档"),
  ).toMatchObject({ input: "会话", output: "会话指南" });
  expect(JSON.stringify(second)).not.toContain("PRIVATE_");
  const reloaded = await readChatSession(f.context, "process", f.session.id);
  expect(reloaded.runs[0]!.process).toEqual(second.runs[0]!.process);
  f.revoke();
  await expect(
    readChatSession(f.context, "process", f.session.id, undefined, journal),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("discards failed attempt text, retains retry facts and keeps final answer separate", async () => {
  const f = await fixture([
    [
      { type: "delta", kind: "text", blockId: "a", text: "DISCARDED_DRAFT" },
      {
        type: "failed",
        error: new AgentEngineError(
          "MODEL_RATE_LIMITED",
          "limited",
          true,
          "safe",
        ),
      },
    ],
    [
      { type: "delta", kind: "text", blockId: "b", text: "最终回答" },
      ...finalText("最终回答"),
    ],
  ]);
  await f.session.run({ input: "hello" });
  const data = await readChatSession(f.context, "process", f.session.id);
  expect(data.runs[0]!.process!.entries.some((e) => e.kind === "retry")).toBe(
    true,
  );
  expect(
    data.runs[0]!.process!.entries.filter((e) => e.kind === "message"),
  ).toHaveLength(0);
  expect(JSON.stringify(data)).not.toContain("DISCARDED_DRAFT");
  expect(data.runs[0]!.output).toBe("最终回答");
});
it("shows pending questions and cancellation as execution states", async () => {
  const f = await fixture(
    [toolCall("engine.question", { question: "需要接入哪个环境？" })],
    {
      interaction: {
        questions: {
          enabled: true,
          answerSchema: { type: "string" },
          timeoutMs: 60000,
        },
      },
    },
  );
  const handle = await f.session.startRun({ input: "帮我接入" });
  const result = handle.result.catch(() => undefined);
  await expect
    .poll(
      async () => (await f.engine.readRun(f.session.id, handle.runId)).state,
    )
    .toBe("awaiting_input");
  const pending = await readChatSession(f.context, "process", f.session.id);
  expect(pending.runs[0]!.process!.pending).toMatchObject({
    kind: "question",
    question: "需要接入哪个环境？",
  });
  await f.engine.cancel(f.session.id, handle.runId);
  await result;
  const cancelled = await readChatSession(f.context, "process", f.session.id);
  expect(cancelled.runs[0]!.process!.pending).toBeUndefined();
  expect(
    cancelled.runs[0]!.process!.entries.some((e) => e.state === "cancelled"),
  ).toBe(true);
});
it("does not confuse reused provider call IDs across turns and degrades honestly after event expiry", async () => {
  const f = await fixture([
    toolCall("docs.search", { query: "first" }, "reused"),
    finalText("one"),
    toolCall("docs.search", { query: "second" }, "reused"),
    finalText("two"),
  ]);
  f.assistant.describeProcess = ({ input }) => ({
    input: String((input as any).query),
  });
  await f.session.run({ input: "first" });
  await f.session.run({ input: "second" });
  const data = await readChatSession(f.context, "process", f.session.id);
  expect(
    data.runs.map(
      (run) => run.process?.entries.find((e) => e.kind === "tool")?.input,
    ),
  ).toEqual(["first", "second"]);
  await f.store.transaction((tx) =>
    tx.pruneEvents(f.session.id, data.snapshotSequence),
  );
  const expired = await readChatSession(f.context, "process", f.session.id);
  expect(expired.runs.every((run) => run.process?.complete === false)).toBe(
    true,
  );
  expect(expired.runs.map((run) => run.output)).toEqual(["one", "two"]);
});

it("requires explicit model and host opt-in for public thinking, separates summaries and revokes cached display", async () => {
  const f = await fixture(
    [
      [
        {
          type: "delta",
          kind: "thinking",
          blockId: "public",
          thinkingFormat: "content",
          text: "合成可展示分析：先检查配置，再确认工具。",
        },
        ...finalText("最终结论"),
      ],
    ],
    {
      models: {
        main: {
          ...config.models.main!,
          thinking: { enabled: false, expose: "content" },
        },
      },
    },
  );
  await f.session.run({ input: "test" });
  const journal = new ProcessJournal();
  const read = () =>
    readChatSession(f.context, "process", f.session.id, undefined, journal);
  expect(JSON.stringify(await read())).not.toContain("合成可展示分析");
  f.assistant.thinkingDisplay = "summary";
  expect(JSON.stringify(await read())).not.toContain("合成可展示分析");
  f.assistant.thinkingDisplay = "content";
  const enabled = await read();
  expect(
    enabled.runs[0]!.process!.entries.find((e) => e.kind === "thinking"),
  ).toMatchObject({
    label: "思考过程",
    output: "合成可展示分析：先检查配置，再确认工具。",
    state: "completed",
  });
  expect(enabled.runs[0]!.output).toBe("最终结论");
  f.assistant.thinkingDisplay = undefined;
  expect(JSON.stringify(await read())).not.toContain("合成可展示分析");
  f.assistant.thinkingDisplay = "content";
  f.revoke();
  await expect(read()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});

it("does not upgrade summary-only model policy to content and removes thinking from failed attempts", async () => {
  const summary = await fixture(
    [
      [
        {
          type: "delta",
          kind: "thinking",
          blockId: "content",
          thinkingFormat: "content",
          text: "MUST_NOT_EXPOSE_CONTENT",
        },
        {
          type: "delta",
          kind: "thinking",
          blockId: "summary",
          text: "供应商提供的合成摘要",
        },
        ...finalText("结论"),
      ],
    ],
    {
      models: {
        main: {
          ...config.models.main!,
          thinking: { enabled: false, expose: "summary" },
        },
      },
    },
  );
  summary.assistant.thinkingDisplay = "content";
  await summary.session.run({ input: "test" });
  const view = await readChatSession(
    summary.context,
    "process",
    summary.session.id,
  );
  expect(JSON.stringify(view)).not.toContain("MUST_NOT_EXPOSE_CONTENT");
  expect(
    view.runs[0]!.process!.entries.find(
      (e) => e.output === "供应商提供的合成摘要",
    )?.label,
  ).toBe("思考摘要");

  const retry = await fixture(
    [
      [
        {
          type: "delta",
          kind: "thinking",
          blockId: "a",
          thinkingFormat: "content",
          text: "DISCARDED_THINKING",
        },
        {
          type: "failed",
          error: new AgentEngineError(
            "MODEL_RATE_LIMITED",
            "limited",
            true,
            "safe",
          ),
        },
      ],
      [
        {
          type: "delta",
          kind: "thinking",
          blockId: "b",
          thinkingFormat: "content",
          text: "重试后的可展示内容",
        },
        ...finalText("成功"),
      ],
    ],
    {
      models: {
        main: {
          ...config.models.main!,
          thinking: { enabled: false, expose: "content" },
        },
      },
    },
  );
  retry.assistant.thinkingDisplay = "content";
  await retry.session.run({ input: "test" });
  const result = await readChatSession(
    retry.context,
    "process",
    retry.session.id,
  );
  expect(JSON.stringify(result)).not.toContain("DISCARDED_THINKING");
  expect(JSON.stringify(result)).toContain("重试后的可展示内容");
});
