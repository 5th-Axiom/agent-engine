import { it, expect } from "vitest";
import { createAgentEngine, AgentEngineError } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  FakeClock,
} from "@agent-runtime/testing";
const primary = {
  provider: "fake",
  model: "same-model",
  baseURL: "https://primary.example",
  apiKey: { secretRef: "primary" },
  limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
};
it("fallback supports another authorized target for the same model and preserves per-Attempt snapshots", async () => {
  const model = scriptedModel([
    [{ type: "failed", error: new AgentEngineError("MODEL_AUTH_FAILED") }],
    finalText("fallback"),
    finalText("primary again"),
  ]);
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "fallback", subjectId: "u" },
    clock: new FakeClock(),
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: {
      allowedModelTargets: [
        {
          provider: "fake",
          origin: "https://primary.example",
          credentialScopes: ["primary"],
        },
        {
          provider: "fake",
          origin: "https://backup.example",
          credentialScopes: ["backup"],
        },
      ],
    },
  });
  try {
    const session = await engine.createSession({
      config: {
        models: {
          p: primary,
          b: {
            ...primary,
            baseURL: "https://backup.example",
            apiKey: { secretRef: "backup" },
          },
        },
        routing: {
          primary: "p",
          fallbacks: ["b"],
          fallbackOn: ["auth_failed"],
        },
        retry: { model: { maxRetries: 1 } },
      },
    });
    const result = await session.run({ input: "first" });
    expect(result.outputText).toBe("fallback");
    const stored = await engine.readRun(session.id, result.runId);
    expect(
      Object.values(stored.steps[0]!.attemptRequests!).map(
        (snapshot) => snapshot.request.model.baseURL,
      ),
    ).toEqual(["https://primary.example", "https://backup.example"]);
    await session.run({ input: "next" });
    expect(model.requests.at(-1)?.model.baseURL).toBe(
      "https://primary.example",
    );
    await expect(
      engine.createSession({
        config: {
          models: { p: { ...primary, apiKey: { secretRef: "backup" } } },
          routing: { primary: "p" },
        },
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  } finally {
    await engine.close();
  }
});
it("a smaller fallback window is checked before any fallback request is sent", async () => {
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
    finalText("must not send"),
  ]);
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "small", subjectId: "u" },
    clock: new FakeClock(),
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://primary.example"] },
  });
  try {
    const session = await engine.createSession({
      config: {
        models: {
          p: primary,
          b: {
            ...primary,
            model: "small",
            limits: { contextWindowTokens: 1800, maxOutputTokens: 1000 },
          },
        },
        routing: {
          primary: "p",
          fallbacks: ["b"],
          fallbackOn: ["provider_unavailable"],
        },
        retry: { model: { maxRetries: 1 } },
      },
    });
    await expect(
      session.run({ input: "X".repeat(1200) }),
    ).rejects.toMatchObject({ code: "CONTEXT_BUDGET_EXCEEDED" });
    expect(model.requests).toHaveLength(1);
  } finally {
    await engine.close();
  }
});
