import { it, expect } from "vitest";
import {
  createAgentEngine,
  type EngineOptions,
  type JsonObject,
  type JsonValue,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
const config = {
  models: {
    p: {
      provider: "fake",
      model: "fake",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "test" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "p" },
};
const setup = (
  model: ReturnType<typeof scriptedModel>,
  extra: Partial<EngineOptions> = {},
) =>
  createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "u" },
    secrets: { resolve: async () => "test" },
    adapters: { models: { fake: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
    ...extra,
  });
it("knowledge citation IDs are checked against returned sources and repair cannot retrieve again", async () => {
  const model = scriptedModel([
    toolCall("engine.knowledge.docs", { query: "question" }),
    finalText('{"answer":"A","citations":[{"sourceId":"forged"}]}'),
    (request) => {
      const observation = request.messages.find((m) => m.role === "tool")!;
      const id = JSON.parse(observation.content).items[0].sourceId;
      return finalText(
        JSON.stringify({ answer: "A", citations: [{ sourceId: id }] }),
      );
    },
  ]);
  let retrieved = 0;
  const e = await setup(model, {
    bindings: {
      search: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          retrieved++;
          return {
            items: [
              {
                documentId: "d",
                chunkId: "c",
                content: "Evidence",
                version: "1",
                title: "Title",
              },
            ],
          };
        },
      },
    },
  });
  const s = await e.createSession({
    config: {
      ...config,
      knowledgeBases: [
        {
          id: "docs",
          name: "Docs",
          description: "Search docs",
          retriever: { type: "binding", bindingKey: "search" },
          querySchema: { type: "object" },
          resultSchema: { type: "object" },
          citation: { required: true, outputPointer: "/citations" },
        },
      ],
    },
  });
  await expect(s.startRun({ input: "go" })).rejects.toMatchObject({
    code: "CONFIG_INVALID",
  });
  const r = await s.run({
    input: "go",
    output: {
      mode: "prompt-json",
      schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: { sourceId: { type: "string" } },
              required: ["sourceId"],
            },
          },
        },
        required: ["answer", "citations"],
      },
    },
  });
  expect(r.citations).toMatchObject([{ documentId: "d", title: "Title" }]);
  expect(retrieved).toBe(1);
  expect(model.requests.at(-1)!.tools).toEqual([]);
  await e.close();
});
it("automatic Memory read is persisted once, retry sees the same content, and CAS conflicts preserve newer content", async () => {
  let reads = 0,
    version = "v2",
    content = "newer";
  const model = scriptedModel([
    toolCall("engine.memory.write.prefs", {
      id: "pref",
      content: "older",
      expectedVersion: "v1",
      evidenceRefs: ["user-input"],
    }),
    finalText("conflict handled"),
  ]);
  const e = await setup(model, {
    bindings: {
      memory: {
        version: "1",
        sideEffect: "write",
        methods: { read: "read", write: "write" },
        namespace: "prefs.write",
        execute: async (input, ctx): Promise<JsonValue> => {
          const value = input as JsonObject;
          if (value.method === "read") {
            reads++;
            return {
              items: [
                { id: "pref", content, version, evidenceRefs: ["user-input"] },
              ],
            };
          }
          if (value.expectedVersion !== version)
            return { code: "MEMORY_VERSION_CONFLICT" };
          version = "v3";
          content = String(value.content);
          return { id: "pref", version, receiptRef: "receipt" };
        },
      },
      key: {
        version: "1",
        sideEffect: "read",
        execute: async () => "proposal-id",
      },
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  const s = await e.createSession({
    config: {
      ...config,
      memory: {
        stores: [
          {
            id: "prefs",
            adapter: { type: "binding", bindingKey: "memory" },
            namespace: { tenantId: "t", subjectId: "u", agentId: "a" },
            read: { strategy: "semantic", topK: 5, maxTokens: 1000 },
            write: {
              strategy: "model-proposed-policy-approved",
              idempotency: {
                namespace: "prefs.write",
                businessKey: { type: "binding", bindingKey: "key" },
              },
            },
          },
        ],
      },
      permissions: { policy: { type: "binding", bindingKey: "policy" } },
    },
  });
  await s.run({ input: "remember" });
  expect(reads).toBe(1);
  expect(content).toBe("newer");
  expect(
    model.requests[1]!.messages.some((m) =>
      m.content.includes("MEMORY_VERSION_CONFLICT"),
    ),
  ).toBe(true);
  await e.close();
});
it("structured form input is explicit and a plain textual question completes normally", async () => {
  const model = scriptedModel([finalText("Could you provide the date?")]);
  const e = await setup(model);
  const s = await e.createSession({ config });
  const r = await s.run({ input: "question" });
  expect((await s.getRun(r.runId)).state).toBe("completed");
  expect(model.requests[0]!.tools).toEqual([]);
  await e.close();
});
it("bounded compaction preserves original history and counts summary attempts", async () => {
  const model = scriptedModel([
    finalText("A".repeat(1000)),
    finalText("summary"),
    finalText("new answer"),
  ]);
  const e = await setup(model);
  const s = await e.createSession({
    config: {
      ...config,
      context: {
        maxInputTokens: 5000,
        compaction: {
          triggerAtRatio: 0.5,
          targetAtRatio: 0.4,
          maxCyclesPerRun: 2,
        },
      },
    },
  });
  await s.run({ input: "Q".repeat(700) });
  const result = await s.run({ input: "next" });
  expect(result.outputText).toBe("new answer");
  const stored = await e.options.store.transaction((tx) =>
    tx.get<import("@agent-runtime/sdk").SessionRecord>("sessions", s.id),
  );
  expect(
    stored!.history.some((message) => message.content === "Q".repeat(700)),
  ).toBe(true);
  expect(
    stored!.history.some((message) => message.content === "A".repeat(1000)),
  ).toBe(true);
  expect(
    stored!.history.some((message) =>
      message.content.startsWith("Historical summary"),
    ),
  ).toBe(false);
  expect(
    stored!.contextView?.some((message) =>
      message.content.startsWith("Historical summary"),
    ),
  ).toBe(true);
  expect(model.requests.map((r) => r.purpose)).toContain("compaction");
  expect((await e.usage.getRun(result.runId)).attemptCount).toBe(2);
  expect(
    (await s.listEvents()).events.some(
      (e) => e.type === "context.compaction.completed",
    ),
  ).toBe(true);
  await e.close();
});

it("compaction uses the declared summary model and bounded merge to reach the target", async () => {
  const model = scriptedModel([
    finalText("A".repeat(1000)),
    finalText("S".repeat(1500)),
    finalText("small summary"),
    finalText("answer"),
  ]);
  const engine = await setup(model);
  try {
    const primary = config.models.p;
    const session = await engine.createSession({
      config: {
        ...config,
        models: {
          ...config.models,
          summary: { ...primary, model: "summary-model" },
        },
        context: {
          maxInputTokens: 5000,
          compaction: {
            triggerAtRatio: 0.5,
            targetAtRatio: 0.4,
            maxCyclesPerRun: 2,
            summaryModel: "summary",
          },
        },
      },
    });
    await session.run({ input: "Q".repeat(700) });
    const result = await session.run({ input: "next" });
    expect(result.outputText).toBe("answer");
    const summaries = model.requests.filter(
      (request) => request.purpose === "compaction",
    );
    expect(summaries).toHaveLength(2);
    expect(
      summaries.every(
        (request) =>
          request.model.model === "summary-model" && request.tools.length === 0,
      ),
    ).toBe(true);
    expect((await engine.usage.getRun(result.runId)).attemptCount).toBe(3);
  } finally {
    await engine.close();
  }
});

it("automatic Memory reads honor approval and are not repeated by model transport retries", async () => {
  const { AgentEngineError } = await import("@agent-runtime/sdk");
  let reads = 0;
  const model = scriptedModel([
    [
      {
        type: "failed",
        error: new AgentEngineError("MODEL_TIMEOUT", "synthetic", true, "safe"),
      },
    ],
    finalText("done"),
  ]);
  const engine = await setup(model, {
    bindings: {
      memory: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          reads++;
          return {
            items: [
              {
                id: "pref",
                content: "synthetic preference",
                version: "v1",
                evidenceRefs: [],
              },
            ],
          };
        },
      },
      policy: { version: "1", sideEffect: "read", execute: async () => "ask" },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        permissions: { policy: { type: "binding", bindingKey: "policy" } },
        memory: {
          stores: [
            {
              id: "prefs",
              adapter: { type: "binding", bindingKey: "memory" },
              namespace: { tenantId: "t", subjectId: "u", agentId: "a" },
              read: { strategy: "semantic", topK: 5, maxTokens: 1000 },
            },
          ],
        },
      },
    });
    const handle = await session.startRun({ input: "go" });
    let pending;
    for (let i = 0; i < 200; i++) {
      pending = (await session.getRun(handle.runId)).pending;
      if (pending) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(pending?.kind).toBe("permission");
    expect(reads).toBe(0);
    expect(model.requests).toHaveLength(0);
    await session.resolveInput(pending!.id, {
      kind: "permission",
      decision: "allow_once",
    });
    expect((await handle.result).outputText).toBe("done");
    expect(reads).toBe(1);
    expect(model.requests).toHaveLength(2);
    const events = (await session.listEvents()).events;
    expect(
      events.filter((event) => event.type === "memory.read.started"),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.type === "memory.read.completed"),
    ).toHaveLength(1);
  } finally {
    await engine.close();
  }
});

