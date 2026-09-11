import type {
  ChatSessionSummary,
  ChatAssistant,
} from "@agent-runtime/chat-core";
import { element } from "../atoms/index.js";
import { defaultChatCopy, type ChatCopy } from "../copy.js";
export function createSessionList(
  onSelect: (id: string) => void,
  copy: ChatCopy = defaultChatCopy,
) {
  const root = element("section", "ae-history");
  root.setAttribute("aria-label", copy.history);
  const title = element("h3", "ae-history-title", copy.history);
  const items = element("div", "ae-history-items");
  root.append(title, items);
  let previous = "";
  return {
    element: root,
    update: (
      sessions: ChatSessionSummary[],
      currentId?: string,
      disabled = false,
      assistants: ChatAssistant[] = [],
    ) => {
      const key = JSON.stringify([
        sessions,
        currentId,
        disabled,
        assistants.map((a) => [a.id, a.label]),
      ]);
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
          button.title = session.title;
          button.append(
            element("span", "ae-history-title-text", session.title),
            element(
              "small",
              "",
              session.active
                ? "正在执行"
                : (assistants.find((a) => a.id === session.assistantId)
                    ?.label ?? session.assistantId),
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
