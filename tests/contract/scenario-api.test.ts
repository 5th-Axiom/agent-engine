import { expect, it } from "vitest";
import {
  defineSessionConfig,
  defineBoundTool,
  createAgentEngine,
  type SessionConfigInput,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";
import { z } from "zod";
const base: SessionConfigInput = {
  models: {
    p: {
      provider: "scripted",
      model: "test",
      baseURL: "https://model.example.com",
      apiKey: { secretRef: "model" },
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "p" },
};
it("authoring uses defaults and reports actionable paths without echoing values", () => {
  expect(defineSessionConfig(base).tools).toEqual([]);
  expect(() =>
    defineSessionConfig({
      ...base,
      models: {
        p: {
          ...base.models.p!,
          limits: { contextWindowTokens: -1, maxOutputTokens: 1000 },
        },
      },
    }),
  ).toThrow("models.p.limits.contextWindowTokens");
  const tool = defineBoundTool({
    name: "read",
    version: "1",
    description: "read",
    sideEffect: "read",
    inputSchema: z.object({ sku: z.string() }),
    outputSchema: z.object({ value: z.string() }),
    execute: async ({ sku }) => ({ value: sku }),
  });
  expect(JSON.stringify(tool.definition)).not.toContain("execute");
  expect(Object.keys(tool.bindings)).toEqual(["read"]);
});
it("explicit skill applies before the first request, exits without reactivation and preserves input idempotency", async () => {
  const model = scriptedModel([
    finalText("from skill"),
    toolCall("engine.skill.exit", {}),
    finalText("exited"),
  ]);
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "test", subjectId: "test" },
    secrets: { resolve: async () => "synthetic" },
    adapters: { models: { scripted: model } },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({
      config: {
        ...base,
        skills: [
          {
            id: "help",
            name: "Help",
            description: "Help",
            instructions: "Unique skill instructions",
            allowedTools: [],
          },
        ],
      },
    });
    const input = { input: "Explain", skill: "help", requestId: "one" };
    const result = await session.run(input);
    expect(
      model.requests[0]!.messages.some(
        (m) => m.content === "Unique skill instructions",
      ),
    ).toBe(true);
    expect(
      (await session.listEvents()).events.filter(
        (event) => event.type === "skill.loaded",
      ),
    ).toHaveLength(1);
    expect((await session.run(input)).runId).toBe(result.runId);
    await expect(
      session.run({ ...input, skill: undefined }),
    ).rejects.toMatchObject({ code: "RUN_REQUEST_CONFLICT" });
    await expect(
      session.run({ input: "bad", skill: "missing" }),
    ).rejects.toMatchObject({ code: "CAPABILITY_NOT_FOUND" });
    await session.run({ input: "Exit then respond", skill: "help" });
    expect(
      model.requests[2]!.messages.some(
        (m) => m.content === "Unique skill instructions",
      ),
    ).toBe(false);
  } finally {
    await engine.close();
  }
});
