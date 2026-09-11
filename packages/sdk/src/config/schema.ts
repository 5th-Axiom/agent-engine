import { z } from "zod";
import { Ajv } from "ajv";
import type { AnySchema } from "ajv";
import { fail } from "../errors/index.js";
import { json, hash, freeze, type JsonValue } from "../protocol/json.js";
const name = z.string().min(1).max(128);
const positive = z.number().int().positive().max(2_147_483_647);
const count = z.number().int().nonnegative().max(10000);
const object = z.record(z.string(), z.json());
export const SecretSchema = z.strictObject({ secretRef: name });
export const BindingRefSchema = z.strictObject({
  type: z.literal("binding"),
  bindingKey: name,
});
export const JsonSchemaSchema = z.union([z.boolean(), object]);
export const IdempotencySchema = z.strictObject({
  required: z.literal(true).optional(),
  namespace: name,
  businessKey: BindingRefSchema,
});
export const ExecutionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("binding"),
    bindingKey: name,
    timeoutMs: positive.optional(),
    sideEffect: z.enum(["read", "write"]),
    idempotency: IdempotencySchema.optional(),
  }),
  z.strictObject({
    type: z.literal("http"),
    endpoint: z.url(),
    auth: SecretSchema.optional(),
    timeoutMs: positive.optional(),
    sideEffect: z.enum(["read", "write"]),
    idempotency: IdempotencySchema.optional(),
    idempotencyHeader: name.optional(),
  }),
  z.strictObject({
    type: z.literal("mcp"),
    endpoint: z.url(),
    transport: z.literal("streamable-http"),
    remoteToolName: name,
    auth: SecretSchema.optional(),
    timeoutMs: positive.optional(),
    sideEffect: z.enum(["read", "write"]),
    idempotency: IdempotencySchema.optional(),
    idempotencyArgument: name.optional(),
  }),
]);
export const ToolSchema = z.strictObject({
  name,
  description: z.string().min(1).max(16000),
  inputSchema: JsonSchemaSchema,
  outputSchema: JsonSchemaSchema,
  execution: ExecutionSchema,
  reconciliation: BindingRefSchema.optional(),
  permission: z.enum(["allow", "require-approval", "deny"]).optional(),
});
export const SkillSchema = z
  .strictObject({
    id: name,
    name,
    description: z.string().min(1).max(16000),
    instructions: z.string().min(1).max(64000).optional(),
    source: z
      .strictObject({
        type: z.literal("loader"),
        loaderKey: name,
        version: name,
        hash: name.optional(),
      })
      .optional(),
    allowedTools: z.array(name),
  })
  .superRefine((v, c) => {
    if (!!v.instructions === !!v.source)
      c.addIssue({
        code: "custom",
        message: "Exactly one of instructions or source is required",
      });
  });
