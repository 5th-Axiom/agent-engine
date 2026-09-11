import { secureFetch } from "../model/network.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Execution } from "../config/schema.js";
import {
  hash,
  json,
  type JsonValue,
  type JsonObject,
} from "../protocol/json.js";
import { AgentEngineError, fail } from "../errors/index.js";
export async function executeMcp(
  execution: Extract<Execution, { type: "mcp" }>,
  input: JsonValue,
  operationId: string,
  signal: AbortSignal,
  secret?: string,
  expectedSchema?: JsonValue,
  allowPrivate = false,
): Promise<JsonValue> {
  const client = new Client(
    { name: "agent-engine", version: "0.1.0" },
    { capabilities: {} },
  );
  const target = new URL(execution.endpoint);
  const transport = new StreamableHTTPClientTransport(target, {
    requestInit: {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal,
      redirect: "error",
    },
    fetch: async (url, init) => {
      if (new URL(String(url)).origin !== target.origin) fail("ACCESS_DENIED");
      return secureFetch(
        url as string,
        { ...init, redirect: "error", signal },
        allowPrivate,
      );
    },
  });
  let invoked = false;
  try {
    await client.connect(transport);
    const listing = await client.listTools();
    const declared = listing.tools.find(
      (t) => t.name === execution.remoteToolName,
    );
    if (!declared) fail("CAPABILITY_NOT_FOUND");
    const visibleSchema = structuredClone(declared.inputSchema);
    if (
      execution.idempotencyArgument &&
      visibleSchema.properties?.[execution.idempotencyArgument]
    ) {
      delete visibleSchema.properties[execution.idempotencyArgument];
      if (visibleSchema.required)
        visibleSchema.required = visibleSchema.required.filter(
          (key) => key !== execution.idempotencyArgument,
        );
    }
    if (expectedSchema && hash(visibleSchema) !== hash(expectedSchema))
      fail("RECOVERY_DEPENDENCY_MISMATCH", "MCP schema changed");
    if (
      execution.idempotencyArgument &&
      Object.hasOwn(input as object, execution.idempotencyArgument)
    )
      fail("TOOL_INPUT_INVALID", "Reserved idempotency argument");
    const argumentsValue = {
      ...(input as JsonObject),
      ...(execution.idempotencyArgument
        ? { [execution.idempotencyArgument]: operationId }
        : {}),
    };
    signal.throwIfAborted();
    invoked = true;
    const result = await client.callTool(
      { name: execution.remoteToolName, arguments: argumentsValue },
      undefined,
      { signal, timeout: execution.timeoutMs ?? 10000 },
    );
    if (result.isError)
      throw new AgentEngineError(
        "TOOL_EXECUTION_FAILED",
        "MCP tool reported an error",
      );
    const value = result.structuredContent ?? { content: result.content };
    if (execution.sideEffect === "write") {
      const receipt = value as Record<string, unknown>;
      if (
        receipt.executionStatus !== "succeeded" ||
        receipt.receipt === undefined
      )
        fail("TOOL_OUTCOME_UNKNOWN");
      return json(receipt.receipt);
    }
    return json(value);
  } catch (error) {
    if (!invoked) {
      const code =
        error instanceof AgentEngineError
          ? error.code
          : "TOOL_EXECUTION_FAILED";
      throw new AgentEngineError(
        code,
        "MCP rejected before business dispatch",
        false,
        "safe",
      );
    }
    throw error;
  } finally {
    await client.close().catch(() => {});
  }
}
