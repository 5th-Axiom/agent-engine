export const errorCodes = [
  "DATA_RETENTION_EXPIRED",
  "CONFIG_INVALID",
  "CONFIG_POLICY_VIOLATION",
  "CONFIG_VERSION_CONFLICT",
  "SESSION_REQUEST_CONFLICT",
  "SESSION_ARCHIVED",
  "SESSION_BUSY",
  "ENGINE_BUSY",
  "ENGINE_CLOSED",
  "RUN_REQUEST_CONFLICT",
  "RECOVERY_DEPENDENCY_MISMATCH",
  "CAPABILITY_NOT_FOUND",
  "MODEL_CAPABILITY_MISMATCH",
  "MODEL_AUTH_FAILED",
  "MODEL_RATE_LIMITED",
  "MODEL_TIMEOUT",
  "MODEL_PROVIDER_ERROR",
  "MODEL_PROTOCOL_ERROR",
  "MODEL_EMPTY_OUTPUT",
  "MODEL_OUTPUT_LIMIT",
  "MODEL_REFUSED",
  "MODEL_CONTENT_FILTERED",
  "MODEL_CONTINUATION_UNAVAILABLE",
  "MODEL_HISTORY_INCOMPATIBLE",
  "TOOL_INPUT_INVALID",
  "TOOL_OUTPUT_INVALID",
  "TOOL_PERMISSION_DENIED",
  "TOOL_TIMEOUT",
  "TOOL_EXECUTION_FAILED",
  "TOOL_OUTCOME_UNKNOWN",
  "TOOL_OPERATION_CONFLICT",
  "KNOWLEDGE_QUERY_FAILED",
  "MEMORY_OPERATION_FAILED",
  "MEMORY_VERSION_CONFLICT",
  "OUTPUT_SCHEMA_INVALID",
  "CONTEXT_BUDGET_EXCEEDED",
  "BUDGET_EXCEEDED",
  "BUDGET_UNVERIFIABLE",
  "INPUT_EXPIRED",
  "INPUT_ALREADY_RESOLVED",
  "EVENT_CURSOR_EXPIRED",
  "EVENT_CURSOR_INVALID",
  "SUBSCRIPTION_LAGGED",
  "ACCESS_DENIED",
  "RUN_CANCELLED",
  "STORE_UNAVAILABLE",
  "STORE_LOCK_LOST",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export type ReplaySafety = "safe" | "idempotent" | "unsafe" | "unknown";
export interface ErrorDTO {
  code: ErrorCode;
  category: string;
  message: string;
  retryable: boolean;
  replaySafety: ReplaySafety;
}
export class AgentEngineError extends Error implements ErrorDTO {
  readonly category: string;
  constructor(
    readonly code: ErrorCode,
    message: string = code,
    readonly retryable = false,
    readonly replaySafety: ReplaySafety = "unknown",
  ) {
    super(message);
    this.name = "AgentEngineError";
    this.category = code.split("_")[0]!.toLowerCase();
  }
  toJSON(): ErrorDTO {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      replaySafety: this.replaySafety,
    };
  }
}
export function fail(code: ErrorCode, message?: string): never {
  throw new AgentEngineError(code, message);
}
export function asEngineError(error: unknown): AgentEngineError {
  return error instanceof AgentEngineError
    ? error
    : new AgentEngineError("INTERNAL_ERROR");
}
