import { createStreamingMarkdown } from "./streaming.js";
import { createRunProcess } from "./process.js";
import type { ChatRun, ChatInputResolution } from "@agent-runtime/chat-core";
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
  streaming?: boolean;
}
export interface ChatSourceLink {
  label: string;
  href: string;
}
export interface TimelineOptions {
  resolveInput?: (input: ChatInputResolution) => Promise<void>;
  readImage?: (id: string, signal?: AbortSignal) => Promise<Blob>;
  /** Resolve public reference links for a completed reply. No model HTML is rendered. */
  getRunSources?: (run: ChatRun) => readonly ChatSourceLink[];
}
export function createMessage(data: MessageViewData) {
  const root = element("section", "ae-message ae-message-" + data.sender);
  const name = element("p", "ae-message-name");
  const text = element("div", "ae-message-text");
  root.append(name, text);
  const content = createStreamingMarkdown(text);
  let rendered: MessageViewData | undefined;
  const update = (next: MessageViewData) => {
    root.className = "ae-message ae-message-" + next.sender;
    name.textContent = next.name;
    text.hidden = !next.text;
    if (
      rendered?.text === next.text &&
      rendered.sender === next.sender &&
      rendered.streaming === next.streaming
    )
      return;
    rendered = { ...next };
    if (next.sender === "agent")
      content.update(next.text, next.streaming === true);
    else text.textContent = next.text;
  };
  update(data);
  return { element: root, update, destroy: content.destroy };
}
export function createRunDetails(copy: ChatCopy = defaultChatCopy) {
  const root = element("details", "ae-run-details");
  const summary = element("summary");
  const usage = element("p");
  const attempts = element("p");
  const operations = element("div");
  const phases = element("div", "ae-run-phases");
  root.append(summary, usage, attempts, operations, phases);
  return {
    element: root,
    update: (run: ChatRun) => {
      summary.textContent = `${copy.details} · ${run.usage.total ?? "—"} Token`;
      usage.textContent = `输入 ${run.usage.input ?? "—"} · 输出 ${run.usage.output ?? "—"} · ${run.usage.complete ? "用量完整" : "用量尚不完整"} · ${run.usage.costComplete ? "费用估算完整" : "费用估算不完整"}`;
      attempts.textContent = `模型请求 ${run.attempts} · 执行步骤 ${run.steps}`;
      phases.replaceChildren(
        ...(run.process?.entries ?? [])
          .filter((entry) => entry.kind === "model" || entry.kind === "run")
          .map((entry) =>
            element(
              "p",
              "",
              `${entry.label} · ${entry.state === "completed" ? "已完成" : entry.state === "failed" ? "失败" : entry.state === "cancelled" ? "已停止" : "处理中"}${entry.endedAt === undefined ? "" : ` · ${Math.max(0, entry.endedAt - entry.startedAt)} ms`}`,
            ),
          ),
      );
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
  const lifetime = new AbortController();
  const previews = new Map<
    string,
    { element: HTMLElement; controller: AbortController; url?: string }
  >();
  const turns = new Map<
    string,
    {
      element: HTMLElement;
      user: ReturnType<typeof createMessage>;
      agent: ReturnType<typeof createMessage>;
      status: HTMLElement;
      details: ReturnType<typeof createRunDetails>;
      process: ReturnType<typeof createRunProcess>;
      sources: HTMLElement;
      fingerprint: string;
    }
  >();
  return {
    element: root,
    destroy: () => {
      lifetime.abort();
      for (const preview of previews.values()) {
        preview.controller.abort();
        if (preview.url) URL.revokeObjectURL(preview.url);
      }
      previews.clear();
      for (const turn of turns.values()) {
        turn.process.destroy();
        turn.user.destroy();
        turn.agent.destroy();
      }
      turns.clear();
    },
    update: (runs: ChatRun[]) => {
      const imageIds = new Set(
        runs.flatMap((r) =>
          (r.attachments ?? []).map((image) => r.id + image.attachmentId),
        ),
      );
      for (const [id, preview] of previews)
        if (!imageIds.has(id)) {
          preview.controller.abort();
          if (preview.url) URL.revokeObjectURL(preview.url);
          preview.element.remove();
          previews.delete(id);
        }
      const keep = new Set(runs.map((r) => r.id));
      for (const [id, turn] of turns)
        if (!keep.has(id)) {
          turn.process.destroy();
          turn.user.destroy();
          turn.agent.destroy();
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
          const process = createRunProcess(options.resolveInput);
          agent.element.insertBefore(
            process.element,
            agent.element.querySelector(".ae-message-text"),
          );
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
            process,
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
        for (const image of run.attachments ?? []) {
          const key = run.id + image.attachmentId;
          if (previews.has(key)) continue;
          const container = element("div", "ae-image-preview");
          const preview = {
            element: container,
            controller: new AbortController(),
            url: undefined as string | undefined,
          };
          previews.set(key, preview);
          turn.user.element.append(container);
          const read = async () => {
            container.textContent = "正在读取图片…";
            try {
              if (!options.readImage) throw Error();
              const blob = await options.readImage(
                image.attachmentId,
                AbortSignal.any([lifetime.signal, preview.controller.signal]),
              );
              if (lifetime.signal.aborted || preview.controller.signal.aborted)
                return;
              preview.url = URL.createObjectURL(blob);
              const img = document.createElement("img");
              img.src = preview.url;
              img.alt = "本条消息的图片";
              container.replaceChildren(img);
            } catch {
              if (lifetime.signal.aborted || preview.controller.signal.aborted)
                return;
              container.textContent = "图片无法读取，可能已过期或无权访问。";
              const retry = element("button", "", "重新读取");
              retry.type = "button";
              retry.addEventListener("click", () => {
                void read();
              });
              container.append(retry);
            }
          };
          void read();
        }
        const active = !["completed", "failed", "cancelled"].includes(
          run.state,
        );
        turn.agent.update({
          sender: "agent",
          name: copy.assistant,
          text:
            run.output ||
            (active ? run.draft || (run.process ? "" : "正在准备回答…") : ""),
          streaming: active,
        });
        turn.agent.element.hidden = !active && !run.output && !run.process;
        turn.process.update(run);
        turn.status.textContent =
          run.state === "cancelled"
            ? runLabels.cancelled!
            : run.errorCode
              ? explainChatError(run.errorCode)
              : run.cancelRequested && active
                ? "正在确认停止…"
                : (runLabels[run.state] ?? run.state);
        turn.status.classList.toggle("ae-error-text", run.state === "failed");
        turn.status.hidden =
          !!run.process &&
          (run.state === "completed" ||
            (active && !run.cancelRequested && !run.errorCode));
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
