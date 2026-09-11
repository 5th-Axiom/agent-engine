import type { ChatRun } from "@agent-runtime/chat-core";
import { element } from "../atoms/index.js";
import {
  defaultChatCopy,
  runLabels,
  explainChatError,
  type ChatCopy,
} from "../copy.js";
export interface MessageViewData {
  sender: "self" | "agent";
  name: string;
  text: string;
}
export interface ChatSourceLink {
  label: string;
  href: string;
}
export interface TimelineOptions {
  /** Resolve public reference links for a completed reply. No model HTML is rendered. */
  getRunSources?: (run: ChatRun) => readonly ChatSourceLink[];
}
export function createMessage(data: MessageViewData) {
  const root = element("section", "ae-message ae-message-" + data.sender);
  const name = element("p", "ae-message-name");
  const text = element("p", "ae-message-text");
  root.append(name, text);
  const update = (next: MessageViewData) => {
    root.className = "ae-message ae-message-" + next.sender;
    name.textContent = next.name;
    text.textContent = next.text;
  };
  update(data);
  return { element: root, update };
}
export function createRunDetails(copy: ChatCopy = defaultChatCopy) {
  const root = element("details", "ae-run-details");
  const summary = element("summary");
  const usage = element("p");
  const attempts = element("p");
  const operations = element("div");
  root.append(summary, usage, attempts, operations);
  return {
    element: root,
    update: (run: ChatRun) => {
      summary.textContent = `${copy.details} · ${run.usage.total ?? "—"} Token`;
      usage.textContent = `输入 ${run.usage.input ?? "—"} · 输出 ${run.usage.output ?? "—"} · ${run.usage.complete ? "用量完整" : "用量尚不完整"} · ${run.usage.costComplete ? "费用估算完整" : "费用估算不完整"}`;
      attempts.textContent = `模型请求 ${run.attempts} · 执行步骤 ${run.steps}`;
      operations.replaceChildren(
        ...run.operations.map((o) => {
          const row = element("p", "ae-operation");
          row.append(
            element("strong", "", o.name),
            document.createTextNode(
              ` · ${o.state === "succeeded" ? "已执行" : o.state === "failed" ? "执行失败" : o.state === "outcome_unknown" ? "结果待核验" : "执行中"} · ${o.validation === "valid" ? "结果校验通过" : o.validation === "invalid" ? "结果校验失败" : "等待结果"}`,
            ),
          );
          return row;
        }),
      );
    },
  };
}
/** Presentation only: no API calls, no controller, no scroll mutation. */
export function createMessageTimeline(
  copy: ChatCopy = defaultChatCopy,
  options: TimelineOptions = {},
) {
  const root = element("div", "ae-timeline");
  const turns = new Map<
    string,
    {
      element: HTMLElement;
      user: ReturnType<typeof createMessage>;
      agent: ReturnType<typeof createMessage>;
      status: HTMLElement;
      details: ReturnType<typeof createRunDetails>;
      sources: HTMLElement;
      fingerprint: string;
    }
  >();
  return {
    element: root,
    update: (runs: ChatRun[]) => {
      const keep = new Set(runs.map((r) => r.id));
      for (const [id, turn] of turns)
        if (!keep.has(id)) {
          turn.element.remove();
          turns.delete(id);
        }
      for (const run of runs) {
        let turn = turns.get(run.id);
        if (!turn) {
          const container = element("article", "ae-turn");
          container.dataset.runId = run.id;
          const user = createMessage({
            sender: "self",
            name: copy.self,
            text: "",
          });
          const agent = createMessage({
            sender: "agent",
            name: copy.assistant,
            text: "",
          });
          const status = element("p", "ae-turn-state");
          const details = createRunDetails(copy);
          const sources = element("nav", "ae-sources");
          sources.setAttribute("aria-label", "本条回答的参考资料");
          sources.hidden = true;
          container.append(
            user.element,
            agent.element,
            sources,
            status,
            details.element,
          );
          turn = {
            element: container,
            user,
            agent,
            status,
            details,
            sources,
            fingerprint: "",
          };
          turns.set(run.id, turn);
          root.append(container);
        }
        const fingerprint = JSON.stringify(run);
        if (turn.fingerprint === fingerprint) continue;
        turn.fingerprint = fingerprint;
        turn.user.update({ sender: "self", name: copy.self, text: run.input });
        const active = !["completed", "failed", "cancelled"].includes(
          run.state,
        );
        turn.agent.update({
          sender: "agent",
          name: copy.assistant,
          text: run.output || (active ? run.draft || "正在准备回答…" : ""),
        });
        turn.agent.element.hidden = !active && !run.output;
        turn.status.textContent =
          run.state === "cancelled"
            ? runLabels.cancelled!
            : run.errorCode
              ? explainChatError(run.errorCode)
              : run.cancelRequested && active
                ? "正在确认停止…"
                : (runLabels[run.state] ?? run.state);
        turn.status.classList.toggle("ae-error-text", run.state === "failed");
        turn.details.update(run);
        turn.sources.replaceChildren();
        if (run.state === "completed" && options.getRunSources) {
          try {
            for (const source of options.getRunSources(run).slice(0, 8)) {
              const url = new URL(source.href, location.href);
              if (
                !/^https?:$/.test(url.protocol) ||
                url.username ||
                url.password
              )
                continue;
              const link = element("a", "", source.label);
              link.href = url.href;
              // Keep the active conversation and draft in place while reading a source.
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.setAttribute("aria-label", source.label + "（新标签页）");
              turn.sources.append(link);
            }
          } catch {
            // A host reference resolver cannot interrupt rendering or sending.
            turn.sources.replaceChildren();
          }
        }
        turn.sources.hidden = !turn.sources.childElementCount;
      }
    },
  };
}
