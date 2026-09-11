import { it, expect } from "vitest";
import { createAgentEngine, type TelemetryConfig } from "@agent-runtime/sdk";
import { MemoryStore, scriptedModel, finalText } from "@agent-runtime/testing";
it("telemetry projects usage revisions as signed differences without adding duplicate snapshots", async () => {
  const { prometheusExporter } = await import("@agent-runtime/sdk");
  const metrics = prometheusExporter();
  let completed = false;
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "metric-delta", subjectId: "u" },
    secrets: { resolve: async () => "synthetic" },
    policy: { allowedOrigins: ["https://model.example.com"] },
    telemetry: {
      metrics,
      event: (e) => {
        if (e.type === "run.completed") completed = true;
      },
    },
    adapters: {
      models: {
        fake: scriptedModel([
          [
            {
              type: "usage",
              usage: { input: 10, output: 2 },
              mode: "snapshot",
              final: true,
            },
            {
              type: "usage",
              usage: { input: 10, output: 2 },
              mode: "snapshot",
              final: true,
            },
            {
              type: "usage",
              usage: { input: 7, output: 1 },
              mode: "snapshot",
              final: true,
            },
            ...finalText("done"),
          ],
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
            model: "fake",
            baseURL: "https://model.example.com",
            apiKey: { secretRef: "test" },
            limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
          },
        },
        routing: { primary: "p" },
      },
    });
    await session.run({ input: "go" });
    for (let i = 0; i < 200 && !completed; i++)
      await new Promise((resolve) => setTimeout(resolve, 2));
    expect(metrics.render()).toContain("agent_usage_input_tokens_net 7\n");
    expect(metrics.render()).toContain("agent_usage_output_tokens_net 1\n");
    expect(metrics.render()).toContain("agent_usage_total_tokens_net 8\n");
  } finally {
    await engine.close();
  }
});
it("exports completed parented spans and low-cardinality metrics without prompt payloads", async () => {
  const spans: Parameters<
    NonNullable<TelemetryConfig["traces"]>["export"]
  >[0][] = [];
  const metrics: { name: string; attributes: Record<string, string> }[] = [];
  const logs: unknown[] = [];
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "telemetry", subjectId: "u" },
    secrets: { resolve: async () => "synthetic-secret" },
    adapters: {
      models: { fake: scriptedModel([finalText("private-output")]) },
    },
    policy: { allowedOrigins: ["https://model.example.com"] },
    telemetry: {
      traces: {
        export: (span) => {
          spans.push(span);
        },
      },
      metrics: {
        record: (name, _value, attributes) => {
          metrics.push({ name, attributes });
        },
      },
      logs: {
        write: (record) => {
          logs.push(record);
        },
      },
    },
  });
  try {
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
      },
    });
    await session.run({ input: "private-input" });
    for (
      let i = 0;
      i < 200 && !spans.some((span) => span.name === "agent.run");
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 2));
    expect(spans.map((span) => span.name).sort()).toEqual([
      "agent.model_attempt",
      "agent.run",
      "agent.step",
    ]);
    const run = spans.find((span) => span.name === "agent.run")!,
      step = spans.find((span) => span.name === "agent.step")!,
      attempt = spans.find((span) => span.name === "agent.model_attempt")!;
    expect(step.parentSpanId).toBe(run.spanId);
    expect(attempt.parentSpanId).toBe(step.spanId);
    expect(new Set(spans.map((span) => span.traceId)).size).toBe(1);
    expect(
      spans.every(
        (span) => span.durationMs >= 0 && span.endTime >= span.startTime,
      ),
    ).toBe(true);
    expect(JSON.stringify({ spans, metrics, logs })).not.toMatch(
      /private-input|private-output|synthetic-secret/,
    );
    expect(
      metrics.every(
        (metric) =>
          !("runId" in metric.attributes) &&
          !("sessionId" in metric.attributes),
      ),
    ).toBe(true);
  } finally {
    await engine.close();
  }
});
