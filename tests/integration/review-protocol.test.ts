import { it, expect } from "vitest";
import { createServer } from "node:http";
import { createAgentEngine } from "@agent-runtime/sdk";
import { MemoryStore } from "@agent-runtime/testing";
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
it.each([
  "thinking",
  "text",
  "ping",
  "unknown-tool",
  "overfull-batch",
  "partial-usage",
])("standard protocol handles %s at the engine boundary", async (kind) => {
  let requests = 0,
    toolCalls = 0;
  const requestsSeen: any[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requestsSeen.push(body);
    requests++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (v: unknown) => {
      if (!res.destroyed) res.write(frame(v));
    };
    if (["thinking", "text", "ping"].includes(kind)) {
      send({
        type: "message_start",
        message: { usage: { input_tokens: 10, output_tokens: 0 } },
      });
      const thinking = kind === "thinking";
      send({
        type: "content_block_start",
        index: 0,
        content_block: thinking
          ? { type: "thinking", thinking: "" }
          : { type: "text", text: "" },
      });
      let n = 0;
      const timer = setInterval(() => {
        send(
          kind === "ping"
            ? { type: "ping" }
            : {
                type: "content_block_delta",
                index: 0,
                delta: thinking
                  ? { type: "thinking_delta", thinking: "PRIVATE_THINKING" }
                  : { type: "text_delta", text: "hello" },
              },
        );
        if (++n === 10) {
          clearInterval(timer);
          if (thinking)
            send({
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "signature_delta",
                signature: "synthetic-signature",
              },
            });
          send({ type: "content_block_stop", index: 0 });
          if (thinking) {
            send({
              type: "content_block_start",
              index: 1,
              content_block: { type: "text", text: "done" },
            });
            send({ type: "content_block_stop", index: 1 });
          }
          send({
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 10 },
          });
          send({ type: "message_stop" });
          res.end();
        }
      }, 25);
      timers.push(timer);
      res.on("close", () => clearInterval(timer));
    } else if (kind === "partial-usage") {
      res.end(
        frame({
          choices: [{ delta: { content: "done" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens_details: { cached_tokens: 3 },
            completion_tokens: 2,
          },
        }) + "data: [DONE]\n\n",
      );
    } else if (requests === 1) {
      const calls = Array.from(
        { length: kind === "overfull-batch" ? 17 : 1 },
        (_, index) => ({
          index,
          id: "c" + index,
          type: "function",
          function: {
            name:
              kind === "unknown-tool"
                ? "undeclared"
                : body.tools[0].function.name,
            arguments: "{}",
          },
        }),
      );
      res.end(
        frame({
          choices: [
            { delta: { tool_calls: calls }, finish_reason: "tool_calls" },
          ],
        }) + "data: [DONE]\n\n",
      );
    } else
      res.end(
        frame({
          choices: [{ delta: { content: "repaired" }, finish_reason: "stop" }],
        }) + "data: [DONE]\n\n",
      );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "review", subjectId: "u" },
    secrets: { resolve: async () => "synthetic-protection-key" },
    protocolKey: { secretRef: "synthetic" },
    policy: { allowedOrigins: [origin], allowPrivateOrigins: [origin] },
    bindings: {
      read: {
        version: "1",
        sideEffect: "read",
        execute: async () => {
          toolCalls++;
          return {};
        },
      },
    },
  });
  try {
    const progress = ["thinking", "text", "ping"].includes(kind);
    const session = await engine.createSession({
      config: {
        models: {
          p: {
            provider: progress ? "anthropic-compatible" : "openai-compatible",
            model: "synthetic",
            baseURL: origin,
            apiKey: { secretRef: "synthetic" },
            limits: { contextWindowTokens: 32000, maxOutputTokens: 2000 },
            timeouts: { attemptMs: 3000, streamIdleMs: 100 },
            ...(kind === "thinking"
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
        retry: {
          model: { maxRetries: 0 },
          toolInputRepair: { maxAttempts: 2 },
        },
        tools: progress
          ? []
          : [
              {
                name: "read",
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
    if (kind === "ping")
      await expect(session.run({ input: "go" })).rejects.toMatchObject({
        code: "MODEL_TIMEOUT",
      });
    else {
      const result = await session.run({ input: "go" });
      expect(result.outputText).toBe(
        kind === "text"
          ? "hello".repeat(10)
          : progress || kind === "partial-usage"
            ? "done"
            : "repaired",
      );
      if (kind === "partial-usage") {
        const usage = await engine.usage.getRun(result.runId);
        expect(usage.knownTotals.cacheReadInput).toBe(3);
        expect(usage.complete).toBe(false);
      }
    }
    expect(toolCalls).toBe(0);
    expect(requests).toBe(progress || kind === "partial-usage" ? 1 : 2);
    expect(JSON.stringify((await session.listEvents()).events)).not.toContain(
      "PRIVATE_THINKING",
    );
    if (kind === "overfull-batch" || kind === "unknown-tool")
      expect(JSON.stringify(requestsSeen[1])).toContain(
        kind === "overfull-batch"
          ? "TOOL_INPUT_INVALID"
          : "CAPABILITY_NOT_FOUND",
      );
  } finally {
    await engine.close();
    timers.forEach(clearInterval);
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
