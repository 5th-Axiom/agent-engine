import {
  AgentEngineError,
  type AgentEngine,
  type SessionRecord,
  type ToolDefinition,
  type SessionAgentConfig,
  parseConfig,
} from "@agent-runtime/sdk";
import {
  ChatError,
  type ChatSession,
  type ChatRun,
  type ChatSessionSummary,
  chatToolSchema,
  type ChatTool,
  chatModelSchema,
  chatSkillSchema,
} from "@agent-runtime/chat-core";
import type { ChatContext, ChatAssistantDefinition } from "./types.js";
import { ProcessJournal, projectProcess } from "./process.js";

export function publicComposer(
  config: SessionAgentConfig,
  assistant: ChatAssistantDefinition,
) {
  const current = parseConfig(assistant.config);
  return {
    defaultModelId: config.routing.primary,
    models: Object.entries(config.models)
      .filter(([id]) => Object.hasOwn(current.models, id))
      .map(([id, model]) =>
        chatModelSchema.parse({
          id,
          label: (assistant.modelDisplay?.[id]?.label ?? model.model).slice(
            0,
            100,
          ),
          supportsImages: model.capabilities?.images === true,
          thinking: model.thinking?.enabled === true,
        }),
      ),
    skills: config.skills
      .filter((skill) => current.skills.some((value) => value.id === skill.id))
      .map((skill) =>
        chatSkillSchema.parse({
          id: skill.id,
          label: (skill.name ?? skill.id).slice(0, 100),
        }),
      ),
  };
}

export function publicTools(
  tools: ToolDefinition[],
  display?: ChatAssistantDefinition["toolDisplay"],
): ChatTool[] {
  return tools.map((tool) => {
    const copy =
      display && Object.hasOwn(display, tool.name)
        ? display[tool.name]
        : undefined;
    return chatToolSchema.parse({
      name: tool.name,
      sideEffect: tool.execution.sideEffect,
      permission: tool.permission ?? "allow",
      label: copy?.label,
      description: copy?.description,
    });
  });
}

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
const title = (session: SessionRecord) => {
  const first = session.history.find((m) => m.role === "user");
  return (
    first?.content.slice(0, 80) ||
    (first?.images?.length ? "图片对话" : "新对话")
  );
};
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
  journal = new ProcessJournal(),
): Promise<ChatSession> {
  const { engine } = context;
  const session = await engine.readSession(id);
  const assistant = assistantFor(session, context, namespace);
  const inspection = await engine.inspectSession(id);
  if (inspection.runs.some((r) => r.acceptedSequence === undefined))
    throw new ChatError("RUN_ORDER_UNAVAILABLE", 409);
  const runs: ChatRun[] = [];
  const visible = inspection.runs.slice(-50);
  const process = visible.length
    ? await journal.read(
        engine,
        id,
        visible[0]!.acceptedSequence!,
        inspection.snapshotSequence,
        assistant.thinkingDisplay,
      )
    : undefined;
  let activeTools: ChatTool[] | undefined;
  let activeConfigVersion: number | undefined;
  for (const summary of visible) {
    const r = await engine.readRun(id, summary.id);
    if (r.id === session.activeRun) {
      activeTools = publicTools(r.config.tools, assistant.toolDisplay);
      activeConfigVersion = r.configVersion;
    }
    runs.push({
      id: r.id,
      sequence: summary.acceptedSequence!,
      state: r.state,
      modelId: r.config.routing.primary,
      ...(r.requestedSkill ? { skillId: r.requestedSkill } : {}),
      cancelRequested: r.cancelRequested,
      ...(process
        ? {
            process: projectProcess(
              r,
              process.facts,
              inspection.observedAt,
              assistant,
            ),
          }
        : {}),
      ...(r.attachments?.length ? { attachments: r.attachments } : {}),
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
        costs: Object.entries(summary.usage.costByCurrency).map(
          ([currency, cost]) => ({
            currency,
            amount: cost.estimated,
            complete: cost.complete,
          }),
        ),
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
    ...publicComposer(session.config, assistant),
    supportsImages:
      session.config.models[session.config.routing.primary]?.capabilities
        ?.images === true,
    assistantId: assistant.id,
    title: title(session),
    activeRun: session.activeRun,
    runs,
    totalRuns: inspection.runs.length,
    snapshotSequence: inspection.snapshotSequence,
    createdAt: session.createdAt,
    configVersion: session.version,
    tools: publicTools(session.config.tools, assistant.toolDisplay),
    ...(activeTools ? { activeTools, activeConfigVersion } : {}),
    ...(debugPath ? { debugPath } : {}),
  };
}
