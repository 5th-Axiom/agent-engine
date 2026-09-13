import {
  ChatController,
  createChatId,
  type ChatTransport,
  type SessionMemory,
  type ChatState,
} from "@agent-runtime/chat-core";
import { createButton, element, type ChatIcon } from "../atoms/index.js";
import {
  applyChatTheme,
  resolveChatTheme,
  type ChatThemeOptions,
  type ChatTokens,
} from "../tokens/index.js";
import { installChatStyles } from "../styles.js";
import { createChatPage, type ChatPageOptions } from "./page.js";
import { defaultChatCopy } from "../copy.js";

export interface ChatMountOptions extends ChatPageOptions {
  transport?: ChatTransport;
  /** Share a controller deliberately. Supplied controllers are owned/disposed by the caller. */
  controller?: ChatController;
  memory?: SessionMemory;
  assistantId?: string;
  theme?: ChatThemeOptions;
  styleNonce?: string;
  onStateChange?: (state: ChatState) => void;
}
export interface ChatWidgetOptions extends ChatMountOptions {
  target?: HTMLElement;
  position?: "left" | "right";
  /** A floating panel or a viewport-edge drawer. Hosts can offset it with ::part(panel). */
  panelMode?: "floating" | "side";
  launcherIcon?: ChatIcon;
  onOpenChange?: (open: boolean) => void;
}
function setup(target: HTMLElement, options: ChatMountOptions) {
  resolveChatTheme(options.theme);
  if (!options.controller && !options.transport)
    throw Error("CHAT_TRANSPORT_REQUIRED");
  const controller =
    options.controller ??
    new ChatController(options.transport!, {
      memory: options.memory,
      assistantId: options.assistantId,
    });
  const host = element("div");
  host.dataset.agentChat = "";
  host.style.height = "100%";
  const root = host.attachShadow({ mode: "open" });
  installChatStyles(root, options.styleNonce);
  target.append(host);
  const unsubscribe = options.onStateChange
    ? controller.subscribe(options.onStateChange)
    : () => {};
  return {
    controller,
    host,
    root,
    dispose: (clearSession = false) => {
      unsubscribe();
      if (!options.controller) controller.dispose({ clearSession });
      host.remove();
    },
  };
}
export function mountChatPage(target: HTMLElement, options: ChatMountOptions) {
  const view = setup(target, options);
  view.host.dataset.presentation = "page";
  const theme = applyChatTheme(view.host, options.theme);
  const page = createChatPage(view.controller, options);
  view.root.append(page.element);
  const ready = view.controller.start();
  let destroyed = false;
  return {
    element: view.host,
    controller: view.controller,
    ready,
    focus: page.focus,
    updateTheme: theme.update,
    destroy: (settings: { clearSession?: boolean } = {}) => {
      if (destroyed) return;
      destroyed = true;
      page.destroy();
      theme.destroy();
      view.dispose(settings.clearSession);
    },
  };
}
export function mountChatWidget(options: ChatWidgetOptions) {
  const dialogId = "agent-chat-" + createChatId();
  const view = setup(options.target ?? document.body, options);
  let isOpen = false;
  let destroyed = false;
  let tokens: ChatTokens;
  let animation: Animation | undefined;
  let pointerAt = -Infinity;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const pointerInput = () => {
    pointerAt = performance.now();
  };
  const keyboardInput = () => {
    pointerAt = -Infinity;
  };
  document.addEventListener("pointerdown", pointerInput, true);
  document.addEventListener("keydown", keyboardInput, true);
  const host = view.host;
  host.dataset.presentation = "widget";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.height = "auto";
  host.style.pointerEvents = "none";
  const copy = { ...defaultChatCopy, ...options.copy };
  const launcher = createButton({
    label: copy.launcherLabel,
    icon: options.launcherIcon ?? "chat",
    iconOnly: true,
    onClick: () => open(),
  });
  launcher.className = "ae-launcher";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-haspopup", "dialog");
  const dialog = element("dialog", "ae-dialog");
  dialog.dataset.panelMode = options.panelMode ?? "floating";
  dialog.dataset.phase = "closed";
  // Hosts may position the panel without reaching into SDK implementation classes.
  dialog.setAttribute("part", "panel");
  dialog.setAttribute("aria-label", copy.title);
  dialog.id = dialogId;
  launcher.setAttribute("aria-controls", dialog.id);
  const page = createChatPage(view.controller, {
    ...options,
    onClose: () => close(),
  });
  dialog.append(page.element);
  view.root.append(launcher, dialog);
  const mobile = () => innerWidth <= tokens.breakpoint;
  const updateViewport = () => {
    host.style.setProperty(
      "--ae-chat-viewport-height",
      `${visualViewport?.height ?? innerHeight}px`,
    );
    host.style.setProperty(
      "--ae-chat-viewport-top",
      `${visualViewport?.offsetTop ?? 0}px`,
    );
    const wasMobile = dialog.dataset.mobile === "true";
    const nextMobile = mobile();
    dialog.dataset.mobile = String(nextMobile);
    if (isOpen && wasMobile !== nextMobile) {
      animation?.cancel();
      animation = undefined;
      dialog.dataset.phase = "open";
      dialog.close();
      if (nextMobile) dialog.showModal();
      else dialog.show();
    }
    if (options.position === "left" && !nextMobile) {
      dialog.style.left = options.panelMode === "side" ? "0" : "24px";
      dialog.style.right = "auto";
    } else {
      dialog.style.left = "";
      dialog.style.right = "";
    }
  };
  const theme = applyChatTheme(host, options.theme, (next) => {
    tokens = next;
    host.style.zIndex = String(next.zIndex);
    updateViewport();
  });
  if (options.position === "left") {
    launcher.style.left = "24px";
    launcher.style.right = "auto";
  }
  function notify() {
    try {
      options.onOpenChange?.(isOpen);
    } catch {
      /* Host callback errors do not break cleanup/focus. */
    }
  }
  function settle() {
    animation?.cancel();
    animation = undefined;
    dialog.dataset.phase = isOpen ? "open" : "closed";
    if (!isOpen) {
      dialog.close();
      launcher.hidden = false;
      launcher.focus({ preventScroll: true });
    }
  }
  function reveal(opening: boolean, initial = false) {
    const distance =
      options.panelMode === "side" && !mobile()
        ? `translateX(${options.position === "left" ? "-" : ""}24px)`
        : "translateY(12px)";
    const style = getComputedStyle(dialog);
    const from = initial
      ? { transform: distance, opacity: "0" }
      : { transform: style.transform, opacity: style.opacity };
    animation?.cancel();
    animation = undefined;
    dialog.dataset.phase = opening ? "opening" : "closing";
    if (
      reduced.matches ||
      performance.now() - pointerAt > 1000 ||
      !tokens.motionMs
    ) {
      settle();
      return;
    }
    const next = dialog.animate(
      [
        from,
        opening
          ? { transform: "none", opacity: "1" }
          : { transform: distance, opacity: "0" },
      ],
      {
        duration: tokens.motionMs,
        easing: "cubic-bezier(.32,.72,0,1)",
        fill: "both",
      },
    );
    animation = next;
    void next.finished.then(
      () => {
        if (animation === next && !destroyed) settle();
      },
      () => {},
    );
  }
  function open() {
    if (destroyed || isOpen) return;
    isOpen = true;
    updateViewport();
    const initial = !dialog.open;
    if (initial) {
      if (mobile()) dialog.showModal();
      else dialog.show();
    }
    dialog.inert = false;
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
    page.focus();
    reveal(true, initial);
    notify();
  }
  function close() {
    if (destroyed || !isOpen) return;
    isOpen = false;
    dialog.inert = true;
    launcher.setAttribute("aria-expanded", "false");
    reveal(false);
    notify();
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    keyboardInput();
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  const resize = () => {
    if (!isOpen && animation) settle();
    updateViewport();
  };
  const motionChange = () => {
    if (reduced.matches && animation) settle();
  };
  reduced.addEventListener("change", motionChange);
  window.addEventListener("resize", resize);
  visualViewport?.addEventListener("resize", resize);
  visualViewport?.addEventListener("scroll", resize);
  const ready = view.controller.start();
  return {
    element: host,
    controller: view.controller,
    ready,
    open,
    close,
    toggle: () => (isOpen ? close() : open()),
    get isOpen() {
      return isOpen;
    },
    updateTheme: theme.update,
    destroy: (settings: { clearSession?: boolean } = {}) => {
      if (destroyed) return;
      destroyed = true;
      const wasOpen = isOpen;
      isOpen = false;
      animation?.cancel();
      animation = undefined;
      if (dialog.open) dialog.close();
      document.removeEventListener("pointerdown", pointerInput, true);
      document.removeEventListener("keydown", keyboardInput, true);
      reduced.removeEventListener("change", motionChange);
      window.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("scroll", resize);
      page.destroy();
      theme.destroy();
      view.dispose(settings.clearSession);
      if (wasOpen) notify();
    },
  };
}
