import { it, expect } from "vitest";
import {
  createAgentEngine,
  AgentEngineError,
  effectiveConfig,
  parseConfig,
  validateSchema,
  type EngineOptions,
  type RunRecord,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  FakeClock,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
const base = {
  models: {
    p: {
      provider: "fake",
      model: "synthetic",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "synthetic" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "p" },
};
const options = (model: ReturnType<typeof scriptedModel>): EngineOptions => ({
  store: new MemoryStore(),
  principal: { tenantId: "review", subjectId: "u" },
  adapters: { models: { fake: model } },
  secrets: { resolve: async () => "synthetic" },
  policy: { allowedOrigins: ["https://model.example.com"] },
});

it.each(["retention", "authorization", "source"])(
  "revocation at model completion denies %s output before commit and delivery",
  async (condition) => {
    const clock = new FakeClock();
    let allowed = true;
    const model = scriptedModel([
      ...(condition === "source" ? [toolCall("read", {})] : []),
      () => {
        if (condition === "retention") clock.advance(1001);
        else allowed = false;
        return finalText("RESTRICTED_RESULT");
      },
    ]);
    const opts = options(model);
    const engine = await createAgentEngine({
      ...opts,
      clock,
      authorize: async ({ action, resource }) =>
        action !== "data" ||
        allowed ||
        (condition === "source" && resource !== "tool:read"),
      policy: { ...opts.policy, promptRetention: "1s" },
      bindings: {
        read: {
          version: "1",
          sideEffect: "read",
          execute: async () => ({ value: "source" }),
        },
      },
    });
    try {
      const session = await engine.createSession({
        config: {
          ...base,
          ...(condition === "source"
            ? {
                tools: [
                  {
                    name: "read",
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
              }
            : {}),
        },
      });
      const handle = await session.startRun({ input: "go" });
      await expect(handle.result).rejects.toMatchObject({
        code:
          condition === "retention"
            ? "DATA_RETENTION_EXPIRED"
            : "ACCESS_DENIED",
      });
      const stored = await opts.store.transaction((tx) =>
        tx.get<RunRecord>("runs", handle.runId),
      );
      expect(stored?.state).toBe("failed");
      expect(stored?.result).toBeUndefined();
      expect(JSON.stringify(stored?.messages)).not.toContain(
        "RESTRICTED_RESULT",
      );
      await expect(session.getRun(handle.runId)).rejects.toMatchObject({
        code:
          condition === "retention"
            ? "DATA_RETENTION_EXPIRED"
            : "ACCESS_DENIED",
      });
    } finally {
      await engine.close();
    }
  },
);

it("missing budgets inherit hard ceilings; explicit limits and currencies still reject before acceptance", async () => {
  const ceiling = {
    budgets: {
      perRun: {
        maxTotalTokens: 100,
        maxEstimatedCost: { amount: 1, currency: "USD" },
      },
    },
  };
  const effective = effectiveConfig(parseConfig(base), {}, ceiling);
  expect(effective.budgets?.perRun).toEqual(ceiling.budgets.perRun);
  for (const perRun of [
    { maxTotalTokens: 101 },
    { maxEstimatedCost: { amount: 0.1, currency: "CNY" } },
  ])
    expect(() =>
      effectiveConfig(
        parseConfig({ ...base, budgets: { perRun } }),
        {},
        ceiling,
      ),
    ).toThrow();
  expect(
    effectiveConfig(
      parseConfig({ ...base, budgets: { perRun: { maxTotalTokens: 50 } } }),
      {},
      ceiling,
    ).budgets?.perRun.maxTotalTokens,
  ).toBe(50);
  const model = scriptedModel([finalText("never")]);
  const opts = options(model);
  const engine = await createAgentEngine({
    ...opts,
    policy: {
      ...opts.policy,
      ceilings: { budgets: { perRun: { maxTotalTokens: 100 } } },
    },
  });
  try {
    const session = await engine.createSession({ config: base });
    await expect(session.run({ input: "go" })).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect(model.requests).toHaveLength(0);
  } finally {
    await engine.close();
  }
});

it.each(["deny", "require-approval"])(
  "completed receipts obey the current %s policy without rewriting success",
  async (permission) => {
    let calls = 0,
      policyCalls = 0;
    const model = scriptedModel([
      toolCall("write", {}),
      finalText("first"),
      toolCall("write", {}),
      (req) => finalText(req.messages.at(-1)!.content),
    ]);
    const opts = options(model);
    const engine = await createAgentEngine({
      ...opts,
      bindings: {
        key: {
          version: "1",
          sideEffect: "read",
          execute: async () => "stable",
        },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => {
            policyCalls++;
            return "allow";
          },
        },
        write: {
          version: "1",
          sideEffect: "write",
          namespace: "review.write",
          execute: async () => {
            calls++;
            return { marker: "RESTRICTED_RECEIPT" };
          },
        },
      },
    });
    const config = {
      ...base,
      permissions: { policy: { type: "binding", bindingKey: "policy" } },
      tools: [
        {
          name: "write",
          description: "Write",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          execution: {
            type: "binding",
            bindingKey: "write",
            sideEffect: "write",
            idempotency: {
              namespace: "review.write",
              businessKey: { type: "binding", bindingKey: "key" },
            },
          },
        },
      ],
    };
    try {
      await (await engine.createSession({ config })).run({ input: "one" });
      const before = policyCalls;
      const session = await engine.createSession({
        config: {
          ...config,
          tools: config.tools.map((t) => ({ ...t, permission })),
        },
      });
      const run = await session.startRun({ input: "two" });
      if (permission === "require-approval") {
        await expect
          .poll(async () => (await session.getRun(run.runId)).state)
          .toBe("awaiting_input");
        const record = await opts.store.transaction((tx) =>
          tx.get<RunRecord>("runs", run.runId),
        );
        await session.resolveInput(record!.pending!.id, {
          kind: "permission",
          decision: "deny",
        });
      }
      expect((await run.result).outputText).not.toContain("RESTRICTED_RECEIPT");
      expect(policyCalls).toBeGreaterThan(before);
      expect(calls).toBe(1);
      expect(
        (await opts.store.transaction((tx) => tx.list<any>("operations")))[0]
          .executionStatus,
      ).toBe("succeeded");
    } finally {
      await engine.close();
    }
  },
);

it("empty or exhausted fallback targets never bypass retryOn", async () => {
  const model = scriptedModel([
    [
      {
        type: "failed",
        error: new AgentEngineError(
          "MODEL_PROVIDER_ERROR",
          "synthetic",
          true,
          "safe",
        ),
      },
    ],
    finalText("never"),
  ]);
  const engine = await createAgentEngine(options(model));
  try {
    const session = await engine.createSession({
      config: {
        ...base,
        routing: {
          primary: "p",
          fallbacks: [],
          fallbackOn: ["provider_unavailable"],
        },
        retry: { model: { maxRetries: 1, retryOn: [] } },
      },
    });
    await expect(session.run({ input: "go" })).rejects.toMatchObject({
      code: "MODEL_PROVIDER_ERROR",
    });
    expect(model.requests).toHaveLength(1);
  } finally {
    await engine.close();
  }
});

it("legal self-referencing schemas with the same $id remain isolated and reusable", async () => {
  const schema = {
    $id: "https://schema.example.com/item",
    type: "object",
    properties: { next: { $ref: "#" }, name: { type: "string" } },
  };
  expect(validateSchema(schema, { name: "a", next: { name: "b" } }).ok).toBe(
    true,
  );
  expect(validateSchema(structuredClone(schema), { name: "a" }).ok).toBe(true);
  expect(
    validateSchema(
      { ...schema, properties: { name: { type: "number" } } },
      { name: "a" },
    ).ok,
  ).toBe(false);
  const engine = await createAgentEngine({
    ...options(
      scriptedModel([toolCall("read", { name: "a" }), finalText("done")]),
    ),
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({ name: "result" }),
      },
    },
  });
  try {
    const config = {
      ...base,
      tools: [
        {
          name: "read",
          description: "Read",
          inputSchema: schema,
          outputSchema: schema,
          execution: {
            type: "binding",
            bindingKey: "read",
            sideEffect: "read",
          },
        },
      ],
    };
    const s = await engine.createSession({ config });
    await s.replaceConfig({ ifVersion: 1, config });
    expect((await s.run({ input: "go" })).outputText).toBe("done");
  } finally {
    await engine.close();
  }
});

it("Run tool subsets intersect Skill allowlists before acceptance", async () => {
  const model = scriptedModel([finalText("done")]);
  const engine = await createAgentEngine({
    ...options(model),
    bindings: {
      read: { version: "1", sideEffect: "read", execute: async () => ({}) },
    },
  });
  try {
    const s = await engine.createSession({
      config: {
        ...base,
        tools: ["a", "b"].map((name) => ({
          name,
          description: "Read",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          execution: {
            type: "binding",
            bindingKey: "read",
            sideEffect: "read",
          },
        })),
        skills: [
          {
            id: "skill",
            name: "Skill",
            description: "D",
            instructions: "I",
            allowedTools: ["a", "b"],
          },
        ],
      },
    });
    const result = await s.run({ input: "go", overrides: { tools: ["a"] } });
    expect(result.outputText).toBe("done");
    expect(model.requests[0]!.tools.some((t) => t.name === "b")).toBe(false);
  } finally {
    await engine.close();
  }
});

it("session pagination sorts before limiting and can reach every owned session", async () => {
  const clock = new FakeClock();
  const engine = await createAgentEngine({
    ...options(scriptedModel([])),
    clock,
  });
  try {
    const ids = [];
    for (let i = 0; i < 501; i++) {
      ids.push((await engine.createSession({ config: base })).id);
      clock.advance(1);
    }
    const first = await engine.listSessions();
    expect(first).toHaveLength(500);
    expect(first[0]!.id).toBe(ids.at(-1));
    const last = await engine.listSessions({ after: first.at(-1)!.id });
    expect(last.map((s) => s.id)).toEqual([ids[0]]);
    await expect(
      engine.listSessions({ after: "not-owned" }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  } finally {
    await engine.close();
  }
});

it("pending model secrets obey attempt timeout and cancellation without dispatch", async () => {
  const model = scriptedModel([finalText("never")]);
  const engine = await createAgentEngine({
    ...options(model),
    secrets: { resolve: async () => new Promise(() => {}) },
  });
  try {
    const s = await engine.createSession({
      config: {
        ...base,
        models: { p: { ...base.models.p, timeouts: { attemptMs: 30 } } },
        retry: { model: { maxRetries: 0 } },
      },
    });
    const run = await s.startRun({ input: "go" });
    await expect(run.result).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
    expect(model.requests).toHaveLength(0);
    const cancelled = await s.startRun({ input: "cancel" });
    await cancelled.cancel();
    await expect(cancelled.result).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
  } finally {
    await engine.close();
  }
});

it("retry backoff ends at the remaining Run deadline", async () => {
  const model = scriptedModel([
    [
      {
        type: "failed",
        error: new AgentEngineError(
          "MODEL_PROVIDER_ERROR",
          "synthetic",
          true,
          "safe",
        ),
      },
    ],
    finalText("never"),
  ]);
  const engine = await createAgentEngine(options(model));
  try {
    const s = await engine.createSession({
      config: {
        ...base,
        loop: { timeoutMs: 100 },
        retry: {
          model: {
            maxRetries: 1,
            backoff: {
              type: "exponential-jitter",
              initialDelayMs: 1000,
              maxDelayMs: 1000,
            },
          },
        },
      },
    });
    const run = await s.startRun({ input: "go" });
    await expect(run.result).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(model.requests).toHaveLength(1);
  } finally {
    await engine.close();
  }
});

it("migration cleanup preserves the original failure when rollback also fails", async () => {
  const { PostgresStore } = await import("@agent-runtime/sdk");
  const { Pool } = await import("pg");
  const pool = new Pool();
  const original = new Error("migration-original");
  let released = false;
  pool.connect = (async () => ({
    query: async (sql: string) => {
      throw sql === "ROLLBACK" ? new Error("rollback-secondary") : original;
    },
    release: () => {
      released = true;
    },
  })) as unknown as typeof pool.connect;
  try {
    await expect(new PostgresStore(pool).migrate()).rejects.toBe(original);
    expect(released).toBe(true);
  } finally {
    await pool.end();
  }
});

it("shutdown attempts every resource when earlier cleanup fails", async () => {
  const { closeResources } =
    await import("../../scripts/lib/close-resources.js");
  const called: string[] = [];
  await expect(
    closeResources(
      {
        close: async () => {
          called.push("server");
          throw Error("server-close");
        },
      },
      undefined,
      {
        close: async () => {
          called.push("engine");
        },
      },
    ),
  ).rejects.toBeInstanceOf(AggregateError);
  expect(called).toEqual(["server", "engine"]);
});

it.each(["source-expired", "receipt-revoked"])(
  "cached receipt lineage remains protected at final delivery: %s",
  async (condition) => {
    const clock = new FakeClock();
    let accessible = true,
      writes = 0;
    const model = scriptedModel([
      toolCall("write", {}),
      finalText("first"),
      toolCall("write", {}),
      () => {
        if (condition === "source-expired") clock.advance(600);
        else accessible = false;
        return finalText("DERIVED_RECEIPT_RESULT");
      },
    ]);
    const opts = options(model);
    const engine = await createAgentEngine({
      ...opts,
      clock,
      authorize: async ({ action, resource }) =>
        action !== "data" || !resource.startsWith("operation:") || accessible,
      policy: { ...opts.policy, promptRetention: "1s" },
      bindings: {
        key: {
          version: "1",
          sideEffect: "read",
          execute: async () => "same-key",
        },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => "allow",
        },
        write: {
          version: "1",
          sideEffect: "write",
          namespace: "review.lineage",
          execute: async () => {
            writes++;
            return { value: "RESTRICTED_RECEIPT" };
          },
        },
      },
    });
    const config = {
      ...base,
      permissions: { policy: { type: "binding", bindingKey: "policy" } },
      tools: [
        {
          name: "write",
          description: "Write",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          execution: {
            type: "binding",
            bindingKey: "write",
            sideEffect: "write",
            idempotency: {
              namespace: "review.lineage",
              businessKey: { type: "binding", bindingKey: "key" },
            },
          },
        },
      ],
    };
    try {
      await (await engine.createSession({ config })).run({ input: "first" });
      clock.advance(500);
      const next = await engine.createSession({ config });
      const run = await next.startRun({ input: "second" });
      const code =
        condition === "source-expired"
          ? "DATA_RETENTION_EXPIRED"
          : "ACCESS_DENIED";
      await expect(run.result).rejects.toMatchObject({ code });
      expect(writes).toBe(1);
      await expect(next.getRun(run.runId)).rejects.toMatchObject({ code });
      const stored = await opts.store.transaction((tx) =>
        tx.get<RunRecord>("runs", run.runId),
      );
      expect(stored?.result).toBeUndefined();
      expect(JSON.stringify(stored?.messages)).not.toContain(
        "DERIVED_RECEIPT_RESULT",
      );
    } finally {
      await engine.close();
    }
  },
);
