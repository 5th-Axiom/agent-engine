import {
  isActiveRun,
  type ChatRun,
  type ChatProcessEntry,
  type ChatInputResolution,
} from "@agent-runtime/chat-core";
import { createIcon, element, type ChatIcon } from "../atoms/index.js";
import { createPendingInput } from "./pending-input.js";
import { createStreamingMarkdown } from "./streaming.js";
import { createDisclosure } from "./disclosure.js";
import { planReply, type ReplyUnit } from "./reply-layout.js";

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
type Row = {
  element: HTMLElement;
  entry: ChatProcessEntry;
  disclosure?: ReturnType<typeof createDisclosure>;
  stream?: ReturnType<typeof createStreamingMarkdown>;
  body?: HTMLElement;
  label?: HTMLElement;
  status?: HTMLElement;
  timing?: HTMLElement;
  input?: HTMLElement;
  output?: HTMLElement;
};
const activeElement = (root: HTMLElement) => {
  const tree = root.getRootNode();
  return tree instanceof ShadowRoot
    ? tree.activeElement
    : document.activeElement;
};
function place(parent: HTMLElement, nodes: HTMLElement[]) {
  for (const [index, node] of nodes.entries())
    if (parent.children[index] !== node) {
      // Native state-preserving moves retain focus, selection and nested scrollers.
      if (
        node.isConnected &&
        parent.isConnected &&
        node.getRootNode() === parent.getRootNode() &&
        "moveBefore" in parent
      )
        (
          parent as HTMLElement & {
            moveBefore(n: Node, before: Node | null): void;
          }
        ).moveBefore(node, parent.children[index] ?? null);
      else {
        const offsets = [node, ...node.querySelectorAll<HTMLElement>("*")]
          .filter((el) => el.scrollTop || el.scrollLeft)
          .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
        parent.insertBefore(node, parent.children[index] ?? null);
        for (const { el, top, left } of offsets) el.scrollTo(left, top);
      }
    }
  for (const child of [...parent.children])
    if (!nodes.includes(child as HTMLElement)) child.remove();
}

