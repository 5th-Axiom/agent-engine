import { z } from "zod";
import { imageAttachmentSchema } from "./images.js";
import { DefaultsSchema, SecretSchema, LoopSchema } from "../config/schema.js";
import { fail } from "../errors/index.js";
import type { EngineOptions } from "./types.js";
import { retentionMs } from "./retention.js";

const fn = z.custom<(...args: any[]) => any>(
  (value) => typeof value === "function",
);
const name = z.string().min(1).max(512);
const boundedDuration = (value: string) =>
  Number.isSafeInteger(retentionMs(value)) &&
  retentionMs(value) <= 3650 * 86400000;
const duration = z
  .string()
  .regex(/^[1-9][0-9]*(ms|s|m|h|d)$/)
  .refine(boundedDuration);
const positive = z.number().int().positive().max(1_000_000);
export const PrincipalSchema = z.strictObject({
  tenantId: name,
  subjectId: name,
});
const contract = z.strictObject({
  version: name,
  sideEffect: z.enum(["read", "write"]),
  namespace: name.optional(),
});
const model = z.custom((value) => {
  const adapter = value as any;
  return (
    !!adapter &&
    typeof adapter.version === "string" &&
    !!adapter.version &&
    typeof adapter.stream === "function" &&
    ["tools", "thinking", "structuredOutput"].every(
      (key) => typeof adapter.capabilities?.[key] === "boolean",
    )
  );
});
export const EngineOptionsSchema = z.strictObject({
  store: z.custom((value) => {
    const store = value as any;
    return (
      !!store &&
      typeof store.durable === "boolean" &&
      ["acquire", "assertHeld", "transaction", "close"].every(
        (key) => typeof store[key] === "function",
      )
    );
  }),
  imageStorage: z
    .strictObject({ version: name, put: fn, get: fn, remove: fn })
    .optional(),
  principal: PrincipalSchema,
  secrets: z.strictObject({ resolve: fn }),
  authorize: fn.optional(),
  bindings: z
    .record(
      name,
      contract.extend({
        execute: fn,
        methods: z
          .strictObject({
            read: z.literal("read").optional(),
            write: z.literal("write").optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  adapters: z
    .strictObject({ models: z.record(name, model).optional() })
    .optional(),
  defaults: DefaultsSchema.optional(),
  policy: z
    .strictObject({
      ceilings: DefaultsSchema.optional(),
      promptRetention: duration.optional(),
      protocolPayloadRetention: z
        .union([
          z.literal("none"),
          z
            .string()
            .regex(/^encrypted-[1-9][0-9]*(ms|s|m|h|d)$/)
            .refine(boundedDuration),
        ])
        .optional(),
      thinkingDisplayRetention: z.enum(["none", "session"]).optional(),
      toolResultRetention: z
        .union([z.literal("policy-based"), duration])
        .optional(),
      knowledgeRetention: duration.optional(),
      memoryRetention: duration.optional(),
      allowedOrigins: z.array(z.url()).optional(),
      allowedModelTargets: z
        .array(
          z.strictObject({
            provider: name,
            origin: z.url(),
            credentialScopes: z.array(name),
          }),
        )
        .optional(),
      allowedExecutorTypes: z
        .array(z.enum(["binding", "http", "mcp"]))
        .optional(),
      allowPrivateOrigins: z.array(z.url()).optional(),
    })
    .optional(),
  limits: z
    .strictObject({
      maxAcceptedRuns: positive.optional(),
      maxConcurrentModelRequests: positive.optional(),
      maxConcurrentCapabilityRequests: positive.optional(),
      maxConcurrentMaintenanceRequests: positive.optional(),
      maxReconciliationsPerOperation: positive.optional(),
    })
    .optional(),
  protocolKey: SecretSchema.optional(),
  usageSettlementMs: z.number().int().min(0).max(60000).optional(),
  clock: z
    .custom(
      (value) =>
        !!value &&
        ["now", "sleep", "random"].every(
          (key) => typeof (value as any)[key] === "function",
        ),
    )
    .optional(),
  telemetry: z
    .strictObject({
      event: fn.optional(),
      health: fn.optional(),
      metrics: z.looseObject({ record: fn }).optional(),
      traces: z.looseObject({ export: fn }).optional(),
      logs: z.looseObject({ write: fn }).optional(),
    })
    .optional(),
  remoteContracts: z.record(name, contract).optional(),
  fault: fn.optional(),
});
export function validateEngineOptions(options: EngineOptions): void {
  if (!EngineOptionsSchema.safeParse(options).success)
    fail("CONFIG_INVALID", "Invalid Engine options");
  for (const origin of [
    ...(options.policy?.allowedOrigins ?? []),
    ...(options.policy?.allowPrivateOrigins ?? []),
    ...(options.policy?.allowedModelTargets ?? []).map(
      (target) => target.origin,
    ),
  ]) {
    const url = new URL(origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
      fail("CONFIG_INVALID", "Engine targets must be exact HTTP origins");
  }
  if (
    options.policy?.allowPrivateOrigins?.some(
      (origin) =>
        !options.policy?.allowedOrigins?.includes(origin) &&
        !options.policy?.allowedModelTargets?.some(
          (target) => target.origin === origin,
        ),
    )
  )
    fail(
      "CONFIG_POLICY_VIOLATION",
      "Private origins also require explicit origin authorization",
    );
}

export const RunInputSchema = z.strictObject({
  skill: name.optional(),
  attachments: z.array(imageAttachmentSchema).max(8).optional(),
  requestId: name.optional(),
  ifConfigVersion: z.number().int().positive().optional(),
  input: z.unknown(),
  context: z.record(z.string(), z.json()).optional(),
  metadata: z.record(z.string(), z.json()).optional(),
  output: z.unknown().optional(),
  overrides: z
    .strictObject({
      model: name.optional(),
      tools: z.array(name).optional(),
      loop: LoopSchema.optional(),
    })
    .optional(),
});
export function validateRunInput(input: unknown): void {
  try {
    if (!RunInputSchema.safeParse(input).success)
      fail("CONFIG_INVALID", "Invalid Run input");
  } catch {
    fail("CONFIG_INVALID", "Invalid Run input");
  }
}
