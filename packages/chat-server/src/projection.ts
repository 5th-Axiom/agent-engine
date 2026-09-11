import {
  AgentEngineError,
  type AgentEngine,
  type SessionRecord,
} from "@agent-runtime/sdk";
import {
  ChatError,
  type ChatSession,
  type ChatRun,
  type ChatSessionSummary,
} from "@agent-runtime/chat-core";
import type { ChatContext } from "./types.js";

export function assistantFor(
  session: SessionRecord,
  context: ChatContext,
  namespace: string,
) {
  const marker = session.config.metadata?.agentChat;
  if (
    !marker ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    marker.namespace !== namespace ||
    typeof marker.assistantId !== "string"
  )
    throw new ChatError("CHAT_SESSION_NOT_FOUND", 404);
  const assistant = context.assistants.find((a) => a.id === marker.assistantId);
  if (!assistant) throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE", 403);
  return assistant;
}
const title = (session: SessionRecord) =>
  session.history.find((m) => m.role === "user")?.content.slice(0, 80) ||
  "新对话";
export async function listChatSessions(
  context: ChatContext,
  namespace: string,
): Promise<ChatSessionSummary[]> {
  const result: ChatSessionSummary[] = [];
  let after: string | undefined;
  while (result.length < 50) {
    const summaries = await context.engine.listSessions({ after });
    for (const s of summaries) {
      if (s.archived) continue;
      try {
        const record = await context.engine.readSession(s.id);
        const assistant = assistantFor(record, context, namespace);
        result.push({
          id: s.id,
          assistantId: assistant.id,
          title: title(record),
          createdAt: record.createdAt ?? 0,
          active: !!record.activeRun,
        });
        if (result.length === 50) break;
      } catch (error) {
        if (
          error instanceof ChatError &&
          ["CHAT_SESSION_NOT_FOUND", "CHAT_ASSISTANT_UNAVAILABLE"].includes(
            error.code,
          )
        )
          continue;
        if (
          error instanceof AgentEngineError &&
          ["ACCESS_DENIED", "DATA_RETENTION_EXPIRED"].includes(error.code)
        )
          continue;
        throw error;
      }
    }
    if (summaries.length < 500) break;
    after = summaries.at(-1)!.id;
  }
  return result
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    .slice(0, 50);
}
export async function readChatSession(
  context: ChatContext,
  namespace: string,
  id: string,
  debugPath?: string,
): Promise<ChatSession> {
  const { engine } = context;
  const session = await engine.readSession(id);
  const assistant = assistantFor(session, context, namespace);
  const inspection = await engine.inspectSession(id);
  if (inspection.runs.some((r) => r.acceptedSequence === undefined))
    throw new ChatError("RUN_ORDER_UNAVAILABLE", 409);
  const runs: ChatRun[] = [];
  for (const summary of inspection.runs.slice(-50)) {
    const r = await engine.readRun(id, summary.id);
    runs.push({
      id: r.id,
      sequence: summary.acceptedSequence!,
      state: r.state,
      cancelRequested: r.cancelRequested,
      input: typeof r.input === "string" ? r.input : "",
      output: r.result?.outputText ?? "",
      draft: ["completed", "cancelled", "failed"].includes(r.state)
        ? ""
        : Object.values(r.drafts ?? {})
            .flatMap((d) =>
              Object.values(d.blocks)
                .filter((b) => b.kind === "text")
                .map((b) => b.text),
            )
            .join(""),
      errorCode: r.error?.code,
      steps: summary.steps.length,
      attempts: summary.usage.attemptCount,
      usage: {
        input: summary.usage.knownTotals.input,
        output: summary.usage.knownTotals.output,
        total: summary.usage.knownTotals.total,
        complete: summary.usage.complete,
        costComplete: summary.usage.costComplete,
      },
      operations: inspection.operations
        .filter((o) => o.runId === r.id)
        .map((o) => ({
          id: o.id,
          name: o.name,
          state: o.executionStatus,
          validation: o.validationStatus,
        })),
    });
  }
  return {
    id,
    assistantId: assistant.id,
    title: title(session),
    activeRun: session.activeRun,
    runs,
    totalRuns: inspection.runs.length,
    snapshotSequence: inspection.snapshotSequence,
    ...(debugPath ? { debugPath } : {}),
  };
}
