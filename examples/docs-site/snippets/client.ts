import {
  mountChatPage,
  createHttpChatTransport,
  createSessionMemory,
} from "@agent-runtime/chat-ui";
const baseURL = document.documentElement.dataset.chatApi || "/api/agent-chat";
const chat = mountChatPage(document.querySelector<HTMLElement>("#chat")!, {
  transport: createHttpChatTransport({
    baseURL,
    allowCrossOrigin:
      new URL(baseURL, location.href).origin !== location.origin,
    credentials: "include",
    // 使用 Cookie 登录无需额外 headers；Token 登录在此接宿主凭据函数。
  }),
  memory: createSessionMemory(localStorage, "integration-demo"),
  copy: {
    title: "产品助手",
    welcomeTitle: "开始你的第一段对话",
    welcomeMessage: "发送消息，刷新后也可以继续。",
  },
});
window.addEventListener("pagehide", () => chat.destroy(), { once: true });
// 真实业务中按 accountId 设置 memory，切换账号前 destroy({ clearSession: true })。
