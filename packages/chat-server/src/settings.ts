import {
  parseConfig,
  type SessionAgentConfig,
  type SessionRecord,
} from "@agent-runtime/sdk";
import {
  ChatError,
  chatPreferencesSchema,
  chatSettingsSchema,
  type ChatPreferences,
  type ChatSettings,
} from "@agent-runtime/chat-core";
import type { ChatAssistantDefinition } from "./types.js";
import { publicComposer, publicTools } from "./projection.js";

/** Host-owned ceiling. Browser preferences only restrict these capabilities. */
export function chatAssistantConfig(
  assistant: ChatAssistantDefinition,
): SessionAgentConfig {
  const config = parseConfig(assistant.config);
  for (const model of Object.values(config.models))
    if (model.thinking) {
      if (!assistant.thinkingDisplay) model.thinking.expose = "none";
      else if (
        assistant.thinkingDisplay === "summary" &&
        model.thinking.expose === "content"
      )
        model.thinking.expose = "summary";
    }
  return config;
}
function preferences(config: SessionAgentConfig): ChatPreferences {
  return {
    modelId: config.routing.primary,
    enabledTools: config.tools
      .filter((t) => t.permission !== "deny")
      .map((t) => t.name),
    enabledSkills: config.skills.map((s) => s.id),
    enabledKnowledgeBases: config.knowledgeBases.map((k) => k.id),
    memory: config.memory.stores.map((m) => ({
      id: m.id,
      read: m.read.enabled !== false,
      write: !!m.write,
    })),
    showThinking: Object.values(config.models).some(
      (m) => m.thinking?.expose && m.thinking.expose !== "none",
    ),
    compactContext: (config.context?.compaction?.maxCyclesPerRun ?? 0) > 0,
  };
}
/** Rebase stored restrictions onto a revised host catalog. New capabilities stay disabled. */
export function reconcileChatPreferences(
  base: SessionAgentConfig,
  value: ChatPreferences,
): ChatPreferences {
  const defaults = preferences(base);
  return {
    modelId: Object.hasOwn(base.models, value.modelId)
      ? value.modelId
      : defaults.modelId,
    enabledTools: value.enabledTools.filter((id) =>
      defaults.enabledTools.includes(id),
    ),
    enabledSkills: value.enabledSkills.filter((id) =>
      defaults.enabledSkills.includes(id),
    ),
    enabledKnowledgeBases: value.enabledKnowledgeBases.filter((id) =>
      defaults.enabledKnowledgeBases.includes(id),
    ),
    memory: defaults.memory.map((m) => ({
      id: m.id,
      read: m.read && !!value.memory.find((v) => v.id === m.id)?.read,
      write: m.write && !!value.memory.find((v) => v.id === m.id)?.write,
    })),
    showThinking: value.showThinking && defaults.showThinking,
    compactContext: value.compactContext && defaults.compactContext,
  };
}
export function applyChatPreferences(
  base: SessionAgentConfig,
  value: ChatPreferences,
): SessionAgentConfig {
  const next = parseConfig(base);
  const allowed = reconcileChatPreferences(base, value);
  const equalSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id) => b.includes(id));
  if (
    value.modelId !== allowed.modelId ||
    value.showThinking !== allowed.showThinking ||
    value.compactContext !== allowed.compactContext ||
    !equalSet(value.enabledTools, allowed.enabledTools) ||
    !equalSet(value.enabledSkills, allowed.enabledSkills) ||
    !equalSet(value.enabledKnowledgeBases, allowed.enabledKnowledgeBases) ||
    value.memory.length !== allowed.memory.length ||
    value.memory.some((m) => {
      const a = allowed.memory.find((v) => v.id === m.id);
      return !a || m.read !== a.read || m.write !== a.write;
    })
  )
    throw new ChatError("CHAT_SETTINGS_UNAVAILABLE", 409);
  next.routing.primary = value.modelId;
  next.tools = next.tools.map((t) =>
    value.enabledTools.includes(t.name) ? t : { ...t, permission: "deny" },
  );
  next.skills = next.skills.filter((s) => value.enabledSkills.includes(s.id));
  next.knowledgeBases = next.knowledgeBases.filter((k) =>
    value.enabledKnowledgeBases.includes(k.id),
  );
  for (const store of next.memory.stores) {
    const preference = value.memory.find((m) => m.id === store.id)!;
    if (!preference.read) {
      store.read.strategy = "none";
      store.read.enabled = false;
    }
    if (!preference.write) delete store.write;
  }
  if (!value.showThinking)
    for (const model of Object.values(next.models))
      if (model.thinking) model.thinking.expose = "none";
  // Only expose this control when the host explicitly supplies its cycle ceiling.
  if (
    base.context?.compaction?.maxCyclesPerRun !== undefined &&
    !value.compactContext
  )
    next.context!.compaction!.maxCyclesPerRun = 0;
  next.metadata = {
    ...next.metadata,
    agentChatPreferences: chatPreferencesSchema.parse(value),
  };
  return next;
}
export function restoreChatPreferences(
  base: SessionAgentConfig,
  previous: SessionAgentConfig,
): SessionAgentConfig {
  const parsed = chatPreferencesSchema.safeParse(
    previous.metadata?.agentChatPreferences,
  );
  return parsed.success
    ? applyChatPreferences(base, reconcileChatPreferences(base, parsed.data))
    : base;
}
export function readChatSettings(
  record: SessionRecord,
  assistant: ChatAssistantDefinition,
): ChatSettings {
  if (!assistant.settings) throw new ChatError("CHAT_SETTINGS_DISABLED", 403);
  const base = chatAssistantConfig(assistant),
    defaults = preferences(base);
  return chatSettingsSchema.parse({
    sessionId: record.id,
    assistantId: assistant.id,
    assistantLabel: assistant.label,
    configVersion: record.version,
    active: !!record.activeRun,
    editable: !record.archived,
    preferences: reconcileChatPreferences(base, preferences(record.config)),
    defaults,
    models: publicComposer(base, assistant).models,
    tools: publicTools(base.tools, assistant.toolDisplay),
    skills: base.skills.map((s) => ({
      id: s.id,
      label: assistant.skillDisplay?.[s.id]?.label ?? s.name,
      description: assistant.skillDisplay?.[s.id]?.description,
      allowedTools: s.allowedTools,
    })),
    knowledgeBases: base.knowledgeBases.map((k) => ({
      id: k.id,
      label: assistant.knowledgeDisplay?.[k.id]?.label ?? k.name,
      description: assistant.knowledgeDisplay?.[k.id]?.description,
    })),
    memoryStores: base.memory.stores.map((m) => ({
      id: m.id,
      label: assistant.memoryDisplay?.[m.id]?.label ?? m.id,
      canRead: m.read.enabled !== false,
      canWrite: !!m.write,
    })),
    canShowThinking: defaults.showThinking,
    canCompactContext: defaults.compactContext,
  });
}