it("explicit engineering thinning avoids a summary request and preserves the full receipt and history", async () => {
  const model = scriptedModel([
    toolCall("record.read", {}),
    finalText("one"),
    finalText("two"),
  ]);
  const engine = await setup(model, {
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({ text: "R".repeat(4000) }),
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        context: {
          maxInputTokens: 7000,
          toolResultMaxTokens: 512,
          compaction: { triggerAtRatio: 0.5, targetAtRatio: 0.4 },
        },
        tools: [
          {
            name: "record.read",
            description: "Synthetic large result",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            execution: {
              type: "binding",
              bindingKey: "read",
              sideEffect: "read",
            },
          },
        ],
      },
    });
    await session.run({ input: "read" });
    expect((await session.run({ input: "continue" })).outputText).toBe("two");
    expect(model.requests).toHaveLength(3);
    expect(
      model.requests.every((request) => request.purpose !== "compaction"),
    ).toBe(true);
    const trimmed = model.requests
      .at(-1)!
      .messages.find((message) => message.role === "tool")!;
    expect(JSON.parse(trimmed.content).contextTrimmed).toBe(true);
    expect(Buffer.byteLength(trimmed.content)).toBeLessThanOrEqual(512);
    const stored = await engine.options.store.transaction((tx) =>
      tx.get<import("@agent-runtime/sdk").SessionRecord>(
        "sessions",
        session.id,
      ),
    );
    expect(
      stored?.history.find((message) => message.role === "tool")?.content,
    ).toContain("R".repeat(4000));
    expect(
      (await session.listEvents()).events.some(
        (event) => event.type === "context.thinned",
      ),
    ).toBe(true);
  } finally {
    await engine.close();
  }
});
