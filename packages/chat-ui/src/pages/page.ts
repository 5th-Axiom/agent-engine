import {
  ChatController,
  ChatError,
  errorCode,
  createChatId,
  type ChatState,
} from "@agent-runtime/chat-core";
import {
  createButton,
  createStatus,
  createIcon,
  element,
} from "../atoms/index.js";
import {
  createComposer,
  createMessage,
  createMessageTimeline,
  createSessionList,
  createSessionDetails,
  type SessionPanel,
  type TimelineOptions,
} from "../components/index.js";
import { defaultChatCopy, explainChatError, type ChatCopy } from "../copy.js";

export interface ChatPageOptions extends TimelineOptions {
  /** Host-owned scope controls, placed below the header. The host owns listeners and cleanup. */
  contextBar?: HTMLElement;
  /** Same-origin settings webpage; opens a separate tab for the current session. */
  settingsUrl?: string;
  /** Preserve legacy SDK behavior by default; docs host uses Enter to send. */
  sendShortcut?: "enter" | "mod-enter";
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
  const settingsRefresh = () => {
    if (
      options.settingsUrl &&
      !controller.snapshot.sending &&
      !controller.snapshot.preparingSession
    )
      void controller.refresh();
  };
  window.addEventListener("focus", settingsRefresh);
  root.setAttribute("aria-label", copy.title);
  const main = element("div", "ae-chat-main");
  const sidebar = element("aside", "ae-sidebar");
  sidebar.setAttribute("aria-label", copy.history);
  sidebar.id = "ae-history-" + createChatId();
  const sidebarHeader = element("div", "ae-sidebar-header");
  const sidebarBackdrop = createButton({
    label: copy.closePanel,
    onClick: () => setSidebar(false),
  });
  sidebarBackdrop.className = "ae-sidebar-backdrop";
  sidebarBackdrop.replaceChildren();
  sidebarBackdrop.setAttribute("aria-label", copy.closePanel);
  sidebarBackdrop.tabIndex = -1;
  sidebar.hidden = sidebarBackdrop.hidden = true;
  let wide = false,
    wideSidebar = true,
    sidebarOpen = false;
  function setSidebar(open: boolean, focus = true) {
    if (wide) wideSidebar = open;
    else sidebarOpen = open;
    if (open) setPanel(undefined, false);
    syncSidebar();
    if (focus) {
      if (open && !wide) sidebarClose.focus({ preventScroll: true });
      else if (!open) historyToggle.focus({ preventScroll: true });
    }
  }
  function syncSidebar() {
    const visible = wide ? wideSidebar : sidebarOpen;
    sidebar.hidden = !visible;
    sidebarBackdrop.hidden = wide || !sidebarOpen;
    sidebarClose.hidden = wide;
    newButton.hidden = !visible;
    quickNew.hidden = visible;
    main.inert = !wide && sidebarOpen;
    root.dataset.wide = String(wide);
    root.dataset.narrow = String(main.clientWidth < 480);
    historyToggle.setAttribute("aria-expanded", String(visible));
  }
  const sidebarClose = createButton({
    label: copy.closePanel,
    icon: "close",
    iconOnly: true,
    variant: "quiet",
    onClick: () => setSidebar(false),
  });
  sidebarHeader.append(element("h2", "", copy.history), sidebarClose);
  const header = element("header", "ae-header");
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
    if (!wide) setSidebar(false);
  }, copy);
  sidebar.append(sidebarHeader, history.element);
  const historyStatus = element("p", "ae-history-status");
  historyStatus.setAttribute("role", "status");
  historyStatus.hidden = true;
  sidebar.append(historyStatus);
  const historyToggle = createButton({
    label: copy.history,
    icon: "sidebar",
    iconOnly: true,
    variant: "quiet",
    onClick: () => {
      setSidebar(!(wide ? wideSidebar : sidebarOpen));
    },
  });
  historyToggle.setAttribute("aria-expanded", "false");
  historyToggle.setAttribute("aria-controls", sidebar.id);
  header.prepend(historyToggle);
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
  const mainBody = element("div", "ae-main-body");
  const conversation = element("div", "ae-conversation");
  const detailPanel = element("aside", "ae-detail-panel");
  detailPanel.id = "ae-details-" + createChatId();
  const detailHeader = element("div", "ae-detail-header");
  const detailTitle = element("h3");
  const detailClose = createButton({
    label: copy.closePanel,
    icon: "close",
    iconOnly: true,
    variant: "quiet",
    onClick: () => setPanel(undefined),
  });
  const detailBackdrop = createButton({
    label: copy.closePanel,
    onClick: () => setPanel(undefined),
  });
  detailBackdrop.className = "ae-detail-backdrop";
  detailBackdrop.replaceChildren();
  detailBackdrop.setAttribute("aria-label", copy.closePanel);
  detailBackdrop.tabIndex = -1;
  const details = createSessionDetails(copy);
  let panel: SessionPanel | undefined;
  function setPanel(next: SessionPanel | undefined, focus = true) {
    panel = next;
    detailPanel.hidden = detailBackdrop.hidden = !next;
    conversation.inert = !!next;
    infoButton.setAttribute("aria-expanded", String(next === "session"));
    toolsButton.setAttribute("aria-expanded", String(next === "tools"));
    if (next) {
      detailTitle.textContent =
        next === "session" ? copy.sessionDetails : copy.tools;
      detailPanel.setAttribute("aria-label", detailTitle.textContent);
      details.update(controller.snapshot, next);
      if (focus) detailClose.focus({ preventScroll: true });
    } else if (focus) {
      moreSummary.focus({ preventScroll: true });
    }
    if (next) more.open = false;
  }
  const infoButton = createButton({
    label: copy.sessionDetails,
    icon: "info",
    variant: "quiet",
    onClick: () => setPanel(panel === "session" ? undefined : "session"),
  });
  const toolsButton = createButton({
    label: copy.toolsButton,
    icon: "tool",
    variant: "quiet",
    onClick: () => setPanel(panel === "tools" ? undefined : "tools"),
  });
  infoButton.setAttribute("aria-controls", detailPanel.id);
  toolsButton.setAttribute("aria-controls", detailPanel.id);
  detailHeader.append(detailTitle, detailClose);
  detailPanel.append(detailHeader, details.element);
  detailPanel.hidden = detailBackdrop.hidden = true;
  const assistantLabel = element("label", "ae-select-label", copy.assistant);
  const select = element("select", "ae-select");
  assistantLabel.append(select);
  select.addEventListener("change", () =>
    safe(() => controller.newSession(select.value)),
  );
  const startNewSession = () => {
    setPanel(undefined, false);
    if (!wide) setSidebar(false, false);
    safe(() => controller.newSession());
    composer.focus();
  };
  const newButton = createButton({
    label: copy.newSession,
    icon: "plus",
    onClick: startNewSession,
  });
  newButton.classList.add("ae-new-session");
  const quickNew = createButton({
    label: copy.newSession,
    icon: "plus",
    iconOnly: true,
    variant: "quiet",
    onClick: startNewSession,
  });
  quickNew.hidden = true;
  sidebar.insertBefore(newButton, history.element);
  sidebar.insertBefore(assistantLabel, history.element);
  const settingsLink = element(
    "a",
    "ae-button ae-button-quiet ae-settings-link",
  );
  settingsLink.append(createIcon("settings"), element("span", "", "配置"));
  settingsLink.target = "_blank";
  settingsLink.rel = "noopener noreferrer";
  settingsLink.setAttribute("aria-label", "会话配置（新标签页）");
  const settingsUrl = (sessionId?: string) => {
    const url = new URL(options.settingsUrl!, location.href);
    if (
      url.origin !== location.origin ||
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password
    )
      throw new ChatError("CHAT_INVALID_SETTINGS_URL");
    if (sessionId) url.searchParams.set("session", sessionId);
    return url.href;
  };
  if (options.settingsUrl) settingsUrl();
  settingsLink.addEventListener("click", (event) => {
    if (controller.snapshot.session) return;
    event.preventDefault();
    if (controller.snapshot.preparingSession) return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      safe(() => {
        throw new ChatError("CHAT_POPUP_BLOCKED");
      });
      return;
    }
    tab.opener = null;
    tab.document.title = "正在打开会话配置";
    safe(async () => {
      try {
        tab.location.href = settingsUrl(await controller.ensureSession());
      } catch (error) {
        tab.close();
        throw error;
      }
    });
  });
  const more = element("details", "ae-more");
  const moreSummary = element(
    "summary",
    "ae-button ae-icon-button ae-button-quiet",
  );
  moreSummary.setAttribute("aria-label", "更多操作");
  moreSummary.title = "更多操作";
  moreSummary.append(createIcon("more"));
  const moreBody = element("div", "ae-more-body");
  moreBody.append(infoButton, toolsButton, settingsLink);
  more.append(moreSummary, moreBody);
  toolbar.append(quickNew, more);
  const dismissMore = (event: PointerEvent) => {
    if (!event.composedPath().includes(more)) more.open = false;
  };
  document.addEventListener("pointerdown", dismissMore);
  more.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.isComposing && more.open) {
      event.preventDefault();
      event.stopPropagation();
      more.open = false;
      moreSummary.focus({ preventScroll: true });
    }
  });
  // Keep frequent actions in the header; details still open in the main body.
  header.insertBefore(toolbar, header.children[2] ?? null);
  const transcript = element("div", "ae-transcript");
  const readingArea = element("div", "ae-reading-area");
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
  const timeline = createMessageTimeline(copy, {
    resolveInput: (input) => controller.resolveInput(input),
    ...options,
    readImage: controller.transport.readImage?.bind(controller.transport),
  });
  const loading = element("p", "ae-session-loading");
  loading.setAttribute("role", "status");
  loading.hidden = true;
  const submission = element("article", "ae-submission");
  const submittedMessage = createMessage({
    sender: "self",
    name: copy.self,
    text: "",
  });
  const submittedImages = element("p", "ae-submission-images");
  const submissionStatus = element("p", "ae-submission-status");
  submissionStatus.setAttribute("role", "status");
  submission.append(
    submittedMessage.element,
    submittedImages,
    submissionStatus,
  );
  submission.hidden = true;
  transcript.append(welcome, loading, timeline.element);
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
      jump.hidden = following || !timeline.element.childElementCount;
    },
    { passive: true },
  );
  transcript.addEventListener("disclosurechange", () => {
    following = false;
    jump.hidden =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <
      32;
  });
  const followContent = () => {
    if (following) transcript.scrollTop = transcript.scrollHeight;
  };
  // Observe actual size changes after layout; per-character synchronous
  // content events otherwise force layout once for every streaming region.
  const contentSize = new ResizeObserver(followContent);
  contentSize.observe(timeline.element);
  contentSize.observe(submission);
  const composer = createComposer({
    availableHeight: () =>
      conversation.clientHeight - (feedback.hidden ? 0 : feedback.offsetHeight),
    copy,
    sendShortcut: options.sendShortcut,
    onModel: (id) => safe(() => controller.setModel(id)),
    onSkill: (id) => safe(() => controller.setSkill(id)),
    onDraft: (value) => {
      localError = undefined;
      controller.setDraft(value);
    },
    onImages: (files) => safe(() => controller.addImages(files)),
    onRemoveImage: (id) => controller.removeImage(id),
    onRetryImage: (id) => safe(() => controller.retryImage(id)),
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
  moreBody.append(debug);
  readingArea.append(transcript, jump);
  conversation.append(readingArea, feedback, composer.element);
  const conversationSize = new ResizeObserver(() => {
    composer.resize();
    followContent();
  });
  conversationSize.observe(conversation);
  conversationSize.observe(feedback);
  conversationSize.observe(transcript);
  mainBody.append(conversation, detailBackdrop, detailPanel);
  main.append(header);
  if (options.contextBar) main.append(options.contextBar);
  main.append(mainBody);
  root.append(sidebarBackdrop, sidebar, main);
  root.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape" && (panel || (!wide && sidebarOpen))) {
      event.preventDefault();
      event.stopPropagation();
      if (panel) setPanel(undefined);
      else setSidebar(false);
    }
    if (event.key === "Tab" && !wide && sidebarOpen) {
      const focusable = [
        ...sidebar.querySelectorAll<HTMLElement>(
          "button:not(:disabled), select:not(:disabled), [tabindex='0']",
        ),
      ].filter((el) => !el.hidden && el.getClientRects().length);
      const active = (root.getRootNode() as ShadowRoot).activeElement;
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  let assistants = "";
  let wasSending = false;
  const unsubscribe = controller.subscribe((state: ChatState) => {
    // Sending expresses a new intent to follow this turn, even after reading history.
    // Passive polling and streamed text must still preserve an explicit scroll back.
    const startedSending = state.sending && !wasSending;
    wasSending = state.sending;
    if (startedSending) {
      following = true;
      jump.hidden = true;
      followContent();
    }
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
    assistantLabel.hidden = (state.config?.assistants.length ?? 0) <= 1;
    select.disabled =
      !!state.session || state.pending || state.sending || !state.config;
    newButton.disabled = quickNew.disabled =
      state.pending || state.sending || !state.config;
    history.update(
      state.sessions,
      state.selectedSessionId ?? state.session?.id,
      state.sending || state.pending || state.connection === "connecting",
      state.config?.assistants ?? [],
      state.historyLoaded === true,
    );
    const loadingHistory =
      !state.historyLoaded &&
      !state.historyError &&
      state.connection !== "disconnected";
    history.element.setAttribute("aria-busy", String(loadingHistory));
    historyStatus.hidden = !state.historyError && !loadingHistory;
    const historyMessage = state.historyError
      ? "会话列表暂时无法更新，正在重试…"
      : loadingHistory
        ? "正在加载对话列表…"
        : "";
    if (historyStatus.textContent !== historyMessage)
      historyStatus.textContent = historyMessage;
    settingsLink.hidden =
      !options.settingsUrl ||
      !(
        state.session?.settingsEnabled ??
        state.config?.assistants.find((a) => a.id === state.assistantId)
          ?.settingsEnabled
      );
    if (!settingsLink.hidden)
      settingsLink.href = settingsUrl(state.session?.id);
    settingsLink.setAttribute(
      "aria-disabled",
      String(state.preparingSession === true),
    );
    const currentAssistant = state.config?.assistants.find(
      (a) => a.id === state.assistantId,
    );
    const tools = state.session ? state.session.tools : currentAssistant?.tools;
    toolsButton.querySelector("span")!.textContent =
      copy.toolsButton + (tools ? ` ${tools.length}` : "");
    toolsButton.setAttribute(
      "aria-label",
      copy.tools + (tools ? `（${tools.length}）` : ""),
    );
    if (panel) details.update(state, panel);
    const selectedSession = state.selectedSessionId ?? state.session?.id;
    const sessionChanged = lastSession !== selectedSession;
    lastSession = selectedSession;
    const hasRuns = !!state.session?.runs.length;
    welcome.hidden = hasRuns || !!state.submission || !!state.selectedSessionId;
    loading.hidden = !state.loadingSession;
    loading.textContent = state.session ? "正在更新对话…" : "正在加载对话…";
    timeline.element.setAttribute(
      "aria-busy",
      String(state.loadingSession === true),
    );
    submission.hidden = !state.submission;
    if (state.submission) {
      if (!submission.isConnected) transcript.append(submission);
      submittedMessage.update({
        sender: "self",
        name: copy.self,
        text: state.submission.input,
      });
      const images = state.submission.attachments?.length ?? 0;
      submittedImages.hidden = !images;
      submittedImages.textContent = images ? `${images} 张图片` : "";
      submission.dataset.status = state.submission.status;
      submissionStatus.textContent =
        state.submission.status === "sending"
          ? "正在发送…"
          : state.submission.status === "accepted"
            ? "已发送，正在准备回复…"
            : "发送尚未确认，可重试此消息。";
    } else submission.remove();
    const next = JSON.stringify(state.session?.runs ?? []);
    if (next !== fingerprint || sessionChanged) {
      const top = transcript.scrollTop;
      const shouldFollow = following || sessionChanged;
      fingerprint = next;
      timeline.update(state.session?.runs ?? []);
      if (shouldFollow) {
        transcript.scrollTop = hasRuns ? transcript.scrollHeight : 0;
        following = true;
        jump.hidden = true;
      } else {
        transcript.scrollTop = top;
        jump.hidden = false;
      }
    }
    composer.update(state);
    if (startedSending) followContent();
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
    const nextWide = (entries[0]?.contentRect.width ?? 0) >= 760;
    const active = (root.getRootNode() as ShadowRoot).activeElement;
    if (nextWide !== wide) {
      wide = nextWide;
      sidebarOpen = false;
    }
    syncSidebar();
    if (sidebar.hidden && active && sidebar.contains(active))
      historyToggle.focus({ preventScroll: true });
    if (following)
      transcript.scrollTop = welcome.hidden ? transcript.scrollHeight : 0;
  });
  resize.observe(root);
  return {
    element: root,
    focus: composer.focus,
    transcript,
    destroy: () => {
      window.removeEventListener("focus", settingsRefresh);
      timeline.destroy();
      submittedMessage.destroy();
      composer.destroy();
      unsubscribe();
      resize.disconnect();
      contentSize.disconnect();
      conversationSize.disconnect();
      document.removeEventListener("pointerdown", dismissMore);
      root.remove();
    },
  };
}
