import { z } from "zod";
import { errorCodes } from "../errors/index.js";
const id = z.string().min(1);
const envelope = z.object({
  id,
  schemaVersion: z.literal("1"),
  sequence: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
  sessionId: id,
});
const run = z.object({ runId: id });
const step = run.extend({ stepId: id });
const attempt = step.extend({ attemptId: id });
const message = attempt.extend({ messageId: id });
const operation = run.extend({ operationId: id, toolCallId: id.optional() });
const details = z.record(z.string(), z.json());
const error = z.object({
  code: z.enum(errorCodes),
  category: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  replaySafety: z.enum(["safe", "idempotent", "unsafe", "unknown"]),
});
const runData = run.extend({ data: details });
const operationData = operation.extend({
  data: z.object({
    name: z.string(),
    capabilityKind: z.enum([
      "tool",
      "skill",
      "knowledge",
      "memory",
      "interaction",
    ]),
    detail: details.optional(),
  }),
});
export const eventPayloadSchemas = {
  "session.created": z.object({ data: z.object({ version: z.number() }) }),
  "session.config_updated": z.object({
    data: z.object({ version: z.number() }),
  }),
  "session.archived": z.object({ data: details }),
  "session.unarchived": z.object({ data: details }),
  "session.deleted": z.object({ data: details }),
  "session.data_expired": z.object({ data: details }),
  "run.queued": runData,
  "run.started": runData,
  "run.awaiting_input": runData,
  "run.awaiting_tool_resolution": runData,
  "run.recovering": runData,
  "run.resumed": runData,
  "run.cancel_requested": runData,
  "run.completed": runData,
  "run.failed": run.extend({ data: z.object({ error }) }),
  "run.cancelled": runData,
  "step.started": step.extend({ data: details }),
  "step.completed": step.extend({ data: details }),
  "step.failed": step.extend({ data: details }),
  "model.requested": attempt.extend({ data: details }),
  "model.streaming": attempt.extend({ data: details }),
  "model.completed": attempt.extend({ data: details }),
  "model.retrying": attempt.extend({ data: details }),
  "model.fallback": attempt.extend({ data: details }),
  "model.failed": attempt.extend({ data: details }),
  "content.output.delta": message.extend({
    blockId: id,
    data: z.object({ text: z.string() }),
  }),
  "content.thinking.delta": message.extend({
    blockId: id,
    data: z.object({
      text: z.string(),
      format: z.enum(["summary", "content"]).optional(),
    }),
  }),
  "content.message.committed": message.extend({ data: details }),
  "content.message.discarded": message.extend({ data: details }),
  "tool.requested": operationData,
  "tool.input_invalid": operationData,
  "tool.approval_requested": operationData,
  "tool.started": operationData,
  "tool.reconciliation.started": operationData,
  "tool.completed": operationData,
  "tool.failed": operationData,
  "tool.output_invalid": operationData,
  "tool.outcome_unknown": operationData,
  "tool.outcome_resolved": operationData,
  "skill.selected": operationData,
  "skill.loaded": operationData,
  "skill.exited": operationData,
  "skill.failed": operationData,
  "knowledge.search.started": operationData,
  "knowledge.search.completed": operationData,
  "knowledge.search.failed": operationData,
  "memory.read.started": operationData,
  "memory.read.completed": operationData,
  "memory.read.failed": operationData,
  "memory.write.proposed": operationData,
  "memory.write.completed": operationData,
  "memory.write.rejected": operationData,
  "memory.write.failed": operationData,
  "memory.write.outcome_unknown": operationData,
  "output.validation_failed": runData,
  "output.repairing": runData,
  "output.validated": runData,
  "context.thinned": runData,
  "context.compaction.started": runData,
  "context.compaction.completed": runData,
  "context.compaction.failed": runData,
  "input.required": runData,
  "input.resolved": runData,
  "input.expired": runData,
  "usage.recorded": attempt.extend({ data: details }),
  "usage.settled": runData,
  "budget.warning": runData,
  "budget.exceeded": runData,
  "warning.raised": z.object({ data: details }),
} as const;
export type EventType = keyof typeof eventPayloadSchemas;
export type EventPayloadMap = {
  [K in EventType]: z.infer<(typeof eventPayloadSchemas)[K]>;
};
export type AgentEvent = {
  [K in EventType]: z.infer<typeof envelope> & { type: K } & EventPayloadMap[K];
}[EventType];
export type NewEvent = {
  [K in EventType]: { type: K } & EventPayloadMap[K];
}[EventType];
export function parseEvent(input: unknown): AgentEvent {
  const e = z
    .object({
      type: z.enum(
        Object.keys(eventPayloadSchemas) as [EventType, ...EventType[]],
      ),
    })
    .parse(input);
  return {
    ...envelope.parse(input),
    type: e.type,
    ...eventPayloadSchemas[e.type].parse(input),
  } as AgentEvent;
}
export type TransportEvent =
  AgentEvent | { unknown: true; id: string; sequence: number };
export function parseTransportEvent(input: unknown): TransportEvent {
  const common = z
    .object({
      id,
      sequence: z.number().int().nonnegative(),
      type: z.string(),
      schemaVersion: z.string(),
    })
    .parse(input);
  if (
    common.schemaVersion !== "1" ||
    !Object.hasOwn(eventPayloadSchemas, common.type)
  )
    return { unknown: true, id: common.id, sequence: common.sequence };
  return parseEvent(input);
}
