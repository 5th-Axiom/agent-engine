import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createAgentEngine,
  PostgresStore,
  type EngineOptions,
  type RunRecord,
  type OperationRecord,
} from "@agent-runtime/sdk";
import {
  FaultInjector,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
const db = () =>
  PostgresStore.fromConnectionString(
    process.env.AGENT_TEST_DATABASE_URL ??
      "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
  );
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
  permissions: { policy: { type: "binding", bindingKey: "policy" } },
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
          namespace: "checkpoint",
          businessKey: { type: "binding", bindingKey: "key" },
        },
      },
    },
  ],
};
it.each([
  "run.after_accept",
  "model.before_send",
  "model.after_commit",
  "tool.before_execute",
  "tool.after_receipt",
])(
  "PostgreSQL recovery at %s preserves admission and prevents unintended replay",
  async (point) => {
    const faults = new FaultInjector();
    faults.arm(point);
    let hit!: () => void;
    const reached = new Promise<void>((resolve) => {
      hit = resolve;
    });
    let calls = 0;
    const model = scriptedModel([
      toolCall("record.write", { id: "a" }),
      finalText("done"),
    ]);
    const options: Omit<EngineOptions, "store"> = {
      principal: { tenantId: randomUUID(), subjectId: "u" },
      secrets: { resolve: async () => "synthetic" },
      adapters: { models: { fake: model } },
      policy: { allowedOrigins: ["https://model.example.com"] },
      fault: (p) => {
        if (p === point) {
          hit();
          faults.hit(p);
        }
      },
      bindings: {
        write: {
          version: "1",
          sideEffect: "write",
          namespace: "checkpoint",
          execute: async () => {
            calls++;
            return { ok: true };
          },
        },
        key: { version: "1", sideEffect: "read", execute: async () => "same" },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => "allow",
        },
      },
    };
    const store = db();
    await store.migrate();
    const first = await createAgentEngine({ ...options, store });
    const session = await first.createSession({ config });
    const input = { requestId: "stable", input: "go" };
    if (point === "run.after_accept")
      await expect(session.startRun(input)).rejects.toThrow("run.after_accept");
    else await session.startRun(input);
    await reached;
    await first.close();
    const restoredStore = db();
    const next = await createAgentEngine({ ...options, store: restoredStore });
    try {
      const restored = await next.loadSession(session.id);
      const handle = await restored.startRun(input);
      if (point === "tool.before_execute") {
        let operation: OperationRecord | undefined;
        for (let n = 0; n < 200; n++) {
          operation = (
            await restoredStore.transaction((tx) =>
              tx.list<OperationRecord>("operations"),
            )
          ).find((op) => op.sessionId === session.id);
          if (operation?.executionStatus === "outcome_unknown") break;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(operation?.executionStatus).toBe("outcome_unknown");
        expect(calls).toBe(0);
        await restored.resolveOperationOutcome(operation!.id, {
          outcome: "not_executed",
          evidenceRef: "host-verified-no-dispatch",
        });
      }
      expect((await handle.result).outputText).toBe("done");
      expect(calls).toBe(point === "tool.before_execute" ? 0 : 1);
      expect(model.requests).toHaveLength(2);
      const runs = (
        await restoredStore.transaction((tx) => tx.list<RunRecord>("runs"))
      ).filter((run) => run.sessionId === session.id);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.state).toBe("completed");
      const events = (await restored.listEvents()).events;
      expect(
        events.filter((event) => event.type === "run.completed"),
      ).toHaveLength(1);
      if (point === "model.before_send")
        expect(runs[0]?.usage[0]?.dispatchState).toBe("not_sent");
    } finally {
      await next.close();
    }
  },
);