const readRef = z.union([
  BindingRefSchema,
  z.strictObject({
    type: z.literal("http"),
    endpoint: z.url(),
    auth: SecretSchema.optional(),
    timeoutMs: positive.optional(),
  }),
]);
export const KnowledgeSchema = z.strictObject({
  id: name,
  name,
  description: z.string().min(1),
  retriever: readRef,
  querySchema: JsonSchemaSchema,
  resultSchema: JsonSchemaSchema,
  defaults: z
    .strictObject({
      topK: positive.max(100).optional(),
      maxTokens: positive.optional(),
      filters: object.optional(),
    })
    .optional(),
  citation: z.strictObject({
    required: z.boolean(),
    outputPointer: z.string().regex(/^\//),
    fields: z.array(name).optional(),
  }),
});
export const MemorySchema = z.strictObject({
  stores: z.array(
    z.strictObject({
      id: name,
      adapter: BindingRefSchema,
      namespace: z.strictObject({
        tenantId: name,
        subjectId: name,
        agentId: name,
      }),
      read: z.strictObject({
        strategy: z.enum(["semantic", "none"]),
        topK: positive.max(100),
        maxTokens: positive,
      }),
      write: z
        .strictObject({
          strategy: z.literal("model-proposed-policy-approved"),
          idempotency: IdempotencySchema,
          retentionDays: positive.optional(),
          redactPII: z.boolean().optional(),
          reconciliation: BindingRefSchema.optional(),
        })
        .optional(),
    }),
  ),
});
export const RetrySchema = z.strictObject({
  model: z
    .strictObject({
      maxRetries: count.optional(),
      retryOn: z
        .array(
          z.enum([
            "timeout",
            "rate_limited",
            "provider_5xx",
            "connection_reset",
            "provider_unavailable",
            "auth_failed",
          ]),
        )
        .optional(),
      backoff: z
        .strictObject({
          type: z.literal("exponential-jitter"),
          initialDelayMs: count,
          maxDelayMs: count,
        })
        .optional(),
    })
    .optional(),
  outputRepair: z.strictObject({ maxAttempts: count }).optional(),
  toolInputRepair: z.strictObject({ maxAttempts: count }).optional(),
  readonlyTool: z.strictObject({ maxRetries: count }).optional(),
  writeTool: z.strictObject({ maxRetries: count }).optional(),
});
export const LoopSchema = z.strictObject({
  maxSteps: positive.optional(),
  maxModelAttempts: positive.optional(),
  maxCapabilityInvocations: positive.optional(),
  timeoutMs: positive.optional(),
});
export const BudgetSchema = z.strictObject({
  perRun: z.strictObject({
    maxInputTokens: positive.optional(),
    maxOutputTokens: positive.optional(),
    maxTotalTokens: positive.optional(),
    maxEstimatedCost: z
      .strictObject({ amount: z.number().positive(), currency: name })
      .optional(),
  }),
  warningAt: z.number().positive().max(1).optional(),
});
export const ContextSchema = z.strictObject({
  toolResultMaxTokens: positive.min(256).optional(),
  maxInputTokens: positive.optional(),
  reservedOutputTokens: positive.optional(),
  compaction: z
    .strictObject({
      triggerAtRatio: z.number().positive().max(1).optional(),
      targetAtRatio: z.number().positive().max(1).optional(),
      maxCyclesPerRun: count.optional(),
      summaryModel: name.optional(),
    })
    .optional(),
});
export const ModelSchema = z.strictObject({
  provider: name,
  baseURL: z.url(),
  apiKey: SecretSchema,
  model: name,
  limits: z.strictObject({
    contextWindowTokens: positive,
    maxOutputTokens: positive,
    maxInputTokens: positive.optional(),
  }),
  timeouts: z
    .strictObject({
      attemptMs: positive.optional(),
      streamIdleMs: positive.optional(),
    })
    .optional(),
  capabilities: z
    .strictObject({
      streaming: z.boolean().optional(),
      tools: z.boolean().optional(),
      thinking: z.boolean().optional(),
      structuredOutput: z.boolean().optional(),
    })
    .optional(),
  thinking: z
    .strictObject({
      enabled: z.boolean(),
      effort: z.enum(["low", "medium", "high"]).optional(),
      expose: z.enum(["none", "summary"]).optional(),
      budgetTokens: positive.optional(),
    })
    .optional(),
  requestDefaults: z
    .strictObject({
      temperature: z.number().min(0).max(2).optional(),
      top_p: z.number().min(0).max(1).optional(),
      seed: z.number().int().optional(),
    })
    .optional(),
  pricing: z
    .strictObject({
      currency: name,
      version: name.optional(),
      uncachedInputPerMillion: z.number().nonnegative().optional(),
      cacheReadInputPerMillion: z.number().nonnegative().optional(),
      cacheWriteInputPerMillion: z.number().nonnegative().optional(),
      outputPerMillion: z.number().nonnegative().optional(),
    })
    .optional(),
});
export const SessionConfigSchema = z.strictObject({
  schemaVersion: z.literal("1").default("1"),
  models: z.record(name, ModelSchema),
  routing: z.strictObject({
    primary: name,
    fallbacks: z.array(name).default([]),
    fallbackOn: z.array(name).optional(),
  }),
  tools: z.array(ToolSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  knowledgeBases: z.array(KnowledgeSchema).default([]),
  memory: MemorySchema.default({ stores: [] }),
  instructions: z.strictObject({ text: z.string().max(128000) }).optional(),
  context: ContextSchema.optional(),
  loop: LoopSchema.optional(),
  retry: RetrySchema.optional(),
  permissions: z
    .strictObject({
      policy: BindingRefSchema.optional(),
      timeoutMs: positive.optional(),
    })
    .optional(),
  budgets: BudgetSchema.optional(),
  interaction: z
    .strictObject({
      questions: z
        .strictObject({
          enabled: z.boolean(),
          answerSchema: JsonSchemaSchema,
          timeoutMs: positive,
        })
        .optional(),
      structuredInputs: z
        .array(
          z.strictObject({
            id: name,
            description: z.string(),
            answerSchema: JsonSchemaSchema,
            timeoutMs: positive,
          }),
        )
        .optional(),
    })
    .optional(),
  metadata: object.optional(),
});
export const OutputSchema = z.strictObject({
  schema: JsonSchemaSchema,
  mode: z.enum(["provider-native", "prompt-json"]).default("provider-native"),
  maxRepairAttempts: count.optional(),
});
export type SessionAgentConfig = z.output<typeof SessionConfigSchema>;
export type ModelConfig = z.output<typeof ModelSchema>;
export type ToolDefinition = z.output<typeof ToolSchema>;
export type SkillDefinition = z.output<typeof SkillSchema>;
export type KnowledgeBaseDefinition = z.output<typeof KnowledgeSchema>;
export type OutputConfig = z.output<typeof OutputSchema>;
export type Execution = z.output<typeof ExecutionSchema>;
export const DefaultsSchema = z.strictObject({
  retry: RetrySchema.optional(),
  loop: LoopSchema.optional(),
  context: ContextSchema.optional(),
  budgets: BudgetSchema.optional(),
});
export type EngineDefaults = z.output<typeof DefaultsSchema>;
export const defaults = freeze({
  version: "1",
  retry: {
    model: {
      maxRetries: 3,
      retryOn: ["timeout", "rate_limited", "provider_5xx", "connection_reset"],
      backoff: {
        type: "exponential-jitter",
        initialDelayMs: 300,
        maxDelayMs: 8000,
      },
    },
    outputRepair: { maxAttempts: 2 },
    toolInputRepair: { maxAttempts: 2 },
    readonlyTool: { maxRetries: 1 },
    writeTool: { maxRetries: 0 },
  },
  loop: {
    maxSteps: 16,
    maxModelAttempts: 64,
    maxCapabilityInvocations: 64,
    timeoutMs: 120000,
  },
  context: {
    compaction: {
      triggerAtRatio: 0.82,
      targetAtRatio: 0.6,
      maxCyclesPerRun: 2,
    },
  },
} as const);
const ajv = new Ajv({ strict: true, allErrors: true, validateFormats: false });
export function validateSchema(
  schema: unknown,
  value: unknown,
): { ok: boolean; issues: { path: string; keyword: string }[] } {
  try {
    const check = ajv.compile(schema as AnySchema);
    return {
      ok: !!check(value),
      issues: (check.errors ?? []).map((e) => ({
        path: e.instancePath,
        keyword: e.keyword,
      })),
    };
  } catch {
    return fail("CONFIG_INVALID", "Unsupported or invalid JSON Schema");
  }
}
export function normalizeSchema(schema: unknown): JsonValue {
  let result = schema;
  if (schema instanceof z.ZodType) {
    const seen = new Set<object>();
    const inspect = (value: unknown) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const v = value as any;
      if (v._zod?.def?.type === "custom" || v._zod?.def?.check === "custom")
        fail("CONFIG_INVALID", "Custom refinements need a versioned validator");
      if (v._zod?.def) inspect(v._zod.def);
      else for (const child of Object.values(v)) inspect(child);
    };
    inspect(schema);
    try {
      result = z.toJSONSchema(schema, {
        target: "draft-7",
        unrepresentable: "throw",
      });
    } catch {
      fail(
        "CONFIG_INVALID",
        "Schema cannot be losslessly converted to JSON Schema",
      );
    }
  }
  const out = json(result);
  validateSchema(out, undefined);
  return out;
}
// Normalization visits declared schema fields only. Executable values elsewhere are rejected.
function normalizeDefinitions(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(normalizeDefinitions);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[key] = [
      "inputSchema",
      "outputSchema",
      "querySchema",
      "resultSchema",
      "answerSchema",
      "schema",
    ].includes(key)
      ? normalizeSchema(value)
      : normalizeDefinitions(value);
  }
  if (
    Object.getPrototypeOf(input) !== Object.prototype &&
    Object.getPrototypeOf(input) !== null
  )
    fail("CONFIG_INVALID", "Non-JSON configuration");
  return out;
}
export function parseConfig(input: unknown): SessionAgentConfig {
  let config: SessionAgentConfig;
  try {
    config = SessionConfigSchema.parse(json(normalizeDefinitions(input)));
  } catch (e) {
    return fail(
      "CONFIG_INVALID",
      e instanceof Error && e.name === "AgentEngineError"
        ? e.message
        : "Invalid Session configuration",
    );
  }
  const unique = (values: string[]) => {
    if (new Set(values).size !== values.length)
      fail("CONFIG_INVALID", "Duplicate capability identifier");
  };
  unique(config.tools.map((t) => t.name));
  unique(config.skills.map((t) => t.id));
  unique(config.knowledgeBases.map((t) => t.id));
  unique(config.memory.stores.map((t) => t.id));
  for (const t of config.tools) {
    if (t.name.startsWith("engine."))
      fail("CONFIG_INVALID", "Reserved capability name");
    if (t.execution.sideEffect === "write" && !t.execution.idempotency)
      fail("CONFIG_INVALID", "Writes require stable business idempotency");
  }
  for (const s of config.skills)
    if (s.allowedTools.some((t) => !config.tools.some((x) => x.name === t)))
      fail("CONFIG_INVALID", "Skill tool is not declared");
  for (const alias of [
    config.routing.primary,
    ...config.routing.fallbacks,
    config.context?.compaction?.summaryModel,
  ].filter((v): v is string => !!v))
    if (!config.models[alias]) fail("CONFIG_INVALID", "Unknown model alias");
  for (const m of Object.values(config.models))
    if (m.limits.maxOutputTokens >= m.limits.contextWindowTokens)
      fail("CONFIG_INVALID", "Output reservation exceeds model window");
  return config;
}
export function mergeObjects(...values: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of values)
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        out[k] =
          x && typeof x === "object" && !Array.isArray(x)
            ? mergeObjects(out[k], x)
            : structuredClone(x);
      }
  return out;
}
export function effectiveConfig(
  config: SessionAgentConfig,
  engineDefaults: EngineDefaults = {},
  ceilings: EngineDefaults = {},
): SessionAgentConfig {
  const { version: _, ...base } = defaults;
  const out = parseConfig(
    mergeObjects(base, DefaultsSchema.parse(engineDefaults), config),
  );
  const check = (v: unknown, c: unknown, path: string) => {
    if (c && typeof c === "object")
      for (const [k, x] of Object.entries(c))
        check((v as Record<string, unknown>)?.[k], x, `${path}.${k}`);
    else if (typeof c === "number" && typeof v === "number" && v > c)
      fail("CONFIG_POLICY_VIOLATION", `Policy ceiling exceeded: ${path}`);
  };
  check(out, ceilings, "config");
  const compact = out.context!.compaction!;
  if (compact.targetAtRatio! >= compact.triggerAtRatio!)
    fail("CONFIG_INVALID", "Compaction target must be below trigger");
  return freeze(out);
}
export function parseOutput(input: unknown): OutputConfig {
  try {
    return OutputSchema.parse(normalizeDefinitions(input));
  } catch {
    return fail("CONFIG_INVALID", "Invalid output contract");
  }
}
export function defineSessionConfig(input: unknown): SessionAgentConfig {
  return parseConfig(input);
}
export function defineTool(input: unknown): ToolDefinition {
  try {
    return ToolSchema.parse(normalizeDefinitions(input));
  } catch {
    return fail("CONFIG_INVALID", "Invalid capability definition");
  }
}
export function defineSkill(input: unknown): SkillDefinition {
  try {
    return SkillSchema.parse(normalizeDefinitions(input));
  } catch {
    return fail("CONFIG_INVALID", "Invalid capability definition");
  }
}
export function defineKnowledgeBase(input: unknown): KnowledgeBaseDefinition {
  try {
    return KnowledgeSchema.parse(normalizeDefinitions(input));
  } catch {
    return fail("CONFIG_INVALID", "Invalid capability definition");
  }
}
export function configHash(input: SessionAgentConfig): string {
  return hash(input);
}

