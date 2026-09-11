// Executable, synthetic examples. PostgreSQL is real; model/tool effects are deterministic fixtures.
import {
  createAgentEngine,
  PostgresStore,
  defineTool,
  defineSkill,
  defineKnowledgeBase,
  prometheusExporter,
  type EngineOptions,
  type JsonValue,
  type JsonObject,
} from "@agent-runtime/sdk";
import { scriptedModel, finalText, toolCall } from "@agent-runtime/testing";
import { randomUUID } from "node:crypto";
const scenario = process.argv[2] ?? "basic";
const store = PostgresStore.fromConnectionString(
  process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
);
await store.migrate();
const base = {
  models: {
    primary: {
      provider: "scripted",
      model: "synthetic-model",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "SYNTHETIC_KEY" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "primary" },
};
const principal = { tenantId: randomUUID(), subjectId: "example-user" };
const readTool = defineTool({
  name: "inventory.read",
  description: "Read synthetic inventory",
  inputSchema: {
    type: "object",
    properties: { sku: { type: "string" } },
    required: ["sku"],
  },
  outputSchema: { type: "object" },
  execution: {
    type: "binding",
    bindingKey: "inventory.read.v1",
    sideEffect: "read",
  },
});
const skill = defineSkill({
  id: "inventory-review",
  name: "Inventory review",
  description: "Review stock availability",
  instructions:
    "Query inventory and explain the returned data. State uncertainty when data is unavailable.",
  allowedTools: ["inventory.read"],
});
const scripts: Record<string, Parameters<typeof scriptedModel>[0]> = {
  basic: [
    [
      {
        type: "usage",
        usage: {
          input: 12,
          uncachedInput: 10,
          cacheReadInput: 2,
          cacheWriteInput: 0,
          output: 3,
          reasoning: 1,
        },
        mode: "snapshot",
        final: true,
      },
      ...finalText("Synthetic first answer"),
    ],
    finalText("Synthetic follow-up"),
  ],
  tool: [
    toolCall("inventory.read", { sku: "DEMO" }),
    finalText("Synthetic inventory: 24 units"),
  ],
  skill: [
    toolCall("engine.skill.select", { id: skill.id }),
    toolCall("inventory.read", { sku: "DEMO" }),
    toolCall("engine.skill.exit", {}),
    finalText("Synthetic inventory review complete"),
  ],
  knowledge: [
    toolCall("engine.knowledge.manual", { query: "retention" }),
    (request) => {
      const observation = request.messages.find((m) => m.role === "tool")!;
      const sourceId = JSON.parse(observation.content).items[0].sourceId;
      return finalText(
        JSON.stringify({
          answer: "Synthetic policy: 30 days",
          citations: [{ sourceId }],
        }),
      );
    },
  ],
  memory: [
    toolCall("engine.memory.write.preferences", {
      id: "language",
      content: "Chinese",
      expectedVersion: null,
      evidenceRefs: ["current-input"],
    }),
    finalText("Synthetic preference saved"),
  ],
  monitoring: [
    toolCall("inventory.read", { sku: "DEMO" }),
    finalText(
      "Synthetic monitoring check: data available; no notification needed",
    ),
  ],
};
if (!scripts[scenario])
  throw Error("Choose basic, tool, skill, knowledge, memory, or monitoring");
let memoryVersion: string | null = null;
const bindings: NonNullable<EngineOptions["bindings"]> = {
  "inventory.read.v1": {
    version: "1",
    sideEffect: "read",
    execute: async () => ({ available: 24 }),
  },
  "manual.search.v1": {
    version: "1",
    sideEffect: "read",
    execute: async () => ({
      items: [
        {
          documentId: "manual",
          chunkId: "retention",
          version: "1",
          content: "Synthetic data is retained for 30 days.",
          title: "Synthetic manual",
        },
      ],
    }),
  },
  "memory.v1": {
    version: "1",
    sideEffect: "write",
    methods: { read: "read", write: "write" },
    namespace: "example.preferences",
    execute: async (value): Promise<JsonValue> => {
      const input = value as JsonObject;
      if (input.method === "read") return { items: [] };
      if (input.expectedVersion !== memoryVersion)
        return { code: "MEMORY_VERSION_CONFLICT" };
      memoryVersion = "1";
      return {
        id: String(input.id),
        version: memoryVersion,
        receiptRef: "synthetic-memory-receipt",
      };
    },
  },
  "proposal-key.v1": {
    version: "1",
    sideEffect: "read",
    execute: async (value) =>
      String(((value as JsonObject).context as JsonObject).proposalId),
  },
  "permission.v1": {
    version: "1",
    sideEffect: "read",
    execute: async () => "allow",
  },
};
const metrics = prometheusExporter();
const engine = await createAgentEngine({
  store,
  principal,
  secrets: { resolve: async () => "synthetic-only" },
  adapters: { models: { scripted: scriptedModel(scripts[scenario]) } },
  bindings,
  policy: { allowedOrigins: ["https://model.example.com"] },
  defaults: { retry: { model: { maxRetries: 1 } } },
  telemetry: { metrics, health: (healthy) => metrics.health(healthy) },
});
try {
  const session = await engine.createSession({
    config: {
      ...base,
      ...(scenario === "basic"
        ? {
            models: {
              primary: {
                ...base.models.primary,
                pricing: {
                  currency: "USD",
                  version: "synthetic-rates",
                  uncachedInputPerMillion: 2,
                  cacheReadInputPerMillion: 0.5,
                  cacheWriteInputPerMillion: 2,
                  outputPerMillion: 4,
                },
              },
            },
            budgets: {
              perRun: {
                maxTotalTokens: 10000,
                maxEstimatedCost: { amount: 0.1, currency: "USD" },
              },
              warningAt: 0.8,
            },
          }
        : {}),
      ...(["tool", "skill", "monitoring"].includes(scenario)
        ? { tools: [readTool] }
        : {}),
      ...(scenario === "skill" ? { skills: [skill] } : {}),
      ...(scenario === "knowledge"
        ? {
            knowledgeBases: [
              defineKnowledgeBase({
                id: "manual",
                name: "Manual",
                description: "Search synthetic manual",
                retriever: { type: "binding", bindingKey: "manual.search.v1" },
                querySchema: { type: "object" },
                resultSchema: { type: "object" },
                citation: { required: true, outputPointer: "/citations" },
              }),
            ],
          }
        : {}),
      ...(scenario === "memory"
        ? {
            memory: {
              stores: [
                {
                  id: "preferences",
                  adapter: { type: "binding", bindingKey: "memory.v1" },
                  namespace: {
                    tenantId: principal.tenantId,
                    subjectId: principal.subjectId,
                    agentId: "example",
                  },
                  read: { strategy: "semantic", topK: 3, maxTokens: 1000 },
                  write: {
                    strategy: "model-proposed-policy-approved",
                    idempotency: {
                      namespace: "example.preferences",
                      businessKey: {
                        type: "binding",
                        bindingKey: "proposal-key.v1",
                      },
                    },
                  },
                },
              ],
            },
            permissions: {
              policy: { type: "binding", bindingKey: "permission.v1" },
            },
          }
        : {}),
    },
  });
  const subscription = await session.subscribe({
    afterSequence: 0,
    onEvent: (event) => {
      if (event.type === "run.failed") console.error(event.data.error.code);
    },
  });
  const result = await session.run({
    requestId: `example-${scenario}`,
    input: "Run the synthetic example",
    context: { proposalId: "synthetic-proposal" },
    ...(scenario === "knowledge"
      ? {
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
        }
      : {}),
  });
  console.log(result.outputText);
  if (scenario === "basic") {
    const current = await session.getConfig();
    await session.replaceConfig({
      ifVersion: current.version,
      config: {
        ...current.value,
        instructions: {
          text: "Continue using only the declared capabilities.",
        },
      },
    });
    const reused = await engine.loadSession(session.id);
    console.log(
      (
        await reused.run({
          input: "Continue the example",
          overrides: { model: "primary", tools: [], loop: { maxSteps: 3 } },
        })
      ).outputText,
    );
    console.log(
      JSON.stringify({
        currentVersion: (await reused.getConfig()).version,
        firstRunVersion: (
          await reused.getEffectiveConfig({ runId: result.runId })
        ).sessionConfigVersion,
      }),
    );
  }
  const usage = await engine.usage.getRun(result.runId);
  console.log(
    JSON.stringify({
      attempts: usage.attemptCount,
      knownTokens: usage.knownTotals,
      estimatedCostByCurrency: usage.costByCurrency,
      complete: usage.complete,
      costComplete: usage.costComplete,
    }),
  );
  if (scenario === "monitoring") console.log(metrics.render());
  await subscription.close();
} finally {
  await engine.close();
}
