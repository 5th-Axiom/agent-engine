import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createAgentEngine,
  PostgresStore,
  type EngineOptions,
} from "@agent-runtime/sdk";
import {
  FakeClock,
  FaultInjector,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";

it("PostgreSQL recovery preserves explicit unlimited bounds and elapsed time after an interrupted request", async () => {
  const database =
    process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test";
  const clock = new FakeClock(),
    faults = new FaultInjector();
  faults.arm("model.before_send");
  let reached!: () => void,
    calls = 0;
  const crashed = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const loop = {
    maxSteps: null,
    maxModelAttempts: null,
    maxCapabilityInvocations: null,
    timeoutMs: null,
  };
  const options: Omit<EngineOptions, "store"> = {
    principal: { tenantId: randomUUID(), subjectId: "user" },
    clock,
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    adapters: {
      models: {
        fake: scriptedModel([
          toolCall("read.item", {}),
          finalText("recovered"),
        ]),
      },
    },
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          calls++;
          return {};
        },
      },
    },
    fault: (point) => {
      if (point === "model.before_send") {
        reached();
        faults.hit(point);
      }
    },
  };
  const store = PostgresStore.fromConnectionString(database);
  await store.migrate();
  const first = await createAgentEngine({ ...options, store });
  const session = await first.createSession({
    config: {
      models: {
        p: {
          provider: "fake",
          model: "synthetic",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "test" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "p" },
      loop,
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
  const input = { requestId: "stable", input: "resume" };
  try {
    await session.startRun(input);
    await crashed;
    clock.advance(150000);
  } finally {
    await first.close();
  }
  const next = await createAgentEngine({
    ...options,
    store: PostgresStore.fromConnectionString(database),
  });
  try {
    const restored = await next.loadSession(session.id);
    const result = await (await restored.startRun(input)).result;
    expect(result.outputText).toBe("recovered");
    expect(calls).toBe(1);
    const run = await next.readRun(session.id, result.runId);
    expect(run.config.loop).toEqual(loop);
    expect(run.activeMs).toBeGreaterThanOrEqual(150000);
    expect(
      (await restored.getEffectiveConfig({ runId: result.runId })).value.loop,
    ).toEqual(loop);
  } finally {
    await next.close();
  }
});
