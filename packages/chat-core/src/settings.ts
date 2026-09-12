import { z } from "zod";
import { chatModelSchema, chatToolSchema } from "./protocol.js";
const id = z.string().min(1).max(128);
const ids = z
  .array(id)
  .max(500)
  .refine((v) => new Set(v).size === v.length);
export const chatPreferencesSchema = z.strictObject({
  modelId: id,
  enabledTools: ids,
  enabledSkills: ids,
  enabledKnowledgeBases: ids,
  memory: z
    .array(z.strictObject({ id, read: z.boolean(), write: z.boolean() }))
    .max(100)
    .refine((v) => new Set(v.map((m) => m.id)).size === v.length),
  showThinking: z.boolean(),
  compactContext: z.boolean(),
});
export type ChatPreferences = z.infer<typeof chatPreferencesSchema>;
export const updateChatSettingsSchema = z.strictObject({
  ifVersion: z.number().int().positive(),
  preferences: chatPreferencesSchema,
});
export const chatSettingsSchema = z.object({
  sessionId: z.uuid(),
  assistantId: id,
  assistantLabel: z.string().max(100),
  configVersion: z.number().int().positive(),
  active: z.boolean(),
  editable: z.boolean(),
  preferences: chatPreferencesSchema,
  defaults: chatPreferencesSchema,
  models: z.array(chatModelSchema),
  tools: z.array(chatToolSchema),
  skills: z.array(
    z.object({
      id,
      label: z.string().max(100),
      description: z.string().max(500).optional(),
      allowedTools: z.array(id),
    }),
  ),
  knowledgeBases: z.array(
    z.object({
      id,
      label: z.string().max(100),
      description: z.string().max(500).optional(),
    }),
  ),
  memoryStores: z.array(
    z.object({
      id,
      label: z.string().max(100),
      canRead: z.boolean(),
      canWrite: z.boolean(),
    }),
  ),
  canShowThinking: z.boolean(),
  canCompactContext: z.boolean(),
});
export type ChatSettings = z.infer<typeof chatSettingsSchema>;

/** Selection order is not a configuration change. */
export function equalChatPreferences(
  a: ChatPreferences,
  b: ChatPreferences,
): boolean {
  const normalize = (v: ChatPreferences) => ({
    ...v,
    enabledTools: [...v.enabledTools].sort(),
    enabledSkills: [...v.enabledSkills].sort(),
    enabledKnowledgeBases: [...v.enabledKnowledgeBases].sort(),
    memory: [...v.memory].sort((a, b) => a.id.localeCompare(b.id)),
  });
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
