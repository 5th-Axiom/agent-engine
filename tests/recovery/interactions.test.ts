import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createAgentEngine,
  PostgresStore,
  type EngineOptions,
  type PendingInput,
} from "@agent-runtime/sdk";
import {
  scriptedModel,
  toolCall,
  finalText,
  FakeClock,
  FaultInjector,
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
};
it.each([false, true])(
  "a persisted structured form resumes or expires after restart (expired: %s)",
  async (expired) => {
    const clock = new FakeClock(),
      model = scriptedModel([
        toolCall("engine.form.details", { question: "Provide details" }),
        finalText("done"),
      ]);
    const opts: Omit<EngineOptions, "store"> = {
      clock,
      principal: { tenantId: randomUUID(), subjectId: "u" },
      secrets: { resolve: async () => "synthetic" },
      adapters: { models: { fake: model } },
      policy: { allowedOrigins: ["https://model.example.com"] },
    };
    const store = db();
    await store.migrate();
    const first = await createAgentEngine({ ...opts, store });
    const session = await first.createSession({
      config: {
        ...config,
        interaction: {
          structuredInputs: [
            {
              id: "details",
              description: "Details",
              answerSchema: {
                type: "object",
                properties: { count: { type: "integer" } },
                required: ["count"],
                additionalProperties: false,
              },
              timeoutMs: 1000,
            },
          ],
        },
      },
    });
    const handle = await session.startRun({ requestId: "same", input: "go" });
    let pending: PendingInput | undefined;
    for (let i = 0; i < 200; i++) {
      pending = (await session.getRun(handle.runId)).pending;
      if (pending) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(pending?.kind).toBe("structured_input");
    await first.close();
    if (expired) clock.advance(1001);
    const next = await createAgentEngine({ ...opts, store: db() });
    try {
      const loaded = await next.loadSession(session.id);
      const resumed = await loaded.startRun({ requestId: "same", input: "go" });
      const response = { kind: "structured_input", answer: { count: 2 } };
      if (expired) {
        await expect(resumed.result).rejects.toMatchObject({
          code: "INPUT_EXPIRED",
        });
        expect(
          (await loaded.listEvents()).events.filter(
            (event) => event.type === "input.expired",
          ),
        ).toHaveLength(1);
        expect(model.requests).toHaveLength(1);
      } else {
        await expect(
          loaded.resolveInput(pending!.id, {
            kind: "structured_input",
            answer: { count: "bad" },
          }),
        ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
        await Promise.all([
          loaded.resolveInput(pending!.id, response),
          loaded.resolveInput(pending!.id, response),
        ]);
        expect((await resumed.result).outputText).toBe("done");
        await loaded.resolveInput(pending!.id, response);
        await expect(
          loaded.resolveInput(pending!.id, {
            ...response,
            answer: { count: 3 },
          }),
        ).rejects.toMatchObject({ code: "INPUT_ALREADY_RESOLVED" });
        expect(
          (await loaded.listEvents()).events.filter(
            (event) => event.type === "input.resolved",
          ),
        ).toHaveLength(1);
        expect(model.requests).toHaveLength(2);
      }
    } finally {
      await next.close();
    }
  },
);
it("Skill activation and pinned loader content survive recovery before the following model request", async () => {
  let loads = 0,
    sends = 0,
    hit!: () => void;
  const reached = new Promise<void>((resolve) => {
    hit = resolve;
  });
  const faults = new FaultInjector();
  faults.arm("skill-checkpoint");
  const model = scriptedModel([
    toolCall("engine.skill.select", { id: "guide" }),
    (request) => {
      expect(
        request.messages.some(
          (message) => message.content === "Pinned instructions",
        ),
      ).toBe(true);
      return toolCall("engine.skill.exit", {});
    },
    finalText("done"),
  ]);
  const opts: Omit<EngineOptions, "store"> = {
    principal: { tenantId: randomUUID(), subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    adapters: { models: { fake: model } },
    bindings: {
      loader: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          loads++;
          return { version: "v1", instructions: "Pinned instructions" };
        },
      },
    },
    fault: (point) => {
      if (point === "model.before_send" && ++sends === 2) {
        hit();
        faults.hit("skill-checkpoint");
      }
    },
  };
  const store = db();
  await store.migrate();
  const first = await createAgentEngine({ ...opts, store });
  const session = await first.createSession({
    config: {
      ...config,
      skills: [
        {
          id: "guide",
          name: "Guide",
          description: "Guide",
          source: { type: "loader", loaderKey: "loader", version: "v1" },
          allowedTools: [],
        },
      ],
    },
  });
  await session.startRun({ requestId: "skill", input: "go" });
  await reached;
  await first.close();
  const next = await createAgentEngine({ ...opts, store: db() });
  try {
    const loaded = await next.loadSession(session.id);
    expect(
      (await loaded.run({ requestId: "skill", input: "go" })).outputText,
    ).toBe("done");
    expect(loads).toBe(1);
    expect(
      (await loaded.listEvents()).events.filter(
        (event) => event.type === "skill.exited",
      ),
    ).toHaveLength(1);
  } finally {
    await next.close();
  }
});
