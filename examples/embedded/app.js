import {
  mountChatWidget,
  mountChatPage,
  createHttpChatTransport,
  createButton,
  createTextInput,
  createStatus,
  createMessage,
  createRunDetails,
  installChatStyles,
  applyChatTheme,
  element,
} from "/sdk/agent-chat.mjs";
const transport = createHttpChatTransport({ baseURL: "/api/agent-chat" });
const copy = {
  title: "工作台助手",
  welcomeTitle: "从当前工作开始",
  welcomeMessage: "可以直接提问，或选择库存工具助手查询演示数据。",
};
const widget = mountChatWidget({
  transport,
  copy,
  suggestions: ["请用三句话介绍你能做什么。"],
});
let inline;
let accentChanged = false;
const currentTheme = () => ({
  mode: document.querySelector("#theme").value,
  skin: document.querySelector("#skin").value,
  ...(accentChanged ? { accent: document.querySelector("#accent").value } : {}),
});
const galleryHost = document.querySelector("#component-gallery");
const gallery = galleryHost.attachShadow({ mode: "open" });
installChatStyles(gallery);
const galleryTheme = applyChatTheme(galleryHost, currentTheme());
const atoms = element("section", "ae-page");
atoms.style.padding = "16px";
atoms.style.height = "auto";
atoms.append(element("h3", "", "原子组件"));
const row = element("div", "ae-suggestions");
const status = createStatus("点击按钮可观察回调。");
row.append(
  createButton({
    label: "主要操作",
    variant: "primary",
    onClick: () => (status.textContent = "主按钮回调已触发。"),
  }),
  createButton({
    label: "次要操作",
    onClick: () => (status.textContent = "次按钮回调已触发。"),
  }),
);
const disabled = createButton({ label: "不可用" });
disabled.disabled = true;
row.append(disabled);
atoms.append(row, status);
const field = createTextInput("组件示例输入");
field.element.style.marginTop = "16px";
atoms.append(field.element);
gallery.append(atoms);
const business = element("section", "ae-page");
business.style.height = "auto";
business.style.padding = "16px";
business.append(element("h3", "", "业务组件"));
business.append(
  createMessage({ sender: "self", name: "你", text: "请查询 DEMO-1 的库存。" })
    .element,
  createMessage({
    sender: "agent",
    name: "助手",
    text: "这是一条组件演示消息：DEMO-1 的合成库存为 24 件。",
  }).element,
);
const details = createRunDetails();
details.update({
  id: "00000000-0000-4000-8000-000000000001",
  sequence: 1,
  input: "",
  output: "",
  draft: "",
  state: "completed",
  cancelRequested: false,
  steps: 2,
  attempts: 2,
  usage: {
    input: 32,
    output: 16,
    total: 48,
    complete: true,
    costComplete: false,
  },
  operations: [
    {
      id: "demo-operation",
      name: "demo.inventory",
      state: "succeeded",
      validation: "valid",
    },
  ],
});
business.append(details.element);
gallery.append(business);
const updateTheme = () => {
  try {
    const theme = currentTheme();
    widget.updateTheme(theme);
    inline?.updateTheme(theme);
    galleryTheme.update(theme);
    document.querySelector("#theme-feedback").textContent =
      "主题已更新，对话状态保持不变。";
  } catch {
    document.querySelector("#theme-feedback").textContent =
      "这组颜色无法保持文字可读性，请换一种颜色。";
  }
};
document.querySelector("#theme").addEventListener("change", updateTheme);
document.querySelector("#skin").addEventListener("change", updateTheme);
document.querySelector("#accent").addEventListener("input", () => {
  accentChanged = true;
  updateTheme();
});
document.querySelector("#reset-theme").addEventListener("click", () => {
  accentChanged = false;
  document.querySelector("#accent").value = "#0758a0";
  updateTheme();
});
document
  .querySelector("#open-chat")
  .addEventListener("click", () => widget.open());
document.querySelectorAll("[data-ask]").forEach((button) =>
  button.addEventListener("click", async () => {
    await widget.ready;
    const state = widget.controller.snapshot;
    const tool = state.config?.assistants.find((a) => a.id.startsWith("tool-"));
    try {
      if (tool && state.assistantId !== tool.id)
        widget.controller.newSession(tool.id);
      widget.controller.setDraft(
        `请调用工具查询 ${button.dataset.ask} 的库存，并说明结果。`,
      );
      widget.open();
    } catch {
      document.querySelector("#theme-feedback").textContent =
        "请先等待或处理正在发送的消息。";
    }
  }),
);
document.querySelector("#mount-inline").addEventListener("click", () => {
  const target = document.querySelector("#inline-chat");
  target.hidden = false;
  inline ??= mountChatPage(target, {
    transport,
    theme: currentTheme(),
    copy: { ...copy, title: "页面中的助手" },
  });
  document.querySelector("#mount-inline").hidden = true;
});
// Host lifecycle example: destroy on logout/unmount; closing the panel does not cancel a server Run.
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  widget.destroy();
  inline?.destroy();
  galleryTheme.destroy();
});
window.chatExample = {
  widget,
  get inline() {
    return inline;
  },
};
