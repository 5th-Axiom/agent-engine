import type {
  ChatSessionSummary,
  ChatAssistant,
} from "@agent-runtime/chat-core";
import { element } from "../atoms/index.js";
import { defaultChatCopy, type ChatCopy } from "../copy.js";
export function createSessionList(
  onSelect: (id: string) => void,
  copy: ChatCopy = defaultChatCopy,
  onPrefetch?: (id: string) => void,
) {
  const root = element("section", "ae-history");
  root.setAttribute("aria-label", copy.history);
  const title = element("h3", "ae-history-title", copy.history);
  const items = element("div", "ae-history-items");
  root.append(title, items);
  const rows = new Map<
    string,
    { button: HTMLButtonElement; title: HTMLElement; status: HTMLElement }
  >();
  const empty = element("p", "ae-status", copy.emptyHistory);
  let intentTimer: ReturnType<typeof setTimeout> | undefined;
  const clearIntent = () => clearTimeout(intentTimer);
  return {
    element: root,
    destroy: clearIntent,
    update: (
      sessions: ChatSessionSummary[],
      currentId?: string,
      disabled = false,
      assistants: ChatAssistant[] = [],
      showEmpty = true,
    ) => {
      const active = (root.getRootNode() as ShadowRoot)
        .activeElement as HTMLElement | null;
      const focused = root.contains(active) ? active : undefined;
      const ids = new Set(sessions.map((session) => session.id));
      for (const [id, row] of rows) {
        if (!ids.has(id)) {
          clearIntent();
          row.button.remove();
          rows.delete(id);
        }
      }
      if (sessions.length || !showEmpty) empty.remove();
      const labels = new Map(
        assistants.map((assistant) => [assistant.id, assistant.label]),
      );
      let cursor = items.firstElementChild;
      for (const session of sessions) {
        let row = rows.get(session.id);
        if (!row) {
          const button = element("button", "ae-history-item");
          button.type = "button";
          button.dataset.sessionId = session.id;
          row = {
            button,
            title: element("span", "ae-history-title-text"),
            status: element("small"),
          };
          button.append(row.title, row.status);
          button.addEventListener("click", () => {
            clearIntent();
            onSelect(session.id);
          });
          if (onPrefetch) {
            const intent = () => {
              clearIntent();
              intentTimer = setTimeout(() => onPrefetch(session.id), 100);
            };
            button.addEventListener("pointerenter", intent);
            button.addEventListener("focus", intent);
            button.addEventListener("pointerleave", clearIntent);
            button.addEventListener("blur", clearIntent);
          }
          rows.set(session.id, row);
        }
        const { button, title, status } = row;
        const current = String(session.id === currentId);
        if (button.getAttribute("aria-current") !== current)
          button.setAttribute("aria-current", current);
        if (button.disabled !== disabled) button.disabled = disabled;
        if (button.title !== session.title) button.title = session.title;
        if (title.textContent !== session.title)
          title.textContent = session.title;
        const label = session.active
          ? "正在执行"
          : (labels.get(session.assistantId) ?? copy.title);
        if (status.textContent !== label) status.textContent = label;
        // Keep unchanged rows connected: focus, hover and scroll survive background updates.
        if (button !== cursor) {
          if (items.moveBefore && button.parentNode === items)
            items.moveBefore(button, cursor);
          else items.insertBefore(button, cursor);
        }
        cursor = button.nextElementSibling;
      }
      if (!sessions.length && showEmpty && empty.parentNode !== items)
        items.append(empty);
      if (
        focused?.isConnected &&
        (root.getRootNode() as ShadowRoot).activeElement !== focused
      )
        focused.focus({ preventScroll: true });
    },
  };
}
