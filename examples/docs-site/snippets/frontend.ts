import {
  createHttpChatTransport,
  mountChatWidget,
} from "@agent-runtime/chat-ui";

// 在浏览器中、用户登录后执行。
const chat = mountChatWidget({
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  theme: { mode: "system", skin: "workbench", accent: "#0758a0" },
  copy: {
    title: "产品助手",
    welcomeTitle: "有什么需要帮忙？",
    welcomeMessage: "可以问我产品的接入方法和使用规则。",
  },
  suggestions: ["这个产品怎么使用？", "有哪些功能？"],
});

// 你的业务按钮也可以打开聊天，只填草稿，由用户确认后发送。
export function askAboutCurrentPage() {
  chat.controller.setDraft("请介绍当前页面的使用方法。");
  chat.open();
}

// 登录布局卸载或账号切换时调用。
export function removeChat() {
  chat.destroy({ clearSession: true });
}
