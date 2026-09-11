import { it, expect } from "vitest";
import { createAgentEngine } from "@agent-runtime/sdk";
import { MemoryStore, scriptedModel, finalText } from "@agent-runtime/testing";
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
it("concurrent admissions occupy one Session slot and a config update cannot mutate its frozen Run", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = scriptedModel([]);
  model.stream = async function* () {
    await gate;
    yield* finalText("done");
  };
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "admission", subjectId: "u" },
    adapters: { models: { fake: model } },
    secrets: { resolve: async () => "synthetic" },
    limits: { maxAcceptedRuns: 1 },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  try {
    const session = await engine.createSession({ config });
    const admissions = await Promise.allSettled([
      session.startRun({ input: "first", requestId: "a", ifConfigVersion: 1 }),
      session.startRun({ input: "second", requestId: "b", ifConfigVersion: 1 }),
    ]);
    expect(
      admissions.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      admissions.filter((result) => result.status === "rejected")[0],
    ).toMatchObject({ reason: { code: "SESSION_BUSY" } });
    const accepted = admissions.find(
      (result) => result.status === "fulfilled",
    )!;
    if (accepted.status !== "fulfilled") throw Error();
    const run = await engine.readRun(session.id, accepted.value.runId);
    const revisions = await Promise.allSettled([
      session.replaceConfig({
        ifVersion: 1,
        config: { ...config, instructions: { text: "new" } },
      }),
      session.replaceConfig({
        ifVersion: 1,
        config: { ...config, instructions: { text: "other" } },
      }),
    ]);
    expect(
      revisions.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      revisions.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "CONFIG_VERSION_CONFLICT" } });
    expect(
      (await session.getEffectiveConfig({ runId: run.id })).value.instructions,
    ).toBeUndefined();
    expect((await session.getConfig()).version).toBe(2);
    const duplicate = await session.startRun({
      requestId: run.requestId,
      input: run.input,
      ifConfigVersion: 1,
    });
    expect(duplicate.runId).toBe(run.id);
    release();
    await accepted.value.result;
  } finally {
    release();
    await engine.close();
  }
});

it("a single-principal Engine does not recover another principal’s unfinished Run", async () => {
  const { FaultInjector } = await import("@agent-runtime/testing");
  const faults = new FaultInjector();
  faults.arm("model.before_send");
  const store = new MemoryStore();
  const originalModel = scriptedModel([finalText("recovered")]);
  const originalOptions = {
    store,
    principal: { tenantId: "owner", subjectId: "u" },
    adapters: { models: { fake: originalModel } },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    fault: (point: string) => faults.hit(point),
  };
  const first = await createAgentEngine(originalOptions);
  const session = await first.createSession({ config });
  const handle = await session.startRun({ requestId: "same", input: "go" });
  for (let i = 0; i < 200; i++) {
    if ((await first.readRun(session.id, handle.runId)).steps.length) break;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  await first.close();
  const foreignModel = scriptedModel([finalText("must not run")]);
  const foreign = await createAgentEngine({
    ...originalOptions,
    principal: { tenantId: "other", subjectId: "u" },
    adapters: { models: { fake: foreignModel } },
  });
  try {
    await expect(foreign.loadSession(session.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(foreignModel.requests).toHaveLength(0);
  } finally {
    await foreign.close();
  }
  const recovered = await createAgentEngine(originalOptions);
  try {
    const loaded = await recovered.loadSession(session.id);
    expect(
      (await loaded.run({ requestId: "same", input: "go" })).outputText,
    ).toBe("recovered");
  } finally {
    await recovered.close();
  }
});
