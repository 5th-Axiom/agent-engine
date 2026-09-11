import { it, expect } from "vitest";
import {
  createAgentEngine,
  AgentEngineError,
  EngineOptionsSchema,
  type JsonObject,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
  FakeClock,
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
const common = {
  principal: { tenantId: "t", subjectId: "u" },
  secrets: { resolve: async () => "synthetic" },
  policy: { allowedOrigins: ["https://model.example.com"] },
};
it("reconciliation has an independent bounded allowance and evidence still resolves a budget-exhausted Run", async () => {
  let writes = 0,
    lookups = 0;
  const store = new MemoryStore();
  const engine = await createAgentEngine({
    ...common,
    store,
    limits: { maxReconciliationsPerOperation: 1 },
    adapters: {
      models: { fake: scriptedModel([toolCall("record.write", {})]) },
    },
    bindings: {
      key: { version: "1", sideEffect: "read", execute: async () => "key" },
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "record",
        execute: async () => {
          writes++;
          throw new AgentEngineError("TOOL_TIMEOUT");
        },
      },
      lookup: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          lookups++;
          return { outcome: "unknown" };
        },
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        loop: { maxModelAttempts: 1, maxCapabilityInvocations: 3 },
        permissions: { policy: { type: "binding", bindingKey: "policy" } },
        tools: [
          {
            name: "record.write",
            description: "Write",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            execution: {
              type: "binding",
              bindingKey: "write",
              sideEffect: "write",
              idempotency: {
                namespace: "record",
                businessKey: { type: "binding", bindingKey: "key" },
              },
            },
            reconciliation: { type: "binding", bindingKey: "lookup" },
          },
        ],
      },
    });
    const handle = await session.startRun({ input: "go" });
    for (
      let n = 0;
      n < 200 &&
      (await session.getRun(handle.runId)).state !== "awaiting_tool_resolution";
      n++
    )
      await new Promise((resolve) => setTimeout(resolve, 2));
    const op = (
      await store.transaction((tx) => tx.list<{ id: string }>("operations"))
    )[0]!;
    expect(
      (await engine.readRun(session.id, handle.runId)).capabilityInvocations,
    ).toBe(3);
    await session.reconcileOperation(op.id);
    await expect(session.reconcileOperation(op.id)).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    await session.resolveOperationOutcome(op.id, {
      outcome: "succeeded",
      evidenceRef: "host-verified",
      receipt: { ok: true },
    });
    await expect(handle.result).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect(writes).toBe(1);
    expect(lookups).toBe(1);
  } finally {
    await engine.close();
  }
});
it("invalid Skill loader content becomes a bounded error observation without activating the Skill", async () => {
  const model = scriptedModel([
    toolCall("engine.skill.select", { id: "bad" }),
    finalText("unable to load"),
  ]);
  const engine = await createAgentEngine({
    ...common,
    store: new MemoryStore(),
    adapters: { models: { fake: model } },
    bindings: {
      loader: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({
          version: "wrong",
          instructions: "PRIVATE_WRONG_VERSION",
        }),
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        skills: [
          {
            id: "bad",
            name: "Bad",
            description: "Configured loader",
            source: { type: "loader", loaderKey: "loader", version: "v1" },
            allowedTools: [],
          },
        ],
      },
    });
    expect((await session.run({ input: "go" })).outputText).toBe(
      "unable to load",
    );
    expect(JSON.stringify(model.requests[1])).toContain("TOOL_OUTPUT_INVALID");
    expect(JSON.stringify(model.requests)).not.toContain(
      "PRIVATE_WRONG_VERSION",
    );
    expect(
      (await session.listEvents()).events.filter(
        (event) => event.type === "skill.failed",
      ),
    ).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
it("readonly retry really redispatches and consumes the shared capability allowance", async () => {
  for (const cap of [1, 2]) {
    let calls = 0;
    const model = scriptedModel([toolCall("read.item", {}), finalText("done")]);
    const engine = await createAgentEngine({
      ...common,
      store: new MemoryStore(),
      adapters: { models: { fake: model } },
      bindings: {
        read: {
          version: "1",
          sideEffect: "read",
          execute: async () => {
            if (++calls === 1)
              throw new AgentEngineError("TOOL_TIMEOUT", "PRIVATE_ERROR", true);
            return { ok: true };
          },
        },
      },
    });
    try {
      const session = await engine.createSession({
        config: {
          ...config,
          loop: { maxCapabilityInvocations: cap },
          retry: { readonlyTool: { maxRetries: 1 } },
          tools: [
            {
              name: "read.item",
              description: "Read",
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
      if (cap === 1)
        await expect(session.run({ input: "go" })).rejects.toMatchObject({
          code: "BUDGET_EXCEEDED",
        });
      else expect((await session.run({ input: "go" })).outputText).toBe("done");
      expect(calls).toBe(cap);
      expect(JSON.stringify((await session.listEvents()).events)).not.toContain(
        "PRIVATE_ERROR",
      );
    } finally {
      await engine.close();
    }
  }
});
it("automatic and explicit memory reads apply per-item authorization, scope, expiry, deduplication and byte budget", async () => {
  for (const strategy of ["semantic", "none"] as const) {
    const clock = new FakeClock();
    let calls = 0,
      revoked = false;
    const model = scriptedModel([
      ...(strategy === "none"
        ? [toolCall("engine.memory.read.prefs", { query: "q" })]
        : []),
      finalText("derived"),
    ]);
    const engine = await createAgentEngine({
      ...common,
      store: new MemoryStore(),
      clock,
      authorize: async (req) =>
        !(
          req.action === "data" &&
          (req.resource.endsWith("/denied") ||
            (revoked && req.resource.endsWith("/allowed")))
        ),
      adapters: { models: { fake: model } },
      bindings: {
        memory: {
          version: "1",
          sideEffect: "read",
          execute: async () => {
            calls++;
            return {
              items: [
                {
                  id: "alien",
                  content: "PRIVATE_ALIEN",
                  version: "1",
                  namespace: {
                    tenantId: "other",
                    subjectId: "u",
                    agentId: "a",
                  },
                },
                {
                  id: "expired",
                  content: "PRIVATE_EXPIRED",
                  version: "1",
                  expiresAt: new Date(-1).toISOString(),
                },
                { id: "denied", content: "PRIVATE_DENIED", version: "1" },
                {
                  id: "huge",
                  content: "PRIVATE_HUGE".repeat(500),
                  version: "1",
                },
                {
                  id: "allowed",
                  content: "permitted",
                  version: "1",
                  expiresAt: new Date(10000).toISOString(),
                },
                { id: "allowed", content: "PRIVATE_DUPLICATE", version: "1" },
              ] as JsonObject[],
            };
          },
        },
      },
    });
    try {
      const session = await engine.createSession({
        config: {
          ...config,
          memory: {
            stores: [
              {
                id: "prefs",
                adapter: { type: "binding", bindingKey: "memory" },
                namespace: { tenantId: "t", subjectId: "u", agentId: "a" },
                read: { strategy, topK: 10, maxTokens: 512 },
              },
            ],
          },
        },
      });
      await session.run({ input: "go" });
      const request = JSON.stringify(model.requests.at(-1));
      expect(request).toContain("permitted");
      expect(request).not.toContain("PRIVATE_");
      expect(calls).toBe(1);
      revoked = true;
      await expect(session.run({ input: "reuse" })).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(session.getSnapshot()).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
    } finally {
      await engine.close();
    }
  }
});
it("automatic memory transport retry is bounded and model retries reuse the persisted retrieval", async () => {
  let calls = 0;
  const model = scriptedModel([
    [
      {
        type: "failed",
        error: new AgentEngineError("MODEL_RATE_LIMITED", "limited", true),
      },
    ],
    finalText("done"),
  ]);
  const engine = await createAgentEngine({
    ...common,
    store: new MemoryStore(),
    clock: new FakeClock(),
    adapters: { models: { fake: model } },
    bindings: {
      memory: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          if (++calls === 1)
            throw new AgentEngineError("TOOL_TIMEOUT", "timeout", true);
          return {
            items: [
              { id: "a", content: "retrieved once successfully", version: "1" },
            ],
          };
        },
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        memory: {
          stores: [
            {
              id: "prefs",
              adapter: { type: "binding", bindingKey: "memory" },
              namespace: { tenantId: "t", subjectId: "u", agentId: "a" },
              read: { strategy: "semantic", topK: 3, maxTokens: 1000 },
            },
          ],
        },
      },
    });
    await session.run({ input: "go" });
    expect(calls).toBe(2);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[0]).toEqual(model.requests[1]);
  } finally {
    await engine.close();
  }
});
it("knowledge results sort and deduplicate authorized unexpired chunks before applying the configured budget", async () => {
  const model = scriptedModel([
    toolCall("engine.knowledge.docs", { query: "q", topK: 1 }),
    finalText("done"),
  ]);
  const engine = await createAgentEngine({
    ...common,
    store: new MemoryStore(),
    clock: new FakeClock(),
    authorize: async (req) => !req.resource.endsWith("/denied"),
    adapters: { models: { fake: model } },
    bindings: {
      search: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({
          items: [
            {
              chunkId: "old",
              content: "PRIVATE_OLD",
              score: 100,
              expiresAt: new Date(-1).toISOString(),
            },
            { chunkId: "denied", content: "PRIVATE_DENIED", score: 99 },
            { chunkId: "winner", content: "best source", score: 10 },
            { chunkId: "winner", content: "PRIVATE_DUPLICATE", score: 9 },
            { chunkId: "lower", content: "PRIVATE_LOWER", score: 1 },
          ] as JsonObject[],
        }),
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...config,
        knowledgeBases: [
          {
            id: "docs",
            name: "Docs",
            description: "Search",
            retriever: { type: "binding", bindingKey: "search" },
            querySchema: { type: "object" },
            resultSchema: { type: "object" },
            defaults: { topK: 5, maxTokens: 512 },
            citation: { required: false, outputPointer: "/citations" },
          },
        ],
      },
    });
    await session.run({ input: "go" });
    const message = model.requests[1]!.messages.find((m) => m.role === "tool")!;
    expect(JSON.parse(message.content).items).toHaveLength(1);
    expect(message.content).toContain("best source");
    expect(message.content).not.toContain("PRIVATE_");
  } finally {
    await engine.close();
  }
});
it("retention duration validation uses elapsed time consistently and rejects overflow", () => {
  const base = { ...common, store: new MemoryStore() };
  for (const value of ["10000ms", "10s", "3650d"])
    expect(
      EngineOptionsSchema.safeParse({
        ...base,
        policy: { promptRetention: value },
      }).success,
    ).toBe(true);
  for (const value of ["0ms", "3651d", "9".repeat(400) + "d"])
    expect(
      EngineOptionsSchema.safeParse({
        ...base,
        policy: { protocolPayloadRetention: "encrypted-" + value },
      }).success,
    ).toBe(false);
});
