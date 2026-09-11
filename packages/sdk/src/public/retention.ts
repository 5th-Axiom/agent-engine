import { clone, hash } from "../protocol/json.js";
import type { SessionAgentConfig } from "../config/schema.js";
import type {
  EngineOptions,
  SessionRecord,
  RunRecord,
  OperationRecord,
} from "./types.js";
export function retentionMs(value: string): number {
  const match = /^(?:encrypted-)?([1-9][0-9]*)(ms|s|m|h|d)$/.exec(value);
  if (!match) return Infinity;
  return (
    Number(match[1]) *
    { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]!]!
  );
}
export function retentionDeadline(
  now: number,
  config: SessionAgentConfig,
  policy: EngineOptions["policy"],
): number {
  const limits = [retentionMs(policy?.promptRetention ?? "7d")];
  if (
    Object.values(config.models).some((model) => model.thinking?.enabled) &&
    policy?.protocolPayloadRetention !== "none"
  )
    limits.push(
      retentionMs(policy?.protocolPayloadRetention ?? "encrypted-7d"),
    );
  if (
    config.tools.length &&
    policy?.toolResultRetention &&
    policy.toolResultRetention !== "policy-based"
  )
    limits.push(retentionMs(policy.toolResultRetention));
  if (config.knowledgeBases.length && policy?.knowledgeRetention)
    limits.push(retentionMs(policy.knowledgeRetention));
  if (config.memory.stores.length && policy?.memoryRetention)
    limits.push(retentionMs(policy.memoryRetention));
  return now + Math.min(...limits);
}
function redactConfig(config: SessionAgentConfig): SessionAgentConfig {
  const value = clone(config);
  delete value.instructions;
  delete value.metadata;
  for (const tool of value.tools) {
    tool.description = "[expired]";
    tool.inputSchema = {};
    tool.outputSchema = {};
  }
  for (const skill of value.skills) {
    skill.description = "[expired]";
    if (skill.instructions) skill.instructions = "[expired]";
  }
  for (const kb of value.knowledgeBases) {
    kb.description = "[expired]";
    kb.querySchema = {};
    kb.resultSchema = {};
    if (kb.defaults) delete kb.defaults.filters;
  }
  if (value.interaction) {
    delete value.interaction.questions;
    delete value.interaction.structuredInputs;
  }
  return value;
}
export function redactSession(session: SessionRecord): void {
  if (session.dataExpiredAt === undefined) return;
  session.history = [];
  session.contextView = [];
  session.config = redactConfig(session.config);
  session.configVersions = session.configVersions.map(redactConfig);
}
export function redactRun(run: RunRecord): void {
  if (run.dataExpiredAt === undefined) return;
  if (run.error) run.error.message = run.error.code;
  run.input = null;
  run.context = {};
  run.metadata = {};
  run.messages = [];
  run.sources = {};
  run.loadedSkills = {};
  run.drafts = {};
  delete run.compaction;
  delete run.pending;
  delete run.activeSkill;
  delete run.decision;
  delete run.result;
  run.config = redactConfig(run.config);
  delete run.output;
  for (const step of run.steps) {
    step.responseCommitted = step.responseCommitted || !!step.response;
    delete step.response;
    step.request.messages = [];
    step.request.tools = [];
    delete step.request.outputSchema;
    for (const snapshot of Object.values(step.attemptRequests ?? {})) {
      snapshot.request.messages = [];
      snapshot.request.tools = [];
      delete snapshot.request.outputSchema;
    }
  }
}
export function redactOperation(operation: OperationRecord): void {
  if (operation.dataExpiredAt === undefined) return;
  if (operation.error) operation.error.message = operation.error.code;
  delete operation.businessKey;
  operation.args = null;
  if (operation.receipt !== undefined)
    operation.receiptHash = hash(operation.receipt);
  delete operation.receipt;
  operation.tool = {
    ...operation.tool,
    description: "[expired]",
    inputSchema: {},
    outputSchema: {},
  };
}
