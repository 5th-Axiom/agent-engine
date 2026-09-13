import { projectReply } from "./reply.js";
import {
  AgentEngineError,
  summarize,
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
  const view = await engine.readSessionView(id, {
    afterSequence: journal.cursor(id, assistant.thinkingDisplay ?? "none"),
  });
  if (view.runs.some((r) => r.acceptedSequence === undefined))
    throw new ChatError("RUN_ORDER_UNAVAILABLE", 409);
  const runs: ChatRun[] = [];
  const visible = view.runs.slice(-50);
  const process = visible.length
    ? journal.ingest(
        id,
        visible[0]!.acceptedSequence!,
        view,
        assistant.thinkingDisplay,
      )
    : undefined;
  let activeTools: ChatTool[] | undefined;
  let activeConfigVersion: number | undefined;
  for (const r of visible) {
    const usage = summarize(r.usage);
    if (r.id === view.session.activeRun) {
      activeTools = publicTools(r.config.tools, assistant.toolDisplay);
      activeConfigVersion = r.configVersion;
    }
    runs.push({
      id: r.id,
      sequence: r.acceptedSequence!,
      state: r.state,
      modelId: r.config.routing.primary,
      ...(r.requestedSkill ? { skillId: r.requestedSkill } : {}),
      cancelRequested: r.cancelRequested,
      ...(process
        ? {
            process: projectProcess(
              r,
              process.facts,
              view.observedAt,
              assistant,
            ),
          }
        : {}),
      ...(r.attachments?.length ? { attachments: r.attachments } : {}),
      input: typeof r.input === "string" ? r.input : "",
      output: r.result?.outputText ?? "",
      ...projectReply(r, process?.facts ?? []),
      errorCode: r.error?.code,
      steps: r.steps.length,
      attempts: usage.attemptCount,
      usage: {
        input: usage.knownTotals.input,
        output: usage.knownTotals.output,
        total: usage.knownTotals.total,
        complete: usage.complete,
        costComplete: usage.costComplete,
        costs: Object.entries(usage.costByCurrency).map(([currency, cost]) => ({
          currency,
          amount: cost.estimated,
          complete: cost.complete,
        })),
      },
      operations: view.operations
        .filter((o) => o.runId === r.id)
        .map((o) => ({
          id: o.id,
          name: o.tool.name,
          state: o.executionStatus,
          validation: o.validationStatus,
        })),
    });
  }
  return {
    id,
    ...(assistant.settings ? { settingsEnabled: true } : {}),
    ...publicComposer(session.config, assistant),
    supportsImages:
      session.config.models[session.config.routing.primary]?.capabilities
        ?.images === true,
    assistantId: assistant.id,
    title: title(session),
    activeRun: view.session.activeRun,
    runs,
    totalRuns: view.runs.length,
    snapshotSequence: view.snapshotSequence,
    createdAt: session.createdAt,
    configVersion: session.version,
    tools: publicTools(session.config.tools, assistant.toolDisplay),
    ...(activeTools ? { activeTools, activeConfigVersion } : {}),
    ...(debugPath ? { debugPath } : {}),
  };
}
