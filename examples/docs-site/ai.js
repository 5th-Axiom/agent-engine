import { mountChatPage, createHttpChatTransport } from "/assets/agent-chat.mjs";
import {
  chatMemory,
  chatTheme,
  preserveDraft,
  readingPosition,
  clearReading,
  markReadingReturn,
  loadReferenceResolver,
} from "/assets/chat-shared.js";

const themeButton = document.querySelector(".theme-button");
let chat;
function updateTheme() {
  const theme = chatTheme();
  themeButton.setAttribute(
    "aria-label",
    theme.mode === "dark" ? "切换浅色模式" : "切换深色模式",
  );
  chat?.updateTheme(theme);
}
themeButton.addEventListener("click", () => {
  const mode =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem("agent-docs-theme", mode);
  } catch {}
  updateTheme();
});
updateTheme();

function syncReadingTrail() {
  const saved = readingPosition();
  const trail = document.querySelector("#reading-trail");
  const link = trail.querySelector("a");
  trail.hidden = !saved;
  document.querySelector(".ai-context-intro").hidden = !!saved;
  const mode = document.querySelector('[data-mode="docs"]');
  mode.href = saved?.url ?? "/docs/welcome/";
  if (saved) {
    link.href = saved.url;
    link.textContent = "继续阅读：" + saved.title;
  }
}
document
  .querySelector("#reading-trail a")
  .addEventListener("click", markReadingReturn);
document
  .querySelector('[data-mode="docs"]')
  .addEventListener("click", markReadingReturn);
document.querySelector("#clear-reading").addEventListener("click", () => {
  clearReading();
  syncReadingTrail();
  document.querySelector('[data-mode="docs"]').focus();
});
syncReadingTrail();
window.addEventListener("pageshow", syncReadingTrail);

if (document.body.dataset.chatAvailable === "true") {
  const getRunSources = await loadReferenceResolver();
  chat = mountChatPage(document.querySelector("#ai-chat"), {
    sendShortcut: "enter",
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
    memory: chatMemory(),
    theme: chatTheme(),
    copy: {
      title: "文档助手",
      welcomeTitle: "你想用 Agent Engine 做什么？",
      welcomeMessage:
        "从接入聊天界面到编写工具，我会查阅项目文档、示例和源码，陪你把下一步弄明白。",
      placeholder: "描述你的需求，或贴出 API 名、错误码…",
      footnote: "回答需核对来源。请勿发送密钥；问题会交给已配置的模型。",
    },
    suggestions: [
      "怎么把聊天图标接入我的管理后台？",
      "只接后端 SDK，怎么创建会话并续聊？",
      "帮我查 mountChatWidget 的公开 API 和接入示例",
    ],
    getRunSources,
  });
  preserveDraft(chat);
  const status = document.querySelector("#ai-load-status");
  chat.ready
    .then(() => {
      status.hidden = true;
    })
    .catch(() => {
      status.textContent =
        "连接暂未完成，请在对话框中重试，或切换到传统文档继续阅读。";
    });
  window.addEventListener("pagehide", (e) => {
    if (!e.persisted) chat.destroy();
  });
}
