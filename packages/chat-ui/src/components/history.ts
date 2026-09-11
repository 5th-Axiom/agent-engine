import type { ChatSessionSummary } from "@agent-runtime/chat-core";
import { element } from "../atoms/index.js";
import { defaultChatCopy, type ChatCopy } from "../copy.js";
export function createSessionList(
  onSelect: (id: string) => void,
  copy: ChatCopy = defaultChatCopy,
) {
  const root = element("section", "ae-history");
  root.setAttribute("aria-label", copy.history);
  const title = element("h3", "", copy.history);
  const items = element("div");
  root.append(title, items);
  let previous = "";
  return {
    element: root,
    update: (
      sessions: ChatSessionSummary[],
      currentId?: string,
      disabled = false,
    ) => {
      const key = JSON.stringify([sessions, currentId, disabled]);
      if (key === previous) return;
      previous = key;
      const active = (root.getRootNode() as ShadowRoot)
        .activeElement as HTMLElement | null;
      const focusId = root.contains(active)
        ? active?.dataset.sessionId
        : undefined;
      items.replaceChildren(
        ...sessions.map((session) => {
          const button = element("button", "ae-history-item");
          button.type = "button";
          button.dataset.sessionId = session.id;
          button.setAttribute("aria-current", String(session.id === currentId));
          button.disabled = disabled;
          button.append(
            document.createTextNode(session.title),
            element(
              "small",
              "",
              session.active ? "正在执行" : session.assistantId,
            ),
          );
          button.addEventListener("click", () => onSelect(session.id));
          return button;
        }),
      );
      if (!sessions.length)
        items.append(element("p", "ae-status", copy.emptyHistory));
      if (focusId)
        Array.from(items.querySelectorAll("button"))
          .find((b) => b.dataset.sessionId === focusId)
          ?.focus({ preventScroll: true });
    },
  };
}