/** JSON-pointer paths explicitly provided by the host; arrays and schemas are atomic declarations. */
export function declaredConfigPaths(input: unknown, prefix = ""): string[] {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    /Schema$/.test(prefix)
  )
    return [prefix];
  const entries = Object.entries(input);
  if (!entries.length) return [prefix];
  return entries.flatMap(([key, value]) =>
    declaredConfigPaths(
      value,
      prefix + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1"),
    ),
  );
}
export interface ConfigProvenance {
  defaultsVersion: string;
  policyVersion: string;
  sources: Record<
    string,
    "session" | "engine-default" | "library-default" | "run-override"
  >;
}
export function configProvenance(
  value: SessionAgentConfig,
  declaredPaths: string[],
  engineDefaults: EngineDefaults = {},
  policy: unknown = {},
  overrides?: {
    model?: string;
    tools?: string[];
    loop?: SessionAgentConfig["loop"];
  },
): ConfigProvenance {
  const has = (paths: string[], path: string) =>
    paths.some((p) => p !== "" && (p === path || path.startsWith(p + "/")));
  const enginePaths = declaredConfigPaths(engineDefaults);
  const overridePaths = [
    ...(overrides?.model ? ["/routing/primary"] : []),
    ...(overrides?.tools ? ["/tools"] : []),
    ...declaredConfigPaths(overrides?.loop ?? {}, "/loop").filter(
      (p) => p !== "/loop",
    ),
  ];
  const sources: ConfigProvenance["sources"] = {};
  for (const path of declaredConfigPaths(value))
    sources[path] = has(overridePaths, path)
      ? "run-override"
      : has(declaredPaths, path)
        ? "session"
        : has(enginePaths, path)
          ? "engine-default"
          : "library-default";
  return {
    defaultsVersion: defaults.version + ":" + hash(engineDefaults),
    policyVersion: hash(policy),
    sources,
  };
}
