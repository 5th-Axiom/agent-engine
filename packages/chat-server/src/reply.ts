import type { RunRecord } from "@agent-runtime/sdk";
import type { Fact } from "./process.js";

/** Carry display identity across a draft becoming a committed message. */
export function projectReply(run: RunRecord, facts: Fact[]) {
  const active = !["completed", "failed", "cancelled"].includes(run.state);
  const draft = active ? Object.values(run.drafts ?? {}).at(-1) : undefined;
  const text = draft
    ? Object.values(draft.blocks)
        .filter((b) => b.kind === "text")
        .map((b) => b.text)
        .join("")
    : active && run.decision?.stopReason === "final"
      ? run.decision.blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
      : "";
  const committed = facts.findLast(
    (e) =>
      e.runId === run.id &&
      e.type === "content.message.committed" &&
      run.steps.find((s) => s.id === e.stepId)?.response?.stopReason ===
        "final",
  );
  const attempt = draft?.attemptId ?? committed?.attemptId;
  const first = facts.find(
    (e) =>
      e.runId === run.id &&
      e.attemptId === attempt &&
      e.type === "content.output.delta",
  );
  return {
    draft: text,
    ...(text || run.result?.outputText
      ? {
          reply: {
            id: attempt ? "message:" + attempt : run.id + ":reply",
            sequence:
              first?.sequence ??
              committed?.sequence ??
              Math.max(
                run.acceptedSequence ?? 0,
                ...facts
                  .filter((e) => e.runId === run.id)
                  .map((e) => e.sequence),
              ),
          },
        }
      : {}),
  };
}
