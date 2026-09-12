import {
  isActiveRun,
  type ChatRun,
  type ChatProcessEntry,
} from "@agent-runtime/chat-core";
import { createIcon, element, type ChatIcon } from "../atoms/index.js";
import { createPendingInput } from "./pending-input.js";
import type { ChatInputResolution } from "@agent-runtime/chat-core";
import { createStreamingMarkdown } from "./streaming.js";

const stateLabels = {
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  waiting: "待处理",
  cancelled: "已停止",
};
const icons: Record<ChatProcessEntry["kind"], ChatIcon> = {
  model: "chat",
  thinking: "thinking",
  tool: "tool",
  skill: "skill",
  knowledge: "search",
  memory: "memory",
  context: "history",
  retry: "history",
  waiting: "info",
  warning: "info",
  message: "chat",
  run: "history",
};
const duration = (ms: number) =>
  ms < 1000
    ? "不足 1 秒"
    : ms < 60000
      ? `${Math.floor(ms / 1000)} 秒`
      : `${Math.floor(ms / 60000)} 分 ${Math.floor((ms % 60000) / 1000)} 秒`;
export function createRunProcess(
  resolveInput?: (input: ChatInputResolution) => Promise<void>,
) {
  const root = element("section", "ae-process");
  root.setAttribute("aria-label", "本轮处理过程");
  const disclosure = element("details", "ae-process-disclosure");
  const header = element("summary", "ae-process-header");
  const heading = element("span", "", "处理过程");
  const timing = element("span", "ae-process-timing");
  header.append(heading, timing, createIcon("down"));
  const list = element("ol", "ae-process-list");
  const notice = element("p", "ae-process-notice");
  const pendingView = createPendingInput(resolveInput);
  const pending = pendingView.element;
  pending.classList.add("ae-process-pending");
  const footer = element("p", "ae-process-usage");
  disclosure.append(header, list, notice);
  root.append(disclosure, pending, footer);
  const rows = new Map<
    string,
    {
      element: HTMLElement;
      details?: HTMLDetailsElement;
      value: string;
      stream?: ReturnType<typeof createStreamingMarkdown>;
      body?: HTMLElement;
    }
  >();
  let latest: ChatRun | undefined,
    observed = 0;
  let userExpanded = false,
    previousActive: boolean | undefined;
  disclosure.addEventListener("click", (event) => {
    if (header.contains(event.target as Node)) userExpanded = !disclosure.open;
    else userExpanded = true;
  });
  const tick = () => {
    if (!latest?.process) return;
    // Stop at the last observation if updates have stopped; this is not a fabricated progress percentage.
    const delta =
      latest.state === "running"
        ? Math.min(3000, Math.max(0, performance.now() - observed))
        : 0;
    timing.textContent = `已处理 ${duration(latest.process.activeMs + delta)}`;
  };
  let intersecting = false;
  const visible = new IntersectionObserver((entries) => {
    intersecting = entries[0]?.isIntersecting ?? false;
    root.dataset.visible = String(intersecting && !document.hidden);
  });
  visible.observe(root);
  const visibility = () => {
    root.dataset.visible = String(intersecting && !document.hidden);
  };
  document.addEventListener("visibilitychange", visibility);
  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    element: root,
    destroy() {
      pendingView.destroy();
      if (timer) clearInterval(timer);
      visible.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      for (const row of rows.values()) row.stream?.destroy();
      rows.clear();
    },
    update(run: ChatRun) {
      root.hidden = !run.process;
      latest = run;
      observed = performance.now();
      if (!run.process) {
        if (timer) clearInterval(timer);
        timer = undefined;
        return;
      }
      const active = isActiveRun(run);
      root.dataset.active = String(active);
      if (previousActive === undefined || previousActive !== active)
        disclosure.open = active || userExpanded;
      previousActive = active;
      const current = run.process.entries.findLast(
        (entry) => entry.state === "running" || entry.state === "waiting",
      );
      heading.textContent = active
        ? (current?.label ?? "正在处理")
        : run.process.entries.some((entry) => entry.kind === "thinking")
          ? "思考与处理过程"
          : "处理过程";
      if (isActiveRun(run) && !timer) timer = setInterval(tick, 1000);
      if (!isActiveRun(run) && timer) {
        clearInterval(timer);
        timer = undefined;
      }
      tick();
      const keep = new Set(run.process.entries.map((entry) => entry.id));
      for (const [id, row] of rows)
        if (!keep.has(id)) {
          row.stream?.destroy();
          row.element.remove();
          rows.delete(id);
        }
      for (const [index, entry] of run.process.entries.entries()) {
        let row = rows.get(entry.id);
        if (!row) {
          row = { element: element("li", "ae-process-row"), value: "" };
          rows.set(entry.id, row);
        }
        const serialized = JSON.stringify(entry);
        if (row.value !== serialized) {
          const wasOpen = row.details?.open ?? false;
          row.value = serialized;
          row.element.dataset.state = entry.state;
          row.element.dataset.kind = entry.kind;
          // Finished transport phases remain available in execution details.
          row.element.hidden =
            entry.state === "completed" &&
            (entry.kind === "model" || entry.kind === "run");
          const line = element("div", "ae-process-line");
          const label = element("span", "ae-process-label", entry.label);
          const status = element(
            "span",
            "ae-process-state",
            stateLabels[entry.state],
          );
          line.append(createIcon(icons[entry.kind]), label, status);
          if (entry.endedAt !== undefined)
            line.append(
              element(
                "span",
                "ae-process-duration",
                duration(Math.max(0, entry.endedAt - entry.startedAt)),
              ),
            );
          if (entry.kind === "message") {
            const content = element(
              "div",
              "ae-message-text ae-process-message",
            );
            if (!row.body) {
              row.body = content;
              row.stream = createStreamingMarkdown(content);
              row.element.replaceChildren(content);
            }
            row.stream!.update(entry.output ?? "", entry.state === "running");
            row.details = undefined;
          } else if (entry.input || entry.output || entry.kind === "thinking") {
            const details =
              row.details ?? element("details", "ae-process-detail");
            const summary =
              details.querySelector("summary") ?? element("summary");
            summary.replaceChildren(line, createIcon("down"));
            const content =
              details.querySelector<HTMLElement>(".ae-process-detail-body") ??
              element("div", "ae-process-detail-body");
            const scrollTop = content.scrollTop;
            content.tabIndex = 0;
            content.setAttribute("role", "region");
            content.setAttribute("aria-label", entry.label + "详情");
            if (entry.kind === "thinking") {
              content.classList.add("ae-thinking-content", "ae-message-text");
              content.dataset.follow = "true";
              if (!row.stream) row.stream = createStreamingMarkdown(content);
              row.stream.update(
                entry.output ??
                  (run.process.thinkingDisplay &&
                  run.process.thinkingDisplay !== "none"
                    ? "模型未返回可展示的思考内容。"
                    : "当前服务仅展示思考状态。"),
                !!entry.output && entry.state === "running",
              );
            } else
              for (const [field, value] of [
                ["input", entry.input],
                ["output", entry.output],
              ] as const) {
                const existing = content.querySelector<HTMLElement>(
                  ".ae-process-" + field,
                );
                if (!value) {
                  existing?.remove();
                  continue;
                }
                const paragraph =
                  existing ?? element("p", "ae-process-" + field);
                if (paragraph.textContent !== value)
                  paragraph.textContent = value;
                if (!existing) content.append(paragraph);
              }
            if (!row.details) details.append(summary, content);
            details.open =
              wasOpen ||
              (!row.details &&
                entry.kind === "thinking" &&
                !!entry.output &&
                active);
            if (!row.details) row.element.replaceChildren(details);
            row.details = details;
            content.scrollTop = scrollTop;
          } else {
            row.element.replaceChildren(line);
            row.details = undefined;
          }
        }
        // The server sequence is authoritative; do not infer order from a UUID or tool name.
        if (list.children[index] !== row.element)
          list.insertBefore(row.element, list.children[index] ?? null);
      }
      notice.hidden = run.process.complete;
      notice.textContent =
        "较早的过程记录已超出回读或保留范围；这里展示当前可用记录。";
      pendingView.update(run.process.pending);
      const costs = run.usage.costs?.filter(
        (cost) => cost.amount !== "0" || cost.complete,
      );
      footer.textContent = `${run.usage.total === undefined ? "用量等待上报" : `已用 ${run.usage.total.toLocaleString()} Token${run.usage.complete ? "" : "（待结算）"}`}${costs?.length ? " · 费用估算 " + costs.map((cost) => `${cost.amount} ${cost.currency}${cost.complete ? "" : "（不完整）"}`).join(" / ") : ""}`;
      footer.hidden = run.usage.total === undefined && !costs?.length;
    },
  };
}
