import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  createAgentEngine,
  PostgresStore,
  type SessionRecord,
  type RunRecord,
  type OperationRecord,
} from "@agent-runtime/sdk";
import { scriptedModel, finalText } from "@agent-runtime/testing";

it("SIGKILL after a real HTTP write leaves an unknown operation that requires evidence without replay", async () => {
  const url =
    process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test";
  const tenantId = randomUUID();
  let writes = 0;
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
      /* drain the synthetic request */
    }
    writes++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ executionStatus: "succeeded", receipt: { ok: true } }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let engine: Awaited<ReturnType<typeof createAgentEngine>> | undefined;
  try {
    const schemaStore = PostgresStore.fromConnectionString(url);
    await schemaStore.migrate();
    await schemaStore.close();
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/recovery/process-child.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AGENT_TEST_DATABASE_URL: url,
          CRASH_TEST_TENANT: tenantId,
          CRASH_TEST_ORIGIN: origin,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    const exit = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }).finally(() => clearTimeout(timer));
    expect(stderr).toBe("");
    expect(exit).toEqual({ code: null, signal: "SIGKILL" });
    expect(writes).toBe(1);
    const store = PostgresStore.fromConnectionString(url);
    engine = await createAgentEngine({
      store,
      principal: { tenantId, subjectId: "user" },
      secrets: { resolve: async () => "synthetic" },
      adapters: {
        models: { scripted: scriptedModel([finalText("recovered")]) },
      },
      policy: {
        allowedOrigins: [origin, "https://model.example.com"],
        allowPrivateOrigins: [origin],
      },
      remoteContracts: {
        [origin + "/write"]: {
          version: "1",
          sideEffect: "write",
          namespace: "process.crash",
        },
      },
      bindings: {
        key: { version: "1", sideEffect: "read", execute: async () => "one" },
        policy: {
          version: "1",
          sideEffect: "read",
          execute: async () => "allow",
        },
      },
    });
    const record = await store.transaction(async (tx) =>
      (await tx.list<SessionRecord>("sessions")).find(
        (s) => s.principal.tenantId === tenantId,
      )!,
    );
    const session = await engine.loadSession(record.id);
    let run: RunRecord | undefined;
    for (let i = 0; i < 200; i++) {
      run = await store.transaction(async (tx) =>
        (await tx.list<RunRecord>("runs")).find(
          (r) => r.sessionId === record.id,
        ),
      );
      if (run?.state === "awaiting_tool_resolution") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(run?.state).toBe("awaiting_tool_resolution");
    const operation = await store.transaction(async (tx) =>
      (await tx.list<OperationRecord>("operations")).find(
        (o) => o.tenantId === tenantId,
      )!,
    );
    expect(operation.executionStatus).toBe("outcome_unknown");
    await session.resolveOperationOutcome(operation.id, {
      outcome: "succeeded",
      evidenceRef: "local-server-receipt",
      receipt: { ok: true },
    });
    expect(
      (await session.run({ requestId: "crash", input: "write once" }))
        .outputText,
    ).toBe("recovered");
    expect(writes).toBe(1);
  } finally {
    await engine?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
