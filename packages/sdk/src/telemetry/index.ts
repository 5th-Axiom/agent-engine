import { hash } from "../protocol/json.js";
import type { AgentEvent } from "../protocol/events.js";
export interface TelemetryConfig {
  event?: (event: { type: string; runId?: string }) => void | Promise<void>;
  health?: (healthy: boolean, code?: string) => void;
  metrics?: {
    record: (
      name: string,
      value: number,
      attributes: Record<string, string>,
    ) => void | Promise<void>;
  };
  traces?: {
    export: (span: {
      name: string;
      timestamp: string;
      attributes: Record<string, string>;
      traceId: string;
      spanId: string;
      parentSpanId?: string;
      startTime: string;
      endTime: string;
      durationMs: number;
      status: "ok" | "error";
    }) => void | Promise<void>;
  };
  logs?: {
    write: (record: {
      timestamp: string;
      level: "info" | "error";
      code: string;
      runId?: string;
    }) => void | Promise<void>;
  };
}
const spanStates = new WeakMap<
  TelemetryConfig,
  Map<string, { event: AgentEvent; kind: string; runId: string }>
>();
export async function exportEvent(
  telemetry: TelemetryConfig | undefined,
  event: AgentEvent,
) {
  if (!telemetry) return;
  const runId = "runId" in event ? event.runId : undefined;
  await telemetry.event?.({ type: event.type, ...(runId ? { runId } : {}) });
  if (
    event.type.startsWith("run.") ||
    event.type.startsWith("model.") ||
    event.type.startsWith("tool.") ||
    event.type.startsWith("memory.") ||
    event.type.startsWith("knowledge.") ||
    event.type.startsWith("budget.")
  )
    await telemetry.metrics?.record(
      `agent_${event.type.split(".")[0]}_event_total`,
      1,
      { event: event.type },
    );
  if (event.type === "usage.recorded") {
    const deltas = event.data.tokenDelta;
    if (deltas && typeof deltas === "object" && !Array.isArray(deltas))
      for (const key of [
        "input",
        "uncachedInput",
        "cacheReadInput",
        "cacheWriteInput",
        "output",
        "reasoning",
        "total",
      ]) {
        const delta = deltas[key];
        if (typeof delta === "number" && Number.isSafeInteger(delta))
          await telemetry.metrics?.record(
            "agent_usage_" +
              key.replace(/[A-Z]/g, (char) => "_" + char.toLowerCase()) +
              "_tokens_net",
            delta,
            {},
          );
      }
  }
  let state = spanStates.get(telemetry);
  if (!state) {
    state = new Map();
    spanStates.set(telemetry, state);
  }
  const kind = event.type.startsWith("run.")
    ? "run"
    : event.type.startsWith("step.")
      ? "step"
      : event.type.startsWith("model.")
        ? "model_attempt"
        : event.type.startsWith("tool.") ||
            event.type.startsWith("memory.") ||
            event.type.startsWith("knowledge.")
          ? "capability"
          : undefined;
  const id =
    kind === "run"
      ? runId
      : kind === "step" && "stepId" in event
        ? event.stepId
        : kind === "model_attempt" && "attemptId" in event
          ? event.attemptId
          : kind === "capability" && "operationId" in event
            ? event.operationId
            : undefined;
  const key = kind && id ? kind + ":" + id : undefined;
  if (
    key &&
    [
      "run.queued",
      "run.recovering",
      "step.started",
      "model.requested",
      "tool.started",
      "memory.read.started",
      "knowledge.search.started",
      "memory.write.proposed",
    ].includes(event.type) &&
    !state.has(key) &&
    state.size < 4096
  )
    state.set(key, { event, kind: kind!, runId: runId! });
  const ending = [
    "run.completed",
    "run.failed",
    "run.cancelled",
    "step.completed",
    "step.failed",
    "model.completed",
    "model.failed",
    "tool.completed",
    "tool.failed",
    "tool.output_invalid",
    "tool.outcome_unknown",
    "memory.read.completed",
    "memory.read.failed",
    "memory.write.completed",
    "memory.write.failed",
    "memory.write.rejected",
    "knowledge.search.completed",
    "knowledge.search.failed",
  ].includes(event.type);
  const endSpan = async (key: string, failed: boolean) => {
    const start = state!.get(key);
    if (!start) return;
    state!.delete(key);
    const attrs = {
      sessionId: event.sessionId,
      runId: start.runId,
      ...("operationId" in start.event
        ? { operationId: start.event.operationId }
        : {}),
      ...("capabilityKind" in start.event.data
        ? { capabilityKind: String(start.event.data.capabilityKind) }
        : {}),
      ...(event.type === "run.failed"
        ? { errorCode: event.data.error.code }
        : event.type === "model.failed" && typeof event.data.code === "string"
          ? { errorCode: event.data.code }
          : {}),
      ...("stepId" in start.event ? { stepId: start.event.stepId } : {}),
      ...("attemptId" in start.event
        ? { attemptId: start.event.attemptId }
        : {}),
    };
    const durationMs = Math.max(
      0,
      Date.parse(event.timestamp) - Date.parse(start.event.timestamp),
    );
    await telemetry.traces?.export({
      name: "agent." + start.kind,
      timestamp: event.timestamp,
      attributes: attrs,
      traceId: hash(start.runId).slice(0, 32),
      spanId: hash(key).slice(0, 16),
      ...(start.kind !== "run"
        ? {
            parentSpanId: hash(
              start.kind === "model_attempt" && "stepId" in start.event
                ? "step:" + start.event.stepId
                : "run:" + start.runId,
            ).slice(0, 16),
          }
        : {}),
      startTime: start.event.timestamp,
      endTime: event.timestamp,
      durationMs,
      status: failed ? "error" : "ok",
    });
    await telemetry.metrics?.record(
      "agent_" + start.kind + "_duration_ms_total",
      durationMs,
      {},
    );
    await telemetry.metrics?.record(
      "agent_" + start.kind + "_completed_total",
      1,
      {},
    );
  };
  if (key && ending)
    await endSpan(
      key,
      event.type.endsWith("failed") ||
        event.type.endsWith("unknown") ||
        event.type.endsWith("invalid") ||
        event.type.endsWith("rejected") ||
        event.type.endsWith("cancelled"),
    );
  if (kind === "run" && ending)
    for (const [other, start] of state)
      if (start.runId === runId) await endSpan(other, true);
  await telemetry.logs?.write({
    timestamp: event.timestamp,
    level: event.type.endsWith("failed") ? "error" : "info",
    code: event.type,
    ...(runId ? { runId } : {}),
  });
}
// A bounded, dependency-free exporter suitable for scraping by an external monitoring system.
export function prometheusExporter() {
  const values = new Map<string, number>();
  return {
    record(name: string, value: number, attributes: Record<string, string>) {
      if (!/^agent_[a-z_]+$/.test(name)) return;
      const allowed = attributes.event
        ? `{event="${attributes.event.replace(/[^a-z_.]/g, "")}"}`
        : "";
      const key = name + allowed;
      if (values.size >= 256 && !values.has(key)) return;
      values.set(key, (values.get(key) ?? 0) + value);
    },
    health(healthy: boolean) {
      values.set("agent_store_health", healthy ? 1 : 0);
      values.set("agent_store_heartbeat_seconds", Date.now() / 1000);
    },
    render() {
      return (
        [...values]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k} ${v}`)
          .join("\n") + "\n"
      );
    },
  };
}
