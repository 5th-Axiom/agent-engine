import {
  AgentEngineError,
  type AgentEngine,
  type AgentEvent,
  type RunRecord,
} from "@agent-runtime/sdk";
import {
  type ChatProcessEntry,
  type ChatRun,
  processEntrySchema,
} from "@agent-runtime/chat-core";
import type { ChatAssistantDefinition } from "./types.js";

type Fact = {
  type: string;
  sequence: number;
  timestamp: string;
  runId: string;
  stepId?: string;
  attemptId?: string;
  blockId?: string;
  operationId?: string;
  toolCallId?: string;
  data: Record<string, unknown>;
};
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : undefined;
// Provider display text requires explicit host permission. Never read native/signature blocks.
function fact(
  event: AgentEvent,
  thinking: "none" | "summary" | "content",
): Fact | undefined {
  if (
    !("runId" in event) ||
    !/^(run\.|model\.|tool\.|skill\.|knowledge\.|memory\.|context\.|output\.|budget\.|input\.|content\.)/.test(
      event.type,
    )
  )
    return;
  if (event.type === "usage.recorded") return;
  const e = event as AgentEvent & Fact;
  if (
    e.type === "content.thinking.delta" &&
    (thinking === "none" ||
      (thinking === "summary" && e.data.format === "content"))
  )
    return;
  const data: Record<string, unknown> = {};
  for (const key of [
    "phase",
    "name",
    "capabilityKind",
    "stopReason",
    "reason",
    "code",
    "format",
  ])
    if (typeof e.data[key] === "string") data[key] = text(e.data[key], 160);
  if (e.type === "content.output.delta" || e.type === "content.thinking.delta")
    data.text = text(e.data.text, 8000);
  return {
    type: e.type,
    sequence: e.sequence,
    timestamp: e.timestamp,
    runId: e.runId,
    stepId: e.stepId,
    attemptId: e.attemptId,
    blockId: e.blockId,
    operationId: e.operationId,
    toolCallId: e.toolCallId,
    data,
  };
}
/** Per-handler bounded journal cache. Every read still authenticates the Session and its sources. */
export class ProcessJournal {
  private sessions = new Map<
    string,
    { through: number; facts: Fact[]; complete: boolean; thinking: string }
  >();
  async read(
    engine: AgentEngine,
    sessionId: string,
    first: number,
    through: number,
    thinking: "none" | "summary" | "content" = "none",
  ) {
    // readSession performs ownership, retention and source authorization even on a cache hit.
    await engine.readSession(sessionId);
    let cached = structuredClone(this.sessions.get(sessionId));
    if (!cached || cached.through > through || cached.thinking !== thinking)
      cached = {
        thinking,
        through: Math.max(first - 1, through - 6000, 0),
        facts: [],
        complete: through - 6000 <= first - 1,
      };
    if (through - cached.through > 6000) {
      cached = {
        through: through - 6000,
        facts: [],
        complete: false,
        thinking,
      };
    }
    try {
      while (cached.through < through) {
        const page = await engine.listEvents(sessionId, {
          afterSequence: cached.through,
          throughSequence: through,
          limit: 1000,
        });
        for (const event of page.events) {
          const next = fact(event, thinking);
          if (!next) continue;
          const previous = cached.facts.at(-1);
          if (
            ["content.output.delta", "content.thinking.delta"].includes(
              next.type,
            ) &&
            previous?.type === next.type &&
            previous.attemptId === next.attemptId &&
            previous.blockId === next.blockId &&
            previous.data.format === next.data.format
          ) {
            previous.data.text = text(
              String(previous.data.text ?? "") + String(next.data.text ?? ""),
              8000,
            );
          } else cached.facts.push(next);
        }
        if (page.nextSequence === cached.through) {
          cached.complete = false;
          break;
        }
        cached.through = page.nextSequence;
      }
    } catch (error) {
      this.sessions.delete(sessionId);
      if (
        !(error instanceof AgentEngineError) ||
        error.code !== "EVENT_CURSOR_EXPIRED"
      )
        throw error;
      const snapshot = await engine.snapshot(sessionId);
      cached = {
        thinking,
        through: snapshot.snapshotSequence,
        complete: false,
        facts: snapshot.draftEvents.flatMap((event) => {
          const value = fact(event, thinking);
          return value ? [value] : [];
        }),
      };
    }
    if (cached.facts.length > 1200) {
      cached.facts = cached.facts.slice(-1200);
      cached.complete = false;
    }
    let size = cached.facts.reduce(
      (total, event) => total + JSON.stringify(event).length,
      0,
    );
    while (size > 512000 && cached.facts.length) {
      size -= JSON.stringify(cached.facts.shift()!).length;
      cached.complete = false;
    }
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, cached);
    while (this.sessions.size > 32)
      this.sessions.delete(this.sessions.keys().next().value!);
    return cached;
  }
}

