已有后端时可导出 [frontend 完整示例](/docs/integration/)；没有后端时选 fullstack，一次得到所有文件。现成聊天界面包含安全 Markdown 与代码复制；后端启用图片接口且模型支持视觉时，输入区提供选择、粘贴、拖拽、预览和上传重试。

**目标：** 用户进入你的后台后，右下角出现聊天图标；点击可发送问题、查看回答和历史。本文的代码运行在你的前端项目中。

先[安装 chat-ui 和 chat-core](/docs/installation/)。需要有一个可访问的 /api/agent-chat 服务端接口；还没有时，接着完成[连接后端与用户登录](/docs/frontend-server/)。只挂载界面不会自动获得模型服务。

## 最小接入：放上聊天图标

把下面的代码放在用户登录后的应用布局中，确保在浏览器环境执行，例如保存为 chat.ts：

{{code:frontend.ts}}

无需额外导入 CSS。SDK 使用 Shadow DOM 安装自己的样式，通常不会被宿主的按钮、输入框样式覆盖。它只提供样式封装，登录和数据权限仍由后端负责。

**验证接入：** 点击图标，看到欢迎语与助手列表；发送“你好”，看到已完成的回答。只有图标出现表示界面挂载成功，出现回答才表示前后端链路已连通。

## 最常调整的参数

| 参数                | 填什么                                   | 对用户的影响               |
| ------------------- | ---------------------------------------- | -------------------------- |
| transport.baseURL   | 你的聊天接口前缀，示例为 /api/agent-chat | 决定请求发给哪个服务       |
| copy.title          | 助手名称                                 | 显示在聊天窗口顶部         |
| copy.welcomeMessage | 空会话说明                               | 告诉用户可以问什么         |
| suggestions         | 示例问题数组                             | 帮用户开始第一条消息       |
| theme               | 模式、皮肤、品牌色和尺寸                 | 适配你的产品视觉           |
| position            | right 或 left                            | 控制图标位于右下角或左下角 |
| panelMode           | floating（默认）或 side                    | 浮窗或贴侧边面板；宿主通过 `::part(panel)` 留出页头 |

欢迎语和建议问题是前端展示文案，**不会代替模型的 instructions 或业务工具配置**。要让助手真正知道你的产品规则，请在后端配置说明或[接入文档检索](/docs/capabilities/)。

## React 中使用

```tsx
import { useEffect } from "react";
import {
  mountChatWidget,
  createHttpChatTransport,
} from "@agent-runtime/chat-ui";

export function ChatEntry({ accountId }: { accountId: string }) {
  useEffect(() => {
    const chat = mountChatWidget({
      transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
      copy: { title: "产品助手" },
    });
    return () => chat.destroy({ clearSession: true });
  }, [accountId]);
  return null;
}
```

将 ChatEntry 放在登录后的全局布局中，accountId 使用你已有的账号标识。账号改变时实例重建；退出时布局卸载，清理旧会话状态。服务端渲染时不要在 render 或模块顶层调用 mountChatWidget。

## Vue 中使用

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import {
  mountChatWidget,
  createHttpChatTransport,
} from "@agent-runtime/chat-ui";

let chat: ReturnType<typeof mountChatWidget> | undefined;
onMounted(() => {
  chat = mountChatWidget({
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
    copy: { title: "产品助手" },
  });
});
onBeforeUnmount(() => chat?.destroy({ clearSession: true }));
</script>
```

组件随登录布局卸载；切换账号时用 :key="accountId" 重建，避免继续展示上个账号的状态。

## 嵌入页面内容区

如果希望聊天直接占据业务页面的一部分，换用 mountChatPage。容器需要明确高度：

```html
<div id="chat-area" style="height: 680px; min-height: 320px"></div>
```

```ts
import { mountChatPage, createHttpChatTransport } from "@agent-runtime/chat-ui";

const target = document.querySelector<HTMLElement>("#chat-area")!;
const page = mountChatPage(target, {
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  theme: { mode: "system" },
});
// 页面卸载时：page.destroy({ clearSession: true });
```

两种挂载方式使用同一后端接口。多个实例默认拥有独立的对话状态。浮窗在手机宽度下转为全屏，嵌入页随容器宽度调整。

## 普通 HTML 网站

将构建产物 packages/chat-ui/dist/agent-chat.mjs 作为自己网站的静态资源提供，例如 /assets/agent-chat.mjs：

```html
<script type="module">
  import {
    mountChatWidget,
    createHttpChatTransport,
  } from "/assets/agent-chat.mjs";
  mountChatWidget({
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  });
</script>
```

有全局脚本需求时可使用同目录的 agent-chat.js，入口为 AgentChat.mountChatWidget。路径由你的网站提供，不能用 file:// 双击页面代替 HTTP 服务。

完成界面接入后，继续[挂载后端接口](/docs/frontend-server/)，再按需[调整主题与生命周期](/docs/frontend-customize/)。
