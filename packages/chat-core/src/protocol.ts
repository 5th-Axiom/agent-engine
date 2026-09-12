import { z } from "zod";

export const assistantIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/);
export const chatModelSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(100),
  supportsImages: z.boolean(),
  thinking: z.boolean(),
});
export type ChatModel = z.infer<typeof chatModelSchema>;
export const chatSkillSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(100),
});
export type ChatSkill = z.infer<typeof chatSkillSchema>;
export const createSessionSchema = z.strictObject({
  requestId: z.uuid(),
  assistantId: assistantIdSchema,
});
export const chatImageSchema = z.strictObject({
  type: z.literal("image"),
  attachmentId: z.uuid(),
});
export type ChatImage = z.infer<typeof chatImageSchema>;
export const sendMessageSchema = z
  .strictObject({
    requestId: z.uuid(),
    input: z.string().trim().max(8000),
    modelId: z.string().min(1).max(128).optional(),
    skillId: z.string().min(1).max(128).optional(),
    /** Opaque host-issued reference, never a browser-provided Engine context. */
    contextRef: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,200}$/)
      .optional(),
    attachments: z.array(chatImageSchema).max(8).optional(),
  })
  .refine((v) => !!v.input || !!v.attachments?.length);
export const cancelRunSchema = z.strictObject({ runId: z.uuid() });
/** Public catalog only. Executor configuration, schemas and credentials stay on the server. */
export const chatToolSchema = z.object({
  name: z.string().min(1).max(128),
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  sideEffect: z.enum(["read", "write"]),
  permission: z.enum(["allow", "require-approval", "deny"]),
});
const usageSchema = z.object({
  input: z.number().nonnegative().optional(),
  output: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  complete: z.boolean(),
  costComplete: z.boolean(),
  costs: z
    .array(
      z.object({
        currency: z.string().max(32),
        amount: z.string().max(100),
        complete: z.boolean(),
      }),
    )
    .optional(),
});
/** Public execution facts only; raw events, private reasoning and native payloads are excluded. */
export const processEntrySchema = z.object({
  id: z.string().max(200),
  sequence: z.number().int().nonnegative(),
  kind: z.enum([
    "model",
    "thinking",
    "tool",
    "skill",
    "knowledge",
    "memory",
    "context",
    "retry",
    "waiting",
    "warning",
    "message",
    "run",
  ]),
  label: z.string().max(200),
  state: z.enum(["running", "completed", "failed", "waiting", "cancelled"]),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  input: z.string().max(2000).optional(),
  output: z.string().max(8000).optional(),
});
export type ChatProcessEntry = z.infer<typeof processEntrySchema>;
export const runSchema = z.object({
  id: z.uuid(),
  sequence: z.number().int().nonnegative(),
  modelId: z.string().optional(),
  skillId: z.string().optional(),
  attachments: z.array(chatImageSchema).optional(),
  input: z.string(),
  output: z.string(),
  draft: z.string(),
  state: z.enum([
    "queued",
    "running",
    "recovering",
    "awaiting_input",
    "awaiting_tool_resolution",
    "completed",
    "failed",
    "cancelled",
  ]),
  cancelRequested: z.boolean(),
  process: z
    .object({
      entries: z.array(processEntrySchema).max(600),
      thinkingDisplay: z.enum(["none", "summary", "content"]).optional(),
      complete: z.boolean(),
      observedAt: z.number(),
      activeMs: z.number().nonnegative(),
      pending: z
        .object({
          kind: z.enum(["question", "structured_input", "permission"]),
          question: z.string().max(4000),
          expiresAt: z.number(),
        })
        .optional(),
    })
    .optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,100}$/)
    .optional(),
  steps: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  usage: usageSchema,
  operations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      validation: z.string(),
    }),
  ),
});
export const assistantSchema = z.object({
  models: z.array(chatModelSchema).optional(),
  defaultModelId: z.string().optional(),
  skills: z.array(chatSkillSchema).optional(),
  supportsImages: z.boolean().optional(),
  id: assistantIdSchema,
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tools: z.array(chatToolSchema).optional(),
});
export const configSchema = z.object({
  images: z
    .object({
      maxBytes: z.number().positive(),
      maxPerMessage: z.number().positive(),
    })
    .optional(),
  protocolVersion: z.literal(1),
  assistants: z.array(assistantSchema).min(1),
  defaultAssistant: assistantIdSchema,
  maxInputLength: z.literal(8000),
});
export const sessionSummarySchema = z.object({
  id: z.uuid(),
  assistantId: assistantIdSchema,
  title: z.string(),
  createdAt: z.number(),
  active: z.boolean(),
});
export const sessionSchema = z.object({
  models: z.array(chatModelSchema).optional(),
  defaultModelId: z.string().optional(),
  skills: z.array(chatSkillSchema).optional(),
  supportsImages: z.boolean().optional(),
  id: z.uuid(),
  assistantId: assistantIdSchema,
  title: z.string(),
  activeRun: z.uuid().optional(),
  runs: z.array(runSchema),
  totalRuns: z.number().int().nonnegative(),
  snapshotSequence: z.number().int().nonnegative(),
  debugPath: z.string().optional(),
  createdAt: z.number().optional(),
  configVersion: z.number().int().positive().optional(),
  tools: z.array(chatToolSchema).optional(),
  activeTools: z.array(chatToolSchema).optional(),
  activeConfigVersion: z.number().int().positive().optional(),
});
export const sessionsSchema = z.array(sessionSummarySchema);
export const createdSchema = z.object({ id: z.uuid() });
export const sentSchema = z.object({ runId: z.uuid() });
export const cancelledSchema = z.object({ accepted: z.literal(true) });
export type ChatAssistant = z.infer<typeof assistantSchema>;
export type ChatTool = z.infer<typeof chatToolSchema>;
export type ChatConfig = z.infer<typeof configSchema>;
export type ChatRun = z.infer<typeof runSchema>;
export type ChatSession = z.infer<typeof sessionSchema>;
export type ChatSessionSummary = z.infer<typeof sessionSummarySchema>;
export interface ChatTransport {
  uploadImage?(file: Blob, signal?: AbortSignal): Promise<ChatImage>;
  readImage?(id: string, signal?: AbortSignal): Promise<Blob>;
  getConfig(signal?: AbortSignal): Promise<ChatConfig>;
  listSessions(signal?: AbortSignal): Promise<ChatSessionSummary[]>;
  readSession(id: string, signal?: AbortSignal): Promise<ChatSession>;
  createSession(
    input: z.infer<typeof createSessionSchema>,
    signal?: AbortSignal,
  ): Promise<{ id: string }>;
  sendMessage(
    id: string,
    input: z.infer<typeof sendMessageSchema>,
    signal?: AbortSignal,
  ): Promise<{ runId: string }>;
  cancelRun(
    id: string,
    runId: string,
    signal?: AbortSignal,
  ): Promise<{ accepted: true }>;
}
export const isActiveRun = (run: ChatRun) =>
  !["completed", "failed", "cancelled"].includes(run.state);
export class ChatError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = "ChatError";
  }
}
export const errorCode = (error: unknown) =>
  error instanceof ChatError ? error.code : "CHAT_CONNECTION_FAILED";
