import {
  ChatController,
  errorCode,
  type ChatState,
} from "@agent-runtime/chat-core";
import {
  createButton,
  createIcon,
  createStatus,
  element,
} from "../atoms/index.js";
import {
  createComposer,
  createMessageTimeline,
  createSessionList,
} from "../components/index.js";
import { defaultChatCopy, explainChatError, type ChatCopy } from "../copy.js";

export interface ChatPageOptions {
  copy?: Partial<ChatCopy>;
  suggestions?: string[];
  onClose?: () => void;
}
/** Composes presentational components and a controller; owns focus and transcript scrolling. */
export function createChatPage(
  controller: ChatController,
  options: ChatPageOptions = {},
) {
  const copy = { ...defaultChatCopy, ...options.copy };
  const root = element("section", "ae-page");
  root.setAttribute("aria-label", copy.title);
  const header = element("header", "ae-header");
  header.append(createIcon("chat"));
  const heading = element("div", "ae-heading");
  heading.append(element("h2", "ae-title", copy.title));
  const connection = createStatus();
  heading.append(connection);
  header.append(heading);
  const feedback = element("div", "ae-feedback");
  feedback.setAttribute("role", "alert");
  const feedbackText = element("p");
  const feedbackActions = element("div", "ae-feedback-actions");
  feedback.append(feedbackText, feedbackActions);
  feedback.hidden = true;
  let localError: string | undefined;
  const safe = (operation: () => unknown) => {
    localError = undefined;
    try {
      Promise.resolve(operation()).catch((error) =>
        showError(errorCode(error)),
      );
    } catch (error) {
      showError(errorCode(error));
    }
  };
  function showError(code: string) {
    localError = code;
    feedback.hidden = false;
    feedbackText.textContent = explainChatError(code);
  }
  const history = createSessionList((id) => {
    safe(() => controller.selectSession(id));
    history.element.hidden = true;
    historyToggle.setAttribute("aria-expanded", "false");
  }, copy);
  history.element.hidden = true;
  const historyToggle = createButton({
    label: copy.history,
    icon: "history",
    iconOnly: true,
    variant: "quiet",
    onClick: () => {
      history.element.hidden = !history.element.hidden;
      historyToggle.setAttribute(
        "aria-expanded",
        String(!history.element.hidden),
      );
    },
  });
  historyToggle.setAttribute("aria-expanded", "false");
  header.append(historyToggle);
  if (options.onClose)
    header.append(
      createButton({
        label: copy.close,
        icon: "close",
        iconOnly: true,
        variant: "quiet",
        onClick: options.onClose,
      }),
    );
  const toolbar = element("div", "ae-toolbar");
  const assistantLabel = element("label", "ae-select-label", copy.assistant);
  const select = element("select", "ae-select");
  assistantLabel.append(select);
  select.addEventListener("change", () =>
    safe(() => controller.newSession(select.value)),
  );
  const newButton = createButton({
    label: copy.newSession,
    icon: "plus",
    onClick: () => {
      safe(() => controller.newSession());
      composer.focus();
    },
  });
  toolbar.append(assistantLabel, newButton);
  const transcript = element("div", "ae-transcript");
  transcript.tabIndex = 0;
  transcript.setAttribute("aria-label", "对话记录");
  const welcome = element("div", "ae-welcome");
  welcome.append(
    element("h3", "", copy.welcomeTitle),
    element("p", "", copy.welcomeMessage),
  );
  const suggestions = element("div", "ae-suggestions");
  for (const text of options.suggestions ?? [])
    suggestions.append(
      createButton({
        label: text,
        onClick: () => {
          controller.setDraft(text);
          composer.focus();
        },
      }),
    );
  welcome.append(suggestions);
  const timeline = createMessageTimeline(copy);
  transcript.append(welcome, timeline.element);
  let following = true;
  let lastSession: string | undefined;
  let fingerprint = "";
  const jump = createButton({
    label: copy.jump,
    icon: "down",
    variant: "quiet",
    onClick: () => {
      following = true;
      transcript.scrollTop = transcript.scrollHeight;
      jump.hidden = true;
    },
  });
  jump.classList.add("ae-jump");
  jump.hidden = true;
  transcript.addEventListener(
    "scroll",
    () => {
      following =
        transcript.scrollHeight -
          transcript.scrollTop -
          transcript.clientHeight <
        64;
      if (following) jump.hidden = true;
    },
    { passive: true },
  );
  const composer = createComposer({
    copy,
    onDraft: (value) => {
      localError = undefined;
      controller.setDraft(value);
    },
    onSend: () => safe(() => controller.send()),
    onCancel: () => safe(() => controller.cancel()),
  });
  const retry = createButton({
    label: copy.retry,
    onClick: () => safe(() => controller.retrySend()),
  });
  const discard = createButton({
    label: copy.discard,
    onClick: () => safe(() => controller.discardPending()),
  });
  const reconnect = createButton({
    label: copy.reconnect,
    onClick: () => safe(() => controller.reconnect()),
  });
  feedbackActions.append(retry, discard, reconnect);
  const debug = element("a", "ae-status", copy.debug);
  debug.hidden = true;
  debug.target = "_blank";
  debug.rel = "noopener noreferrer";
  toolbar.append(debug);
  root.append(
    header,
    toolbar,
    history.element,
    transcript,
    jump,
    feedback,
    composer.element,
  );
  let assistants = "";
  const unsubscribe = controller.subscribe((state: ChatState) => {
    connection.textContent =
      state.connection === "ready"
        ? "已连接"
        : state.connection === "connecting"
          ? "正在连接"
          : "连接中断";
    const serialized = JSON.stringify(state.config?.assistants ?? []);
    if (serialized !== assistants) {
      assistants = serialized;
      select.replaceChildren(
        ...(state.config?.assistants ?? []).map((a) => {
          const option = element("option", "", a.label);
          option.value = a.id;
          return option;
        }),
      );
    }
    select.value = state.assistantId ?? "";
    select.disabled =
      !!state.session || state.pending || state.sending || !state.config;
    newButton.disabled = state.pending || state.sending || !state.config;
    history.update(
      state.sessions,
      state.session?.id,
      state.sending || state.pending,
    );
    const sessionChanged = lastSession !== state.session?.id;
    lastSession = state.session?.id;
    const next = JSON.stringify(state.session?.runs ?? []);
    if (next !== fingerprint || sessionChanged) {
      const top = transcript.scrollTop;
      const shouldFollow = following || sessionChanged;
      fingerprint = next;
      timeline.update(state.session?.runs ?? []);
      if (shouldFollow) {
        transcript.scrollTop = transcript.scrollHeight;
        following = true;
        jump.hidden = true;
      } else {
        transcript.scrollTop = top;
        jump.hidden = false;
      }
    }
    welcome.hidden = !!state.session?.runs.length;
    composer.update(state);
    const visibleError = state.error ?? localError;
    feedback.hidden = !visibleError;
    feedbackText.textContent = visibleError
      ? explainChatError(visibleError) +
        (state.pending
          ? " 重试使用原请求编号；结束重试不会停止已受理的任务。"
          : "")
      : "";
    retry.hidden = discard.hidden = !state.pending;
    retry.disabled = discard.disabled = state.sending;
    reconnect.disabled = state.sending;
    debug.hidden = true;
    if (state.session?.debugPath) {
      try {
        const path = new URL(state.session.debugPath, location.href);
        if (
          path.origin === location.origin &&
          /^https?:$/.test(path.protocol)
        ) {
          debug.href = path.href;
          debug.hidden = false;
        }
      } catch {
        /* Invalid navigation is never rendered. */
      }
    }
  });
  const resize = new ResizeObserver((entries) => {
    root.dataset.narrow = String((entries[0]?.contentRect.width ?? 0) < 480);
    if (following) transcript.scrollTop = transcript.scrollHeight;
  });
  resize.observe(root);
  return {
    element: root,
    focus: composer.focus,
    transcript,
    destroy: () => {
      unsubscribe();
      resize.disconnect();
      root.remove();
    },
  };
}
