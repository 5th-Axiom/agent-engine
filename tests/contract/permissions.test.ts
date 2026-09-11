import { it, expect } from "vitest";
import { createAgentEngine, type EngineOptions } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
it("duplicate approval callbacks racing cancellation advance the Run at most once", async () => {
  let calls = 0;
  const store = new MemoryStore();
  const engine = await createAgentEngine({
    store,
    principal: { tenantId: "approval-race", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    adapters: {
      models: {
        fake: scriptedModel([toolCall("record.write", {}), finalText("done")]),
      },
    },
    bindings: {
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "race",
        execute: async () => {
          calls++;
          return { ok: true };
        },
      },
      key: { version: "1", sideEffect: "read", execute: async () => "key" },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...modelConfig,
        tools: [
          {
            name: "record.write",
            description: "Write",
            permission: "require-approval",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
            execution: {
              type: "binding",
              bindingKey: "write",
              sideEffect: "write",
              idempotency: {
                namespace: "race",
                businessKey: { type: "binding", bindingKey: "key" },
              },
            },
          },
        ],
      },
    });
    const handle = await session.startRun({ input: "go" });
    let pending;
    for (let n = 0; n < 200; n++) {
      pending = (await session.getRun(handle.runId)).pending;
      if (pending) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(pending?.kind).toBe("permission");
    const answer = { kind: "permission", decision: "allow_once" };
    await Promise.allSettled([
      session.resolveInput(pending!.id, answer),
      session.resolveInput(pending!.id, answer),
      session.cancelRun(handle.runId),
    ]);
    await expect(handle.result).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
    expect(calls).toBeLessThanOrEqual(1);
    expect(
      (await session.listEvents()).events.filter(
        (event) => event.type === "input.resolved",
      ).length,
    ).toBeLessThanOrEqual(1);
    expect(
      (await session.listEvents()).events.filter(
        (event) => event.type === "run.cancelled",
      ),
    ).toHaveLength(1);
  } finally {
    await engine.close();
  }
});

const modelConfig = {
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
  permissions: { policy: { type: "binding", bindingKey: "policy" } },
};
for (const declared of ["deny", "require-approval"] as const) {
  it(`host allow cannot widen the declared ${declared} permission`, async () => {
    let calls = 0;
    const engine = await createAgentEngine({
      store: new MemoryStore(),
      principal: { tenantId: "t", subjectId: "u" },
      adapters: {
        models: {
          fake: scriptedModel([toolCall("record.read", {}), finalText("done")]),
        },
      },
      secrets: { resolve: async () => "synthetic" },
      policy: { allowedOrigins: ["https://model.example.com"] },
      bindings: {
        read: {
          version: "1",
          sideEffect: "read",
          execute: async () => {
            calls++;
            return { ok: true };
          },
        },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => "allow",
        },
      },
    });
    try {
      const session = await engine.createSession({
        config: {
          ...modelConfig,
          tools: [
            {
              name: "record.read",
              description: "Synthetic read",
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
              permission: declared,
              execution: {
                type: "binding",
                bindingKey: "read",
                sideEffect: "read",
              },
            },
          ],
        },
      });
      const handle = await session.startRun({ input: "go" });
      if (declared === "require-approval") {
        let pending;
        for (let i = 0; i < 200; i++) {
          pending = (await session.getRun(handle.runId)).pending;
          if (pending) break;
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        expect(pending?.kind).toBe("permission");
        expect(calls).toBe(0);
        await session.resolveInput(pending!.id, {
          kind: "permission",
          decision: "allow_once",
        });
      }
      await handle.result;
      expect(calls).toBe(declared === "deny" ? 0 : 1);
    } finally {
      await engine.close();
    }
  });
}

it("knowledge retrievers cannot relabel a trusted write Binding as read-only", async () => {
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "u" },
    adapters: { models: { fake: scriptedModel([]) } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "test",
        execute: async () => ({}),
      },
    },
  });
  try {
    await expect(
      engine.createSession({
        config: {
          ...modelConfig,
          knowledgeBases: [
            {
              id: "kb",
              name: "Knowledge",
              description: "Retrieve",
              querySchema: { type: "object" },
              resultSchema: { type: "object" },
              retriever: { type: "binding", bindingKey: "write" },
              citation: { required: false, outputPointer: "/citations" },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "CONFIG_POLICY_VIOLATION" });
  } finally {
    await engine.close();
  }
});

it("revoking a knowledge source blocks derived history reuse and event replay", async () => {
  let revoked = false;
  const model = scriptedModel([
    toolCall("engine.knowledge.manual", {}),
    finalText("derived answer"),
    finalText("must not send"),
  ]);
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "lineage", subjectId: "u" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    authorize: async (request) =>
      !(revoked && request.resource === "knowledge:manual"),
    bindings: {
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
      retrieve: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({
          items: [
            { chunkId: "one", content: "synthetic source", title: "Manual" },
          ],
        }),
      },
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...modelConfig,
        knowledgeBases: [
          {
            id: "manual",
            name: "Manual",
            description: "Synthetic reference",
            retriever: { type: "binding", bindingKey: "retrieve" },
            querySchema: { type: "object" },
            resultSchema: { type: "object" },
            citation: { required: false, outputPointer: "/citations" },
          },
        ],
      },
    });
    expect((await session.run({ input: "read" })).outputText).toBe(
      "derived answer",
    );
    revoked = true;
    await expect(session.run({ input: "reuse" })).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(model.requests).toHaveLength(2);
    await expect(session.listEvents()).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(session.getSnapshot()).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  } finally {
    await engine.close();
  }
});

it("a business-key Binding cannot smuggle a write before permission or ledger dispatch", async () => {
  let calls = 0;
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "key", subjectId: "u" },
    adapters: { models: { fake: scriptedModel([]) } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    bindings: {
      write: {
        version: "1",
        sideEffect: "write",
        namespace: "records",
        execute: async () => {
          calls++;
          return {};
        },
      },
      key: {
        version: "1",
        sideEffect: "write",
        namespace: "keys",
        execute: async () => {
          calls++;
          return "key";
        },
      },
      policy: {
        version: "1",
        sideEffect: "read",
        execute: async () => "allow",
      },
    },
  });
  try {
    await expect(
      engine.createSession({
        config: {
          ...modelConfig,
          tools: [
            {
              name: "record.write",
              description: "Synthetic",
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
              execution: {
                type: "binding",
                bindingKey: "write",
                sideEffect: "write",
                idempotency: {
                  namespace: "records",
                  businessKey: { type: "binding", bindingKey: "key" },
                },
              },
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "CONFIG_POLICY_VIOLATION" });
    expect(calls).toBe(0);
  } finally {
    await engine.close();
  }
});
