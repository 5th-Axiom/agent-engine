import {
  ChatController,
  type ChatTransport,
  type SessionMemory,
  type ChatState,
} from "@agent-runtime/chat-core";
import { createButton, element, type ChatIcon } from "../atoms/index.js";
import {
  applyChatTheme,
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
  launcherIcon?: ChatIcon;
  onOpenChange?: (open: boolean) => void;
}
function setup(target: HTMLElement, options: ChatMountOptions) {
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
  const view = setup(options.target ?? document.body, options);
  let isOpen = false;
  let destroyed = false;
  let tokens: ChatTokens;
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
  dialog.setAttribute("aria-label", copy.title);
  dialog.id = "agent-chat-" + crypto.randomUUID();
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
      dialog.close();
      if (nextMobile) dialog.showModal();
      else dialog.show();
    }
    if (options.position === "left" && !nextMobile) {
      dialog.style.left = "24px";
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
  function open() {
    if (destroyed || isOpen) return;
    isOpen = true;
    updateViewport();
    if (mobile()) dialog.showModal();
    else dialog.show();
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
    page.focus();
    notify();
  }
  function close() {
    if (destroyed || !isOpen) return;
    isOpen = false;
    dialog.close();
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus({ preventScroll: true });
    notify();
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  const resize = () => updateViewport();
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
      if (isOpen) {
        isOpen = false;
        dialog.close();
      }
      destroyed = true;
      window.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("scroll", resize);
      page.destroy();
      theme.destroy();
      view.dispose(settings.clearSession);
    },
  };
}
