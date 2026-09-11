import { createServer } from "node:http";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createAgentEngine,
  PostgresStore,
  prometheusExporter,
  AgentEngineError,
  type TelemetryConfig,
} from "@agent-runtime/sdk";
import { scriptedModel, finalText } from "@agent-runtime/testing";
// Local external-system demonstration: scrape metrics and receive sanitized spans/logs.
// Production hosts can map these callbacks to their existing OTel/monitoring SDKs.
const metrics = prometheusExporter(),
  spans: unknown[] = [],
  logs: { code: string }[] = [];
const sink = createServer(async (req, res) => {
  if (req.url === "/metrics") {
    res.setHeader("content-type", "text/plain; version=0.0.4");
    res.end(metrics.render());
    return;
  }
  let body = "";
  for await (const part of req) body += part;
  const value = JSON.parse(body);
  if (req.url === "/traces") spans.push(value);
  else if (req.url === "/logs") logs.push(value);
  res.end("OK");
});
await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(sink.address() as { port: number }).port}`;
const post = async (path: string, value: unknown) => {
  const res = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  assert.equal(res.status, 200);
  await res.text();
};
const telemetry: TelemetryConfig = {
  metrics,
  health: (healthy) => metrics.health(healthy),
  traces: { export: (span) => post("/traces", span) },
  logs: { write: (record) => post("/logs", record) },
};
const store = PostgresStore.fromConnectionString(
  process.env.AGENT_TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:55439/agent_engine_test",
);
await store.migrate();
const engine = await createAgentEngine({
  store,
  principal: { tenantId: randomUUID(), subjectId: "monitoring-example" },
  secrets: { resolve: async () => "synthetic" },
  telemetry,
  policy: { allowedOrigins: ["https://model.example.com"] },
  adapters: {
    models: {
      fake: scriptedModel([
        [
          {
            type: "failed",
            error: new AgentEngineError("MODEL_PROVIDER_ERROR"),
          },
        ],
        finalText("PRIVATE_OUTPUT"),
      ]),
    },
  },
});
try {
  const session = await engine.createSession({
    config: {
      models: {
        p: {
          provider: "fake",
          model: "synthetic",
          baseURL: "https://model.example.com",
          apiKey: { secretRef: "test" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
        },
      },
      routing: { primary: "p" },
      retry: { model: { maxRetries: 0 } },
    },
  });
  await assert.rejects(session.run({ input: "PRIVATE_FAILURE_INPUT" }), {
    code: "MODEL_PROVIDER_ERROR",
  });
  const result = await session.run({ input: "PRIVATE_SUCCESS_INPUT" });
  for (
    let n = 0;
    n < 500 && !logs.some((log) => log.code === "run.completed");
    n++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  const scrape = await (await fetch(origin + "/metrics")).text();
  assert.match(scrape, /agent_store_health 1/);
  assert.match(scrape, /agent_store_heartbeat_seconds [0-9]/);
  assert.match(scrape, /agent_run_event_total\{event="run.failed"\} 1/);
  assert.match(scrape, /agent_run_event_total\{event="run.completed"\} 1/);
  assert.equal(logs.filter((log) => log.code === "run.failed").length, 1);
  assert.ok(spans.length >= 6);
  assert.ok(!JSON.stringify({ spans, logs, scrape }).includes("PRIVATE_"));
  assert.equal((await engine.usage.getRun(result.runId)).attemptCount, 1);
  console.log(
    JSON.stringify({
      metricsScraped: true,
      tracesReceived: spans.length,
      failureSignals: 1,
      payloadsRedacted: true,
    }),
  );
} finally {
  await engine.close();
  await new Promise<void>((resolve) => sink.close(() => resolve()));
}
