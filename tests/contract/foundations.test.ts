import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseConfig,
  effectiveConfig,
  defineTool,
  normalizeSchema,
} from "@agent-runtime/sdk";
import { json, hash } from "@agent-runtime/sdk";
import { parseEvent, parseTransportEvent } from "@agent-runtime/sdk";
import { transition, RunLocks } from "@agent-runtime/sdk";
import { MemoryStore } from "@agent-runtime/testing";
const model = {
  provider: "scripted",
  baseURL: "https://model.example.com",
  apiKey: { secretRef: "test" },
  model: "test",
  limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
};
export const config = {
  models: { primary: model },
  routing: { primary: "primary" },
};
describe("M0 configuration contract", () => {
  it("defaults never supply business capabilities; declared values retain provenance", () => {
    const c = parseConfig(config);
    expect(c.tools).toEqual([]);
    expect(c.retry).toBeUndefined();
    const e = effectiveConfig(c, { retry: { model: { maxRetries: 1 } } });
    expect(e.retry!.model!.maxRetries).toBe(1);
    expect(e.loop!.maxSteps).toBe(16);
    expect(e.interaction).toBeUndefined();
  });
  it("rejects unknown fields, unsafe JSON, and non-finite values", () => {
    for (const c of [
      { ...config, cwd: "/tmp" },
      { ...config, hooks: {} },
      { ...config, metadata: { a: () => 1 } },
      { ...config, metadata: { a: Infinity } },
    ])
      expect(() => parseConfig(c)).toThrow();
    const a: unknown[] = [];
    a.push(a);
    expect(() => json(a)).toThrow();
  });
  it("converts structural Zod schemas and rejects transformations", () => {
    expect(normalizeSchema(z.object({ n: z.number().min(1) }))).toMatchObject({
      type: "object",
    });
    expect(() =>
      normalizeSchema(z.string().transform((s) => s.length)),
    ).toThrow();
  });
  it("rejects undeclared Skill tools, duplicates and invalid model aliases", () => {
    expect(() =>
      parseConfig({
        ...config,
        skills: [
          {
            id: "s",
            name: "S",
            description: "D",
            instructions: "I",
            allowedTools: ["hidden"],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseConfig({ ...config, routing: { primary: "missing" } }),
    ).toThrow();
  });
  it("rejects writes without business keys and reserved protocol names", () => {
    const t = {
      name: "write",
      description: "D",
      inputSchema: {},
      outputSchema: {},
      execution: {
        type: "binding",
        bindingKey: "write.v1",
        sideEffect: "write",
      },
    };
    expect(() => parseConfig({ ...config, tools: [t] })).toThrow();
    expect(() =>
      parseConfig({ ...config, tools: [{ ...t, name: "engine.question" }] }),
    ).toThrow();
  });
  it("applies explicit hard ceilings without silent truncation", () => {
    expect(() =>
      effectiveConfig(
        parseConfig({ ...config, retry: { model: { maxRetries: 4 } } }),
        {},
        { retry: { model: { maxRetries: 3 } } },
      ),
    ).toThrow(/ceiling/);
  });
  it("hashes canonical JSON independently of key order", () => {
    expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 }));
  });
});
describe("M0 state and events", () => {
  it("terminal states cannot reopen", () => {
    for (const s of ["completed", "failed", "cancelled"] as const)
      expect(() => transition(s, "running")).toThrow();
    expect(transition("running", "awaiting_tool_resolution")).toBe(
      "awaiting_tool_resolution",
    );
  });
  it("requires draft correlation and handles unknown transport versions separately", () => {
    const e = {
      id: "e",
      schemaVersion: "1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      sessionId: "s",
      type: "content.output.delta",
      runId: "r",
      stepId: "s",
      attemptId: "a",
      messageId: "m",
      blockId: "b",
      data: { text: "hello" },
    };
    expect(parseEvent(e)).toMatchObject({ data: { text: "hello" } });
    expect(() => parseEvent({ ...e, attemptId: undefined })).toThrow();
    expect(parseTransportEvent({ ...e, schemaVersion: "2" })).toEqual({
      unknown: true,
      id: "e",
      sequence: 1,
    });
  });
  it("serializes concurrent advancement of the same Run", async () => {
    const lock = new RunLocks();
    let active = 0,
      max = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        lock.use("r", async () => {
          active++;
          max = Math.max(max, active);
          await Promise.resolve();
          active--;
        }),
      ),
    );
    expect(max).toBe(1);
  });
  it("rolls state and events back together", async () => {
    const store = new MemoryStore();
    await store.acquire();
    await expect(
      store.transaction(async (tx) => {
        await tx.put("session", "s", { v: 1 });
        await tx.append("s", { type: "session.created", data: { version: 1 } });
        throw Error("crash");
      }),
    ).rejects.toThrow();
    expect(
      await store.transaction(async (tx) => [
        await tx.get("session", "s"),
        await tx.head("s"),
      ]),
    ).toEqual([undefined, 0]);
    await store.close();
  });
});
