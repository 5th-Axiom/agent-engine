import { createServer } from "node:http";
import { z } from "zod";
import { type ToolDefinition } from "@agent-runtime/sdk";
import { searchArticles, type Article } from "./content.js";
const querySchema = {
  type: "object",
  properties: { query: { type: "string", minLength: 1, maxLength: 240 } },
  required: ["query"],
  additionalProperties: false,
};
/** Actual loopback HTTP/MCP services over public documentation, never arbitrary URLs. */
export async function startDocsRemoteCapabilities(
  articles: Article[],
  port = 0,
) {
  let origin = "";
  const catalog = () => ({
    items: articles.map((a) => ({
      id: a.id,
      title: a.title,
      url: "/docs/" + a.id + "/",
    })),
  });
  const search = (input: unknown) => {
    const v = z.object({ query: z.string().min(1).max(240) }).parse(input);
    return {
      items: searchArticles(articles, v.query, 3).map((a) => ({
        title: a.title,
        url: a.url,
        excerpt: a.excerpt.slice(0, 1000),
      })),
    };
  };
  const server = createServer((req, res) => {
    void (async () => {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      if (req.headers.host !== new URL(origin).host || req.headers.origin) {
        res.writeHead(403).end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 16384) {
          res.writeHead(413).end();
          return;
        }
      }
      const value = JSON.parse(raw || "{}");
      if (req.url === "/catalog") {
        z.object({}).strict().parse(value);
        res.end(JSON.stringify(catalog()));
        return;
      }
      if (req.url !== "/mcp") {
        res.writeHead(404).end();
        return;
      }
      if (
        value.id === undefined &&
        value.method === "notifications/initialized"
      ) {
        res.writeHead(202).end();
        return;
      }
      let result: unknown;
      if (value.method === "initialize")
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "Agent Engine public docs", version: "1" },
        };
      else if (value.method === "tools/list")
        result = {
          tools: [
            {
              name: "search_manual",
              description: "Search public documentation",
              inputSchema: querySchema,
            },
          ],
        };
      else if (
        value.method === "tools/call" &&
        value.params?.name === "search_manual"
      )
        result = {
          content: [],
          structuredContent: search(value.params.arguments),
        };
      else {
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: value.id ?? null,
            error: { code: -32601, message: "Method not found" },
          }),
        );
        return;
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: value.id, result }));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(400);
      res.end(JSON.stringify({ error: { code: "INVALID_INPUT" } }));
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = "http://127.0.0.1:" + (server.address() as any).port;
  const tools: ToolDefinition[] = [
    {
      name: "docs.httpCatalog",
      description: "通过本地 HTTP 执行器读取本站公开文章目录。",
      inputSchema: { type: "object", additionalProperties: false },
      outputSchema: { type: "object" },
      execution: {
        type: "http",
        endpoint: origin + "/catalog",
        sideEffect: "read",
        timeoutMs: 3000,
      },
    },
    {
      name: "docs.mcpSearch",
      description: "通过已连接的 MCP 服务搜索本站公开手册，使用短关键词。",
      inputSchema: querySchema,
      outputSchema: { type: "object" },
      execution: {
        type: "mcp",
        endpoint: origin + "/mcp",
        remoteToolName: "search_manual",
        transport: "streamable-http",
        sideEffect: "read",
        timeoutMs: 3000,
      },
    },
  ];
  return {
    origin,
    tools,
    contracts: {
      [origin + "/catalog"]: { version: "1", sideEffect: "read" as const },
      [origin + "/mcp#search_manual"]: {
        version: "1",
        sideEffect: "read" as const,
      },
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      }),
  };
}