export function projectProcess(
  run: RunRecord,
  facts: Fact[],
  observedAt: number,
  assistant: ChatAssistantDefinition,
): NonNullable<ChatRun["process"]> {
  const entries = new Map<string, ChatProcessEntry>();
  const calls = new Map<
    string,
    { id: string; stepId?: string; operationId?: string }
  >();
  let modelStep: string | undefined;
  const attemptTexts = new Map<string, string>();
  const terminal = ["completed", "failed", "cancelled"].includes(run.state);
  const runFacts = facts.filter((event) => event.runId === run.id);
  let contextId: string | undefined;
  let waitId: string | undefined;
  let end: number | undefined;
  const put = (
    event: Fact,
    id: string,
    kind: ChatProcessEntry["kind"],
    label: string,
    state: ChatProcessEntry["state"],
  ) => {
    const timestamp = Date.parse(event.timestamp);
    const previous = entries.get(id);
    const item: ChatProcessEntry = {
      ...previous,
      id,
      kind,
      label: label.slice(0, 200),
      state,
      sequence: previous?.sequence ?? event.sequence,
      startedAt: previous?.startedAt ?? timestamp,
      ...(state === "completed" || state === "failed" || state === "cancelled"
        ? { endedAt: timestamp }
        : {}),
    };
    if (state === "running" || state === "waiting") delete item.endedAt;
    entries.set(id, item);
    return item;
  };
  for (const event of runFacts) {
    const t = event.type,
      name = String(event.data.name ?? ""),
      id = event.operationId ?? event.attemptId ?? String(event.sequence);
    if (t === "run.queued") put(event, "queue", "run", "排队", "running");
    if (t === "run.started" && entries.has("queue"))
      put(event, "queue", "run", "排队", "completed");
    if (["run.completed", "run.failed", "run.cancelled"].includes(t))
      end = Date.parse(event.timestamp);
    if (t === "model.requested")
      put(event, "model:" + id, "model", "请求模型", "running");
    if (t === "model.streaming") {
      const phase = event.data.phase;
      const label =
        phase === "thinking"
          ? "思考"
          : phase === "tool-call"
            ? "准备调用工具"
            : phase === "text"
              ? "生成回答"
              : "模型处理中";
      const prior = entries.get("model:" + id);
      if (prior) put(event, prior.id, "model", prior.label, "completed");
      // Each observed phase is one stable row; finishing a phase is an observation, not inferred reasoning text.
      for (const item of entries.values())
        if (
          (item.id.startsWith("phase:" + id + ":") ||
            (phase !== "thinking" &&
              item.id.startsWith("thought:" + id + ":"))) &&
          item.state === "running"
        )
          put(event, item.id, item.kind, item.label, "completed");
      put(
        event,
        `phase:${id}:${phase}`,
        phase === "thinking" ? "thinking" : "model",
        label,
        "running",
      );
    }
    if (
      t === "content.thinking.delta" &&
      assistant.thinkingDisplay &&
      (assistant.thinkingDisplay === "content" ||
        event.data.format !== "content")
    ) {
      const thoughtId = `thought:${id}:${event.blockId ?? "thinking"}`;
      entries.delete(`phase:${id}:thinking`);
      const prior = entries.get(thoughtId)?.output ?? "";
      const item = put(
        event,
        thoughtId,
        "thinking",
        event.data.format === "content" ? "思考过程" : "思考摘要",
        "running",
      );
      item.output = (prior + String(event.data.text ?? "")).slice(0, 8000);
    }
    if (t === "model.completed" || t === "model.failed") {
      if (t === "model.completed") modelStep = event.stepId;
      for (const item of entries.values())
        if (
          item.id === "model:" + id ||
          item.id.startsWith("phase:" + id + ":") ||
          item.id.startsWith("thought:" + id + ":")
        )
          if (item.state === "running")
            put(
              event,
              item.id,
              item.kind,
              item.label,
              t === "model.failed" ? "failed" : "completed",
            );
      if (t === "model.failed") {
        entries.delete("message:" + id);
        attemptTexts.delete(id);
        for (const key of entries.keys())
          if (key.startsWith(`thought:${id}:`)) entries.delete(key);
      }
      if (t === "model.completed" && event.data.stopReason === "final")
        entries.delete("message:" + id);
    }
    if (t === "content.output.delta" && event.attemptId)
      attemptTexts.set(
        id,
        (attemptTexts.get(id) ?? "") + String(event.data.text ?? ""),
      );
    if (t === "content.message.committed") {
      const committed = run.steps
        .find((step) => step.id === event.stepId)
        ?.response?.blocks.filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const message = committed || attemptTexts.get(id);
      if (message) {
        const item = put(
          event,
          "message:" + id,
          "message",
          "阶段说明",
          "completed",
        );
        item.output = message.slice(0, 8000);
      }
    }
    if (t === "content.message.discarded") {
      entries.delete("message:" + id);
      attemptTexts.delete(id);
      for (const key of entries.keys())
        if (key.startsWith(`thought:${id}:`)) entries.delete(key);
    }
    if (/^(tool|knowledge|memory)\./.test(t) && name) {
      const kind =
        t.startsWith("knowledge") || event.data.capabilityKind === "knowledge"
          ? "knowledge"
          : t.startsWith("memory") || event.data.capabilityKind === "memory"
            ? "memory"
            : "tool";
      const display = assistant.toolDisplay?.[name]?.label;
      const label =
        display ??
        (kind === "knowledge"
          ? "检索知识 · " + name.replace(/^engine\.knowledge\./, "")
          : kind === "memory"
            ? (name.includes("write") ? "写入记忆 · " : "读取记忆 · ") +
              name.replace(/^engine\.memory\.(read|write)\./, "")
            : name);
      const state = /failed|invalid|rejected/.test(t)
        ? "failed"
        : /outcome_unknown|approval_requested|proposed/.test(t)
          ? "waiting"
          : /completed|outcome_resolved/.test(t)
            ? "completed"
            : "running";
      if (
        t === "tool.started" &&
        facts.some(
          (prior) =>
            prior.runId === run.id &&
            prior.type === t &&
            prior.operationId === event.operationId &&
            prior.sequence < event.sequence,
        )
      )
        put(
          event,
          "retry:" + event.sequence,
          "retry",
          "重试工具 · " + label,
          "completed",
        );
      const item = put(event, "op:" + id, kind, label, state);
      if (event.toolCallId && !calls.has(item.id))
        calls.set(item.id, {
          id: event.toolCallId,
          stepId: modelStep,
          operationId: event.operationId,
        });
      if (t.endsWith("outcome_unknown"))
        item.output = "执行结果待核验，尚不能确认成功。";
    }
    if (t.startsWith("skill.")) {
      const skill = run.config.skills.find((skill) => skill.id === name);
      put(
        event,
        "skill:" + id,
        "skill",
        (t === "skill.exited" ? "退出技能 · " : "加载技能 · ") +
          (skill?.name ?? name),
        t === "skill.selected"
          ? "running"
          : t === "skill.failed"
            ? "failed"
            : "completed",
      );
    }
    if (
      t === "model.retrying" ||
      t === "model.fallback" ||
      t === "run.recovering"
    ) {
      const item = put(
        event,
        "event:" + event.sequence,
        "retry",
        t === "model.fallback"
          ? "切换备用模型"
          : t === "run.recovering"
            ? "恢复执行"
            : "重试模型请求",
        "completed",
      );
      item.output = text(event.data.reason, 160);
    }
    if (t.startsWith("context.compaction.")) {
      if (t.endsWith("started") || !contextId)
        contextId = "context:" + event.sequence;
      put(
        event,
        contextId,
        "context",
        "整理上下文",
        t.endsWith("started")
          ? "running"
          : t.endsWith("failed")
            ? "failed"
            : "completed",
      );
      if (!t.endsWith("started")) contextId = undefined;
    }
    if (t === "context.thinned")
      put(
        event,
        "event:" + event.sequence,
        "context",
        "精简上下文",
        "completed",
      );
    if (t === "output.repairing")
      put(
        event,
        "event:" + event.sequence,
        "context",
        "修正输出格式",
        "completed",
      );
    if (t === "budget.warning" || t === "budget.exceeded")
      put(
        event,
        "event:" + event.sequence,
        "warning",
        t === "budget.warning" ? "接近本轮预算" : "已达到本轮预算",
        t === "budget.warning" ? "completed" : "failed",
      );
    if (t === "run.awaiting_input" || t === "run.awaiting_tool_resolution") {
      waitId = "wait:" + event.sequence;
      put(
        event,
        waitId,
        "waiting",
        t.endsWith("tool_resolution") ? "等待核验执行结果" : "等待输入或确认",
        "waiting",
      );
    }
    if (t === "input.resolved" && waitId) {
      put(event, waitId, "waiting", "已收到输入或确认", "completed");
      waitId = undefined;
    }
  }
  // Completed history must stay stable across polling, including after event expiry.
  if (terminal)
    observedAt =
      end ?? (runFacts.length ? Date.parse(runFacts.at(-1)!.timestamp) : 0);
  for (const item of entries.values()) {
    if (terminal && ["running", "waiting"].includes(item.state)) {
      item.state =
        run.state === "completed"
          ? "completed"
          : run.state === "cancelled"
            ? "cancelled"
            : "failed";
      item.endedAt = end ?? observedAt;
    }
    if (
      !["tool", "knowledge", "memory"].includes(item.kind) ||
      !assistant.describeProcess
    )
      continue;
    const ref = calls.get(item.id);
    const call = run.steps
      .find((step) => step.id === ref?.stepId)
      ?.response?.blocks.find(
        (block) => block.type === "tool_call" && block.id === ref?.id,
      );
    if (!call || call.type !== "tool_call") continue;
    const observation = run.messages.find(
      (message) =>
        message.role === "tool" && message.operationId === ref?.operationId,
    );
    try {
      const description = assistant.describeProcess({
        name: call.name,
        input: call.arguments,
        ...(observation ? { output: JSON.parse(observation.content) } : {}),
      });
      if (description?.input) item.input = text(description.input, 2000);
      if (description?.output) item.output = text(description.output, 8000);
    } catch {
      /* Optional host display cannot break the conversation. */
    }
  }
  const result = [...entries.values()].sort((a, b) => a.sequence - b.sequence);
  const pending =
    run.pending && !run.pending.resolution
      ? {
          kind: run.pending.kind,
          question: run.pending.question.slice(0, 4000),
          expiresAt: run.pending.expiresAt,
        }
      : undefined;
  return {
    thinkingDisplay: assistant.thinkingDisplay ?? "none",
    entries: result.slice(-600).map((item) => processEntrySchema.parse(item)),
    complete:
      result.length <= 600 &&
      facts.some(
        (event) => event.runId === run.id && event.type === "run.queued",
      ),
    observedAt,
    activeMs: Math.max(
      0,
      run.activeMs +
        (run.lastActiveAt === undefined ? 0 : observedAt - run.lastActiveAt),
    ),
    ...(pending ? { pending } : {}),
  };
}
