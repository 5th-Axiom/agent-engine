import { expect, it } from "vitest";
import { createAgentEngine, type ModelAdapter } from "@agent-runtime/sdk";
import { FakeClock, MemoryStore } from "@agent-runtime/testing";

const modelConfig = {
  provider: "fake",
  model: "synthetic",
  baseURL: "https://model.example.com",
  apiKey: { secretRef: "test" },
  limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
};
const common = {
  principal: { tenantId: "model-deadline", subjectId: "user" },
  secrets: { resolve: async () => "synthetic" },
  policy: { allowedOrigins: ["https://model.example.com"] },
};

it.each([
  { loop: 60, attempt: 1000, idle: 1000, code: "BUDGET_EXCEEDED" },
  { loop: 1000, attempt: 60, idle: 1000, code: "MODEL_TIMEOUT" },
  { loop: 1000, attempt: 1000, idle: 60, code: "MODEL_TIMEOUT" },
])(
  "distinguishes run, attempt and idle deadlines: $loop/$attempt/$idle",
  async ({ loop, attempt, idle, code }) => {
    let requests = 0;
    const model: ModelAdapter = {
      version: "1",
      capabilities: { tools: true, thinking: false, structuredOutput: false },
      async *stream(_request, { signal }) {
        requests++;
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
        signal.throwIfAborted();
      },
    };
    const engine = await createAgentEngine({
      ...common,
      store: new MemoryStore(),
      adapters: { models: { fake: model } },
    });
    try {
      const session = await engine.createSession({
        config: {
          models: {
            p: {
              ...modelConfig,
              timeouts: { attemptMs: attempt, streamIdleMs: idle },
            },
          },
          routing: { primary: "p" },
          loop: { timeoutMs: loop },
          retry: { model: { maxRetries: 0 } },
        },
      });
      const handle = await session.startRun({ input: "wait for deadline" });
      await expect(handle.result).rejects.toMatchObject({
        code,
        retryable: code === "MODEL_TIMEOUT",
      });
      expect(requests).toBe(1);
    } finally {
      await engine.close();
    }
  },
);

it("a later model attempt receives only remaining activity time and does not retry or fall back after it expires", async () => {
  const clock = new FakeClock();
  let requests = 0;
  const model: ModelAdapter = {
    version: "1",
    capabilities: { tools: true, thinking: false, structuredOutput: false },
    async *stream(_request, { signal }) {
      requests++;
      if (requests === 1) {
        clock.advance(299940);
        yield {
          type: "completed",
          response: {
            blocks: [
              { type: "tool_call", id: "read-1", name: "read", arguments: {} },
            ],
            stopReason: "tool_calls",
          },
        };
      } else {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
      }
    },
  };
  const engine = await createAgentEngine({
    ...common,
    clock,
    store: new MemoryStore(),
    adapters: { models: { fake: model } },
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({ ok: true }),
      },
    },
  });
  try {
    const primary = {
      ...modelConfig,
      timeouts: { attemptMs: 300000, streamIdleMs: 300000 },
    };
    const session = await engine.createSession({
      config: {
        models: { p: primary, fallback: { ...primary, model: "other" } },
        routing: {
          primary: "p",
          fallbacks: ["fallback"],
          fallbackOn: ["provider_unavailable"],
        },
        loop: {
          timeoutMs: 300000,
          maxSteps: null,
          maxModelAttempts: null,
          maxCapabilityInvocations: null,
        },
        retry: { model: { maxRetries: 1 } },
        tools: [
          {
            name: "read",
            description: "Read synthetic data",
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
    const handle = await session.startRun({ input: "two steps" });
    await expect(handle.result).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
      retryable: false,
    });
    expect(requests).toBe(2);
    const run = await engine.readRun(session.id, handle.runId);
    expect(run.usage).toHaveLength(2);
    expect(run.steps.at(-1)?.attempts).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
