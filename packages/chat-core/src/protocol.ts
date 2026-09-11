import { z } from "zod";

export const assistantIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/);
export const createSessionSchema = z.strictObject({
  requestId: z.uuid(),
  assistantId: assistantIdSchema,
});
export const sendMessageSchema = z.strictObject({
  requestId: z.uuid(),
  input: z.string().trim().min(1).max(8000),
});
export const cancelRunSchema = z.strictObject({ runId: z.uuid() });
const usageSchema = z.object({
  input: z.number().nonnegative().optional(),
  output: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  complete: z.boolean(),
  costComplete: z.boolean(),
});
export const runSchema = z.object({
  id: z.uuid(),
  sequence: z.number().int().nonnegative(),
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
  id: assistantIdSchema,
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
export const configSchema = z.object({
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
  id: z.uuid(),
  assistantId: assistantIdSchema,
  title: z.string(),
  activeRun: z.uuid().optional(),
  runs: z.array(runSchema),
  totalRuns: z.number().int().nonnegative(),
  snapshotSequence: z.number().int().nonnegative(),
  debugPath: z.string().optional(),
});
export const sessionsSchema = z.array(sessionSummarySchema);
export const createdSchema = z.object({ id: z.uuid() });
export const sentSchema = z.object({ runId: z.uuid() });
export const cancelledSchema = z.object({ accepted: z.literal(true) });
export type ChatAssistant = z.infer<typeof assistantSchema>;
export type ChatConfig = z.infer<typeof configSchema>;
export type ChatRun = z.infer<typeof runSchema>;
export type ChatSession = z.infer<typeof sessionSchema>;
export type ChatSessionSummary = z.infer<typeof sessionSummarySchema>;
export interface ChatTransport {
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
