import { it, expect } from "vitest";
import { createServer } from "node:http";
import { createAgentEngine, type EngineOptions } from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
it.each([false, true])(
  "HTTP/MCP remote idempotency and frozen contract check (schema drift: %s)",
  async (drift) => {
    const seen: { method: string; token?: string }[] = [];
    const schema = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    const server = createServer(async (req, res) => {
      if (req.method === "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      let raw = "";
      for await (const c of req) raw += c;
      const b = raw ? JSON.parse(raw) : {};
      if (req.url === "/write") {
        seen.push({
          method: "http",
          token: req.headers["idempotency-key"] as string,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            executionStatus: "succeeded",
            receipt: { ok: true },
          }),
        );
        return;
      }
      if (b.id === undefined) {
        res.writeHead(202);
        res.end();
        return;
      }
      let result: unknown;
      if (b.method === "initialize")
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "synthetic-server", version: "1" },
        };
      else if (b.method === "tools/list")
        result = {
          tools: [
            {
              name: "write",
              inputSchema: drift
                ? { ...schema, required: ["changed"] }
                : schema,
            },
            {
              name: "undeclared",
              description: "must not reach the model",
              inputSchema: { type: "object" },
            },
          ],
        };
      else if (b.method === "tools/call") {
        seen.push({
          method: b.params.name,
          token: b.params.arguments.operationId,
        });
        result = {
          content: [{ type: "text", text: "confirmed" }],
          structuredContent: {
            executionStatus: "succeeded",
            receipt: { ok: true },
          },
        };
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: b.id, result }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const model = scriptedModel([
      toolCall("remote.http", { id: "a" }),
      toolCall("remote.mcp", { id: "b" }),
      finalText("done"),
    ]);
    const engine = await createAgentEngine({
      store: new MemoryStore(),
      principal: { tenantId: "t", subjectId: "u" },
      secrets: { resolve: async () => "synthetic" },
      adapters: { models: { fake: model } },
      policy: {
        allowedOrigins: [origin, "https://model.example.com"],
        allowPrivateOrigins: [origin],
      },
      remoteContracts: {
        [origin + "/write"]: {
          version: "1",
          sideEffect: "write",
          namespace: "test.remote",
        },
        [origin + "/mcp#write"]: {
          version: "1",
          sideEffect: "write",
          namespace: "test.remote",
        },
      },
      bindings: {
        key: {
          version: "1",
          sideEffect: "read",
          execute: async (input) => String((input as any).input.id),
        },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => "allow",
        },
      },
    });
    const common = {
      description: "Explicit remote write",
      inputSchema: schema,
      outputSchema: { type: "object" },
      permission: "allow",
    };
    const idempotency = {
      required: true,
      namespace: "test.remote",
      businessKey: { type: "binding", bindingKey: "key" },
    };
    const session = await engine.createSession({
      config: {
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
            ...common,
            name: "remote.http",
            execution: {
              type: "http",
              endpoint: origin + "/write",
              sideEffect: "write",
              idempotency,
              idempotencyHeader: "Idempotency-Key",
            },
          },
          {
            ...common,
            name: "remote.mcp",
            execution: {
              type: "mcp",
              endpoint: origin + "/mcp",
              sideEffect: "write",
              remoteToolName: "write",
              transport: "streamable-http",
              idempotency,
              idempotencyArgument: "operationId",
            },
          },
        ],
      },
    });
    const handle = await session.startRun({ input: "go" });
    expect((await handle.result).outputText).toBe("done");
    expect(seen).toHaveLength(drift ? 1 : 2);
    if (drift)
      expect(JSON.stringify(model.requests)).toContain(
        "RECOVERY_DEPENDENCY_MISMATCH",
      );
    expect(
      seen.every((s) => typeof s.token === "string" && s.token.length === 64),
    ).toBe(true);
    expect(JSON.stringify(model.requests)).not.toContain(
      "must not reach the model",
    );
    await engine.close();
    await new Promise<void>((r) => server.close(() => r()));
  },
);
