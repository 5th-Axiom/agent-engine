本文沿用[前端接入示例](/docs/frontend/)中创建的 chat 实例。先确定需要改外观、管理对话，还是自己组合组件，再使用对应层的 API。

## 换皮肤、品牌色与尺寸

```ts
chat.updateTheme({
  mode: "dark", // light / dark / system
  skin: "rounded", // workbench / rounded
  accent: "#a63212", // 六位十六进制品牌色
  tokens: {
    fontSize: 16,
    panelWidth: 460,
    panelHeight: 720,
    panelRadius: 20,
    breakpoint: 600,
    zIndex: 2000,
  },
});
```

updateTheme 接收**完整的下一份主题选项**，没有传入的项恢复默认值；它不会清空消息和草稿。需要保留设置时，由你的应用保存一个完整主题对象并在修改后传入。

system 跟随系统深浅变化。默认桌面浮窗为 420 × 680，受视口限制；宽度不超过 breakpoint 时转为全屏。手机键盘打开后的布局需在目标设备验收。

## 四层分别怎样用

| 层         | 导入入口                          | 什么时候使用                               |
| ---------- | --------------------------------- | ------------------------------------------ |
| 设计 Token | @agent-runtime/chat-ui/tokens     | 改色、字体、圆角、间距和尺寸               |
| 原子组件   | @agent-runtime/chat-ui/atoms      | 组合按钮、图标、输入框等基础元素           |
| 业务组件   | @agent-runtime/chat-ui/components | 复用消息、消息列表、输入区、历史和执行详情 |
| 页面       | @agent-runtime/chat-ui/pages      | 直接挂载浮窗或聊天页                       |

多数接入只需要页面层加 theme。业务组件只接收展示数据和回调，不直接调用后端；想完全自绘 UI 时，可单独使用 chat-core 的 ChatController 和 ChatTransport。

设计 Token 是视觉变量，登录 Token 是业务凭据，模型 Token 是用量单位，三者不能混用。

单独组合组件的例子，target 是你准备的空 HTMLElement：

```ts
import { createMessage } from "@agent-runtime/chat-ui/components";
import { applyChatTheme } from "@agent-runtime/chat-ui/tokens";
import { installChatStyles } from "@agent-runtime/chat-ui/styles";

const root = target.attachShadow({ mode: "open" });
installChatStyles(root);
const theme = applyChatTheme(target, { mode: "light" });
const message = createMessage({
  sender: "agent",
  name: "产品助手",
  text: "你好，有什么可以帮忙？",
});
root.append(message.element);
// 更新：message.update({ sender: "agent", name: "产品助手", text: "新的回答" });
// 卸载：theme.destroy(); 并由宿主移除自己创建的 DOM。
```

主题 API 会校验颜色、对比度和尺寸。优先调用公开 API，避免依赖 Shadow DOM 内部类名。默认文字按纯文本展示，不支持 Markdown 富文本、上传文件、语音或群聊。

## 打开、发送与停止

| 调用                                     | 行为                                       |
| ---------------------------------------- | ------------------------------------------ |
| chat.open() / close() / toggle()         | 显示或收起窗口；收起后后台仍可执行         |
| chat.controller.setDraft(text)           | 只填输入框，不自动发消息                   |
| chat.controller.send()                   | 发送当前草稿                               |
| chat.controller.retrySend()              | 重试结果未确认的发送，复用请求标识         |
| chat.controller.cancel()                 | 请求停止当前 Run，不撤销已经完成的外部动作 |
| chat.controller.newSession(assistantId?) | 为选定助手开始新对话                       |
| chat.controller.selectSession(id)        | 加载当前用户可访问的历史                   |
| chat.controller.reconnect()              | 登录或网络恢复后重新读取状态               |

chat.ready 表示首次连接尝试已经结束，是否成功需检查 chat.controller.snapshot.connection === "ready"。挂载时可通过 onStateChange(state) 监听连接与对话变化，通过 onOpenChange(open) 同步窗口开关。

## 刷新与账号切换

默认不写浏览器存储。需要刷新后恢复当前会话 ID，可在挂载时显式提供按账号隔离的 memory：

```ts
import {
  mountChatWidget,
  createHttpChatTransport,
  createSessionMemory,
} from "@agent-runtime/chat-ui";

const chat = mountChatWidget({
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  memory: createSessionMemory(sessionStorage, tenantId + ":" + accountId),
});
```

tenantId 和 accountId 来自你已有的登录状态，只用来区分前端存储；服务端仍独立验证身份。这里只保存会话 ID，正文在后端。当前界面默认展示最近 50 个会话及每会话最近 50 次运行，尚无长历史分页 UI。

退出、切换账号或登录布局卸载时调用 chat.destroy({ clearSession: true })。如果主动传入自己的共享 controller，视图销毁不负责释放它，需由所有者调用 controller.dispose({ clearSession: true })。

## 发生连接错误时

界面会提供重新连接或重试发送；401/403 会清掉当前可见会话和历史。宿主负责恢复登录，必要时重建实例。

关闭窗口、卸载组件、放弃重试都不会撤销服务端可能已接收的运行。需要停止时显式调用 cancel。当前控制器通过 HTTP 快照轮询更新，活跃时默认 450ms、空闲时 2500ms；它不是 WebSocket/SSE 客户端。