export function createRunProcess(
  resolveInput?: (input: ChatInputResolution) => Promise<void>,
  audit?: HTMLElement,
) {
  const root = element("section", "ae-process");
  root.setAttribute("aria-label", "本轮处理过程");
  const current = element("p", "ae-process-current");
  const currentLabel = element("span", "ae-process-current-label");
  const timing = element("span", "ae-process-timing");
  current.append(currentLabel, timing);
  const list = element("div", "ae-process-content");
  const notice = element("p", "ae-process-notice");
  const pendingView = createPendingInput(resolveInput);
  pendingView.element.classList.add("ae-process-pending");
  root.append(current, list, notice, pendingView.element);
  if (audit) root.append(audit);
  const footer = element("p", "ae-process-usage");
  root.append(footer);
  const rows = new Map<string, Row>();
  const groups = new Map<string, ReturnType<typeof createDisclosure>>();
  let latest: ChatRun | undefined;
  let entries: ChatProcessEntry[] = [];
  let observed = 0;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let intersecting = false;
  const visibility = () => {
    root.dataset.visible = String(intersecting && !document.hidden);
  };
  const visible = new IntersectionObserver((values) => {
    intersecting = values[0]?.isIntersecting ?? false;
    visibility();
  });
  visible.observe(root);
  document.addEventListener("visibilitychange", visibility);
  const tick = () => {
    if (!latest?.process) return;
    const delta =
      latest.state === "running"
        ? Math.min(3000, Math.max(0, performance.now() - observed))
        : 0;
    timing.textContent = duration(latest.process.activeMs + delta);
  };
  const heldOpen = (row: Row) => {
    const selection = document.getSelection();
    return (
      row.disclosure?.userOpen === true ||
      row.element.contains(activeElement(root)) ||
      (!!selection &&
        !selection.isCollapsed &&
        row.element.contains(selection.anchorNode))
    );
  };
  const renderLayout = () => {
    if (!latest || disposed) return;
    const finished = !isActiveRun(latest);
    const settled =
      finished &&
      ![...rows.values()].some((r) => r.body?.dataset.revealing === "true");
    const focus = activeElement(root) as HTMLElement | null;
    const units: ReplyUnit[] = entries.map((e) => ({
      id: e.id,
      kind:
        e.kind === "message"
          ? "body"
          : ["warning", "waiting"].includes(e.kind) || e.state === "failed"
            ? "notice"
            : "activity",
      text: e.output,
    }));
    const layout = planReply(units, settled);
    const sections: HTMLElement[] = [];
    const used = new Set<string>();
    for (const section of layout) {
      const children = section.units.map((u) => rows.get(u.id)!.element);
      if (!section.variant) {
        sections.push(...children);
        continue;
      }
      let group = groups.get(section.id);
      if (!group) {
        group = createDisclosure("ae-process-disclosure", "ae-process-header");
        group.element.dataset.group = section.id;
        groups.set(section.id, group);
      }
      used.add(section.id);
      group.element.dataset.variant = section.variant;
      group.header.hidden = !section.folded;
      group.label.textContent =
        section.variant === "completed"
          ? `${latest.state === "cancelled" ? "已停止" : latest.state === "failed" ? "处理过程" : "已完成"} · ${duration(latest.process?.activeMs ?? 0)}`
          : section.variant === "process"
            ? "过程消息"
            : `思考与处理过程 · ${section.units.length} 项`;
      const pinned = section.units.some((u) => heldOpen(rows.get(u.id)!));
      // Opening a row or reading it takes precedence over automatic folding.
      group.setOpen(group.userOpen ?? (!section.folded || pinned));
      // Keep both parents connected before moving live descendants into a new
      // group; a detached parent would reset their focus and scroll positions.
      if (!group.element.isConnected) list.append(group.element);
      place(group.body, children);
      sections.push(group.element);
    }
    place(list, sections);
    for (const [id, group] of groups)
      if (!used.has(id)) {
        group.destroy();
        groups.delete(id);
      }
    if (
      focus?.isConnected &&
      activeElement(root) !== focus &&
      !focus.closest("[inert]")
    )
      focus.focus({ preventScroll: true });
    current.hidden = settled && layout.some((s) => s.variant === "completed");
    const phase = latest.process?.entries.findLast(
      (e) => e.state === "running" || e.state === "waiting",
    );
    currentLabel.textContent =
      latest.cancelRequested && !finished
        ? "正在确认停止…"
        : !settled
          ? phase && ["model", "run", "waiting"].includes(phase.kind)
            ? phase.label
            : "正在处理"
          : latest.state === "cancelled"
            ? "已停止"
            : latest.state === "failed"
              ? "处理未完成"
              : "已完成";
    if (audit) audit.hidden = !settled;
    footer.hidden = !!audit || !settled || latest.usage.total === undefined;
    const previous = root.dataset.settled;
    root.dataset.settled = String(settled);
    if (previous !== root.dataset.settled)
      root.dispatchEvent(new Event("replysettled", { bubbles: true }));
  };
  let queued = false;
  root.addEventListener("revealstatechange", () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      renderLayout();
    });
  });
  return {
    element: root,
    get settled() {
      return root.dataset.settled === "true";
    },
    destroy() {
      disposed = true;
      pendingView.destroy();
      if (timer) clearInterval(timer);
      visible.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      for (const row of rows.values()) {
        row.stream?.destroy();
        row.disclosure?.destroy();
      }
      for (const group of groups.values()) group.destroy();
      rows.clear();
      groups.clear();
    },
    update(run: ChatRun) {
      latest = run;
      observed = performance.now();
      const active = isActiveRun(run);
      root.hidden = !run.process && !audit;
      root.dataset.active = String(active);
      if (!run.process) {
        current.hidden =
          list.hidden =
          notice.hidden =
          pendingView.element.hidden =
          footer.hidden =
            true;
        if (audit) audit.hidden = false;
        if (timer) clearInterval(timer);
        timer = undefined;
        return;
      }
      list.hidden = false;
      if (active && !timer) timer = setInterval(tick, 1000);
      if (!active && timer) {
        clearInterval(timer);
        timer = undefined;
      }
      tick();
      entries = run.process.entries.filter(
        (e) =>
          !["model", "run"].includes(e.kind) &&
          (e.kind !== "thinking" || !!e.output) &&
          (e.kind !== "message" || !!e.output),
      );
      const text = run.output || (active ? run.draft : "");
      const replyId = run.reply?.id ?? run.id + ":reply";
      if (text) {
        entries = entries.filter((e) => e.id !== replyId);
        entries.push({
          id: replyId,
          kind: "message",
          label: "回答",
          output: text,
          sequence:
            run.reply?.sequence ??
            Math.max(0, ...entries.map((e) => e.sequence)) + 1,
          startedAt: run.process.observedAt,
          state: active ? "running" : "completed",
        });
      }
      entries.sort((a, b) => a.sequence - b.sequence);
      const keep = new Set(entries.map((e) => e.id));
      for (const [id, row] of rows)
        if (!keep.has(id)) {
          row.stream?.destroy();
          row.disclosure?.destroy();
          row.element.remove();
          rows.delete(id);
        }
      for (const [index, entry] of entries.entries()) {
        let row = rows.get(entry.id);
        if (!row) {
          row = { element: element("div", "ae-process-row"), entry };
          row.element.dataset.entryId = entry.id;
          rows.set(entry.id, row);
          if (entry.kind === "message") {
            row.body = element("div", "ae-message-text ae-process-message");
            row.stream = createStreamingMarkdown(row.body);
            row.element.append(row.body);
          } else {
            const line = element("span", "ae-process-line");
            row.label = element("span", "ae-process-label");
            row.status = element("span", "ae-process-state");
            row.timing = element("span", "ae-process-duration");
            line.append(
              createIcon(icons[entry.kind]),
              row.label,
              row.status,
              row.timing,
            );
            row.element.append(line);
          }
        }
        row.entry = entry;
        row.element.dataset.kind = entry.kind;
        row.element.dataset.state = entry.state;
        row.element.dataset.answer = String(entry.id === replyId && !!text);
        if (entry.kind === "message") {
          row.stream!.update(
            entry.output ?? "",
            active && entry.state === "running",
          );
          continue;
        }
        row.label!.textContent = entry.label;
        row.status!.textContent = stateLabels[entry.state];
        row.timing!.textContent =
          entry.endedAt === undefined
            ? ""
            : duration(Math.max(0, entry.endedAt - entry.startedAt));
        if (entry.input || entry.output || entry.kind === "thinking") {
          if (!row.disclosure) {
            const disclosure = createDisclosure(
              "ae-process-detail",
              "ae-process-detail-header",
            );
            disclosure.label.replaceChildren(row.element.firstChild!);
            const body = element("div", "ae-process-detail-body");
            body.tabIndex = 0;
            body.setAttribute("role", "region");
            body.setAttribute("aria-label", entry.label + "详情");
            disclosure.body.append(body);
            row.body = body;
            row.disclosure = disclosure;
            row.element.append(disclosure.element);
            if (entry.kind === "thinking") {
              body.classList.add("ae-thinking-content", "ae-message-text");
              body.dataset.follow = "true";
              row.stream = createStreamingMarkdown(body);
            }
          }
          const tailThinking =
            entry.kind === "thinking" &&
            entry.state === "running" &&
            active &&
            index === entries.length - 1;
          row.disclosure.setOpen(
            row.disclosure.userOpen ?? (tailThinking || heldOpen(row)),
          );
          if (entry.kind === "thinking")
            row.stream!.update(
              entry.output ?? "",
              tailThinking && row.disclosure.open,
            );
          else
            for (const [field, value] of [
              ["input", entry.input],
              ["output", entry.output],
            ] as const) {
              let paragraph = row[field];
              if (!paragraph) {
                paragraph = row[field] = element("p", "ae-process-" + field);
                row.body!.append(paragraph);
              }
              paragraph.hidden = !value;
              if (paragraph.textContent !== (value ?? ""))
                paragraph.textContent = value ?? "";
            }
        }
      }
      notice.hidden = run.process.complete;
      notice.textContent =
        "较早的过程记录已超出回读或保留范围；这里展示当前可用记录。";
      pendingView.update(run.process.pending);
      footer.textContent =
        run.usage.total === undefined
          ? ""
          : `已用 ${run.usage.total.toLocaleString()} Token${run.usage.complete ? "" : "（待结算）"}`;
      renderLayout();
    },
  };
}
