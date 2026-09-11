export { MemoryStore } from "./memory-store.js";
import type {
  ModelAdapter,
  ModelRequest,
  ModelStreamEvent,
  Clock,
} from "@agent-runtime/sdk";
import { AgentEngineError } from "@agent-runtime/sdk";
export function scriptedModel(
  script: (
    ModelStreamEvent[] | ((request: ModelRequest) => ModelStreamEvent[])
  )[],
): ModelAdapter & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  return {
    version: "scripted-1",
    capabilities: { tools: true, thinking: true, structuredOutput: true },
    requests,
    async *stream(request, ctx) {
      requests.push(structuredClone(request));
      const next = script.shift();
      if (!next)
        throw new AgentEngineError("MODEL_PROVIDER_ERROR", "Script exhausted");
      for (const event of typeof next === "function" ? next(request) : next) {
        ctx.signal.throwIfAborted();
        yield event;
      }
    },
  };
}
export const finalText = (text: string): ModelStreamEvent[] => [
  {
    type: "completed",
    response: { blocks: [{ type: "text", text }], stopReason: "final" },
  },
];
export const toolCall = (
  name: string,
  args: import("@agent-runtime/sdk").JsonValue,
  id = "call-1",
): ModelStreamEvent[] => [
  {
    type: "completed",
    response: {
      blocks: [{ type: "tool_call", name, arguments: args, id }],
      stopReason: "tool_calls",
    },
  },
];
export class FakeClock implements Clock {
  private time = 0;
  now() {
    return this.time;
  }
  random() {
    return 0.5;
  }
  async sleep(ms: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.time += ms;
  }
  advance(ms: number) {
    this.time += ms;
  }
}
export class FaultInjector {
  private points = new Map<string, number>();
  arm(point: string, times = 1) {
    this.points.set(point, times);
  }
  hit(point: string) {
    const n = this.points.get(point) ?? 0;
    if (n) {
      this.points.set(point, n - 1);
      throw new SimulatedCrash(point);
    }
  }
}
export class SimulatedCrash extends Error {
  constructor(point: string) {
    super(point);
    this.name = "SimulatedCrash";
  }
}
export function fakeCapability<T>(value: T) {
  const calls: unknown[] = [];
  return {
    calls,
    execute: async (input: unknown) => {
      calls.push(structuredClone(input));
      return structuredClone(value);
    },
  };
}

import {
  createAgentEngine,
  type EngineOptions,
  type BindingContract,
  type JsonValue,
} from "@agent-runtime/sdk";
import { MemoryStore } from "./memory-store.js";
export function fakeTool(
  value: JsonValue,
  contract: Pick<BindingContract, "version" | "sideEffect" | "namespace"> = {
    version: "fake-1",
    sideEffect: "read",
  },
): BindingContract {
  return { ...contract, execute: async () => structuredClone(value) };
}
export async function createEngineTestHarness(input: {
  model: ModelAdapter;
  bindings?: Record<string, BindingContract>;
  store?: EngineOptions["store"];
  principal?: EngineOptions["principal"];
  authorize?: EngineOptions["authorize"];
}) {
  const bindingCalls = new Map<string, JsonValue[]>();
  const bindings = Object.fromEntries(
    Object.entries(input.bindings ?? {}).map(([key, binding]) => [
      key,
      {
        ...binding,
        execute: async (
          value: JsonValue,
          context: Parameters<BindingContract["execute"]>[1],
        ) => {
          const calls = bindingCalls.get(key) ?? [];
          calls.push(structuredClone(value));
          bindingCalls.set(key, calls);
          return binding.execute(value, context);
        },
      },
    ]),
  );
  const engine = await createAgentEngine({
    store: input.store ?? new MemoryStore(),
    principal: input.principal ?? {
      tenantId: "test-tenant",
      subjectId: "test-user",
    },
    secrets: { resolve: async () => "synthetic-test-secret" },
    adapters: { models: { scripted: input.model } },
    bindings,
    authorize: input.authorize,
    clock: new FakeClock(),
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  return {
    engine,
    modelConfig: {
      models: {
        primary: {
          provider: "scripted",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "test" },
          model: "scripted",
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "primary" },
    },
    calls: {
      forBinding: (key: string) => structuredClone(bindingCalls.get(key) ?? []),
    },
    close: () => engine.close(),
  };
}
