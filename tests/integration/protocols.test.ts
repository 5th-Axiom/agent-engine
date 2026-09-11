import { it, expect } from "vitest";
import { createServer } from "node:http";
import { createAgentEngine } from "@agent-runtime/sdk";
import { MemoryStore } from "@agent-runtime/testing";
async function server(handler: (body: any) => string) {
  const requests: any[] = [];
  const s = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const value = JSON.parse(body);
    requests.push(value);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(handler(value));
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const address = s.address() as { port: number };
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((r) => s.close(() => r())),
  };
}
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
it("standard OpenAI-compatible provider is selected automatically and parses SSE usage", async () => {
  const s = await server(
    () =>
      frame({
        choices: [{ delta: { content: "hello" }, finish_reason: null }],
      }) +
      frame({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
      frame({
        choices: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          prompt_tokens_details: { cached_tokens: 0 },
          completion_tokens_details: { reasoning_tokens: 0 },
        },
      }) +
      "data: [DONE]\n\n",
  );
  const e = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "u" },
    secrets: { resolve: async () => "synthetic-token" },
    policy: { allowedOrigins: [s.origin], allowPrivateOrigins: [s.origin] },
  });
  const session = await e.createSession({
    config: {
      models: {
        p: {
          provider: "openai-compatible",
          model: "test",
          baseURL: s.origin + "/v1",
          apiKey: { secretRef: "test" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "p" },
    },
  });
  const result = await session.run({ input: "Hi" });
  expect(result.outputText).toBe("hello");
  expect((await e.usage.getRun(result.runId)).knownTotals.total).toBe(12);
  expect(s.requests[0].stream).toBe(true);
  await e.close();
  await s.close();
});
it("Anthropic Thinking native signature survives a tool round trip and is absent from public events", async () => {
  let count = 0;
  const nativeSignature = "synthetic-native-signature";
  const s = await server((body) => {
    const start = frame({
      type: "message_start",
      message: { usage: { input_tokens: 10, output_tokens: 0 } },
    });
    if (count++ === 0)
      return (
        start +
        frame({
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        }) +
        frame({
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "thinking_delta",
            thinking: "private synthetic reasoning",
          },
        }) +
        frame({
          type: "content_block_delta",
          index: 0,
          delta: { type: "signature_delta", signature: nativeSignature },
        }) +
        frame({ type: "content_block_stop", index: 0 }) +
        frame({
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "c",
            name: body.tools[0].name,
            input: {},
          },
        }) +
        frame({ type: "content_block_stop", index: 1 }) +
        frame({
          type: "message_delta",
          delta: { stop_reason: "tool_use" },
          usage: { output_tokens: 5 },
        }) +
        frame({ type: "message_stop" })
      );
    return (
      start +
      frame({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }) +
      frame({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "done" },
      }) +
      frame({ type: "content_block_stop", index: 0 }) +
      frame({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 2 },
      }) +
      frame({ type: "message_stop" })
    );
  });
  const store = new MemoryStore();
  const e = await createAgentEngine({
    store,
    principal: { tenantId: "t", subjectId: "u" },
    secrets: { resolve: async () => "synthetic-protection-key" },
    protocolKey: { secretRef: "protocol" },
    policy: { allowedOrigins: [s.origin], allowPrivateOrigins: [s.origin] },
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => ({ ok: true }),
      },
    },
  });
  const session = await e.createSession({
    config: {
      models: {
        p: {
          provider: "anthropic-compatible",
          model: "test",
          baseURL: s.origin,
          apiKey: { secretRef: "test" },
          thinking: { enabled: true, budgetTokens: 1024, expose: "none" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 2000 },
        },
      },
      routing: { primary: "p" },
      tools: [
        {
          name: "read",
          description: "Read data",
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
  expect((await session.run({ input: "go" })).outputText).toBe("done");
  expect(JSON.stringify(s.requests[1])).toContain(nativeSignature);
  expect(JSON.stringify((await session.listEvents()).events)).not.toContain(
    nativeSignature,
  );
  expect(
    JSON.stringify(await store.transaction((tx) => tx.list("runs"))),
  ).not.toContain(nativeSignature);
  await e.close();
  await s.close();
});

it.each([
  ["refusal", "openai-compatible", "MODEL_REFUSED"],
  ["truncated-tool", "openai-compatible", "MODEL_OUTPUT_LIMIT"],
  ["unclosed-block", "anthropic-compatible", "MODEL_PROTOCOL_ERROR"],
  [
    "missing-signature",
    "anthropic-compatible",
    "MODEL_CONTINUATION_UNAVAILABLE",
  ],
] as const)(
  "%s cannot commit a tool call or produce a successful Run",
  async (scenario, provider, code) => {
    let calls = 0,
      requests = 0;
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      requests++;
      const emit = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
      let output = "";
      if (provider === "openai-compatible") {
        const delta =
          scenario === "refusal"
            ? { refusal: "Cannot comply", content: "Do not treat as success" }
            : {
                tool_calls: [
                  {
                    index: 0,
                    id: "c",
                    function: {
                      name: body.tools[0].function.name,
                      arguments: '{"incomplete":',
                    },
                  },
                ],
              };
        output =
          emit({ choices: [{ delta, finish_reason: null }] }) +
          emit({
            choices: [
              {
                delta: {},
                finish_reason: scenario === "refusal" ? "stop" : "length",
              },
            ],
          }) +
          "data: [DONE]\n\n";
      } else {
        output =
          emit({
            type: "message_start",
            message: { usage: { input_tokens: 1, output_tokens: 0 } },
          }) +
          emit({
            type: "content_block_start",
            index: 0,
            content_block:
              scenario === "missing-signature"
                ? { type: "thinking", thinking: "synthetic private block" }
                : {
                    type: "tool_use",
                    id: "c",
                    name: body.tools[0].name,
                    input: {},
                  },
          });
        if (scenario === "missing-signature")
          output += emit({ type: "content_block_stop", index: 0 });
        output +=
          emit({
            type: "message_delta",
            delta: {
              stop_reason:
                scenario === "missing-signature" ? "end_turn" : "tool_use",
            },
            usage: { output_tokens: 1 },
          }) + emit({ type: "message_stop" });
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(output);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const engine = await createAgentEngine({
      store: new MemoryStore(),
      principal: { tenantId: scenario, subjectId: "u" },
      secrets: { resolve: async () => "synthetic" },
      protocolKey: { secretRef: "protocol" },
      policy: { allowedOrigins: [origin], allowPrivateOrigins: [origin] },
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
    });
    try {
      const session = await engine.createSession({
        config: {
          models: {
            p: {
              provider,
              model: "synthetic",
              baseURL: origin,
              apiKey: { secretRef: "test" },
              limits: { contextWindowTokens: 32000, maxOutputTokens: 2000 },
              ...(provider === "anthropic-compatible"
                ? {
                    thinking: {
                      enabled: true,
                      budgetTokens: 1024,
                      expose: "none",
                    },
                  }
                : {}),
            },
          },
          routing: { primary: "p" },
          retry: { model: { maxRetries: 0 } },
          tools: [
            {
              name: "record.read",
              description: "Synthetic",
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
      await expect(session.run({ input: "go" })).rejects.toMatchObject({
        code,
      });
      expect(calls).toBe(0);
      expect(requests).toBe(1);
      expect(
        (await session.listEvents()).events.some(
          (e) => e.type === "content.message.committed",
        ),
      ).toBe(false);
    } finally {
      await engine.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
