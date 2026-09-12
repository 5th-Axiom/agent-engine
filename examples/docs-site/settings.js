import {
  mountChatSettingsPage,
  createHttpChatTransport,
} from "/assets/agent-chat.mjs";
import { chatTheme } from "/assets/chat-shared.js";
const target = document.querySelector("#chat-settings");
let view;
const button = document.querySelector(".theme-button");
const syncTheme = () => {
  const theme = chatTheme();
  view?.updateTheme(theme);
  button.setAttribute(
    "aria-label",
    theme.mode === "dark" ? "切换浅色模式" : "切换深色模式",
  );
};
button.addEventListener("click", () => {
  const mode =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem("agent-docs-theme", mode);
  } catch {}
  syncTheme();
});
syncTheme();
if (document.body.dataset.chatAvailable === "true") {
  const sessionId = new URL(location.href).searchParams.get("session");
  if (
    !sessionId ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sessionId)
  ) {
    target.querySelector("p").textContent =
      "请从文档助手右上角的“配置”入口打开当前会话。";
  } else {
    target.replaceChildren();
    view = mountChatSettingsPage(target, {
      transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
      sessionId,
      theme: chatTheme(),
      helpLinks: {
        tools: "/docs/tools/",
        skills: "/docs/skills/",
        knowledge: "/docs/knowledge/",
        memory: "/docs/memory/",
      },
    });
  }
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) view?.destroy();
});
