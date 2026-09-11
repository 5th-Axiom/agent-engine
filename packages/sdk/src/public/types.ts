import type { JsonValue, JsonObject } from "../protocol/json.js";
import type {
  SessionAgentConfig,
  OutputConfig,
  EngineDefaults,
  ToolDefinition,
} from "../config/schema.js";
import type { RunState } from "../run/state.js";
import type {
  ModelAdapter,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  Clock,
} from "../model/types.js";
import type { ErrorDTO } from "../errors/index.js";
import type { EngineStore } from "../storage/store.js";
import type { UsageRecord } from "../usage/ledger.js";
export interface VerifiedPrincipal {
  tenantId: string;
  subjectId: string;
}
export interface BindingContext {
  principal: VerifiedPrincipal;
  runId: string;
  context: JsonObject;
  signal: AbortSignal;
  operationId: string;
  idempotencyKey: string;
}
export interface BindingContract {
  methods?: { read?: "read"; write?: "write" };
  version: string;
  sideEffect: "read" | "write";
  namespace?: string;
  execute: (input: JsonValue, context: BindingContext) => Promise<JsonValue>;
}
export interface AuthorizationRequest {
  data?: JsonObject;
  principal: VerifiedPrincipal;
  action:
    | "session"
    | "config"
    | "model"
    | "capability"
    | "secret"
    | "resolve"
    | "data";
  resource: string;
  sessionId?: string;
  sideEffect?: "read" | "write";
}
export interface EngineOptions {
  store: EngineStore;
  principal: VerifiedPrincipal;
  secrets: {
    resolve(ref: string, principal: VerifiedPrincipal): Promise<string>;
  };
  authorize?: (request: AuthorizationRequest) => Promise<boolean>;
  bindings?: Record<string, BindingContract>;
  adapters?: { models?: Record<string, ModelAdapter> };
  defaults?: EngineDefaults;
  policy?: {
    ceilings?: EngineDefaults;
    promptRetention?: string;
    protocolPayloadRetention?: string;
    thinkingDisplayRetention?: "none" | "session";
    toolResultRetention?: string;
    knowledgeRetention?: string;
    memoryRetention?: string;
    allowedOrigins?: string[];
    allowedModelTargets?: {
      provider: string;
      origin: string;
      credentialScopes: string[];
    }[];
    allowedExecutorTypes?: ("binding" | "http" | "mcp")[];
    allowPrivateOrigins?: string[];
  };
  limits?: {
    maxAcceptedRuns?: number;
    maxConcurrentModelRequests?: number;
    maxConcurrentCapabilityRequests?: number;
    maxConcurrentMaintenanceRequests?: number;
    maxReconciliationsPerOperation?: number;
  };
  protocolKey?: { secretRef: string };
  usageSettlementMs?: number;
  clock?: Clock;
  telemetry?: import("../telemetry/index.js").TelemetryConfig;
  remoteContracts?: Record<
    string,
    { version: string; sideEffect: "read" | "write"; namespace?: string }
  >;
  fault?: (point: string) => void;
}
export interface RunInput {
  requestId?: string;
  ifConfigVersion?: number;
  input: JsonValue;
  context?: JsonObject;
  metadata?: JsonObject;
  output?: unknown;
  overrides?: {
    model?: string;
    tools?: string[];
    loop?: SessionAgentConfig["loop"];
  };
}
export interface RunResult {
  runId: string;
  outputText: string;
  output: JsonValue;
  citations: JsonValue[];
}
export interface PendingInput {
  id: string;
  kind: "permission" | "question" | "structured_input";
  expiresAt: number;
  schema?: JsonValue;
  operationId?: string;
  question: string;
  resolution?: JsonValue;
}
export interface SessionRecord {
  id: string;
  principal: VerifiedPrincipal;
  version: number;
  config: SessionAgentConfig;
  configVersions: SessionAgentConfig[];
  declaredPaths?: string[];
  archived: boolean;
  deleted: boolean;
  activeRun?: string;
  createdAt?: number;
  expiresAt?: number;
  dataExpiredAt?: number;
  history: ModelMessage[];
  contextView?: ModelMessage[];
}
export interface StepRecord {
  contextEstimate?: {
    method: "utf8-byte-upper-bound";
    total: number;
    messages: number;
    capabilities: number;
    reservedOutput: number;
  };
  id: string;
  request: ModelRequest;
  hash: string;
  attempts: string[];
  attemptRequests?: Record<string, { request: ModelRequest; hash: string }>;
  response?: ModelResponse;
  responseCommitted?: boolean;
}
export interface RunRecord {
  /** Immutable sequence of the transactionally committed run.queued event. */
  acceptedSequence?: number;
  usageSettleAt?: number;
  usageSettledAt?: number;
  dataExpiredAt?: number;
  id: string;
  sessionId: string;
  principal: VerifiedPrincipal;
  requestId: string;
  requestHash: string;
  configVersion: number;
  configProvenance?: import("../config/schema.js").ConfigProvenance;
  config: SessionAgentConfig;
  dependencies: Record<string, string>;
  input: JsonValue;
  context: JsonObject;
  metadata: JsonObject;
  output?: OutputConfig;
  state: RunState;
  revision: number;
  cancelRequested: boolean;
  messages: ModelMessage[];
  historyPrefixLength?: number;
  drafts?: Record<
    string,
    {
      messageId: string;
      attemptId: string;
      stepId: string;
      blocks: Record<string, { kind: "text" | "thinking"; text: string }>;
      bytes: number;
    }
  >;
  steps: StepRecord[];
  usage: UsageRecord[];
  decision?: ModelResponse;
  cursor: number;
  operationIds: string[];
  operationRefs?: string[];
  pending?: PendingInput;
  activeSkill?: string;
  loadedSkills: Record<string, string>;
  sources: Record<string, JsonValue>;
  outputRepairs: number;
  inputRepairs: number;
  capabilityInvocations: number;
  memoryReadDone?: boolean;
  budgetWarningEmitted?: boolean;
  compactionCycles?: number;
  compaction?: {
    sourceHash: string;
    sourceRefs?: import("../model/types.js").ContextDataRef[];
    targetBytes?: number;
    summaryInputLimit?: number;
    mergeRounds?: number;
    chunks: ModelMessage[][];
    summaries: string[];
    recent: ModelMessage[];
    index: number;
    previousMessages: ModelMessage[];
  };
  activeMs: number;
  lastActiveAt?: number;
  result?: RunResult;
  error?: ErrorDTO;
}
export interface OperationRecord {
  reconciliationAttempts?: number;
  dataExpiredAt?: number;
  receiptHash?: string;
  id: string;
  tenantId: string;
  runId: string;
  sessionId: string;
  tool: ToolDefinition;
  capabilityKind?: "tool" | "knowledge" | "memory";
  args: JsonValue;
  argsHash: string;
  businessKey?: string;
  idempotencyKey: string;
  executionStatus:
    | "planned"
    | "dispatching"
    | "succeeded"
    | "failed"
    | "not_executed"
    | "outcome_unknown";
  validations?: Record<
    string,
    {
      runId: string;
      toolCallId: string;
      schemaHash: string;
      status: "not_applicable" | "pending" | "valid" | "invalid";
    }
  >;
  validationStatus: "not_applicable" | "pending" | "valid" | "invalid";
  receipt?: JsonValue;
  error?: ErrorDTO;
  evidenceRef?: string;
}
