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

## 对话列表、当前会话与工具

聊天区域左侧是对话列表，点击条目即可继续之前的聊天；蓝色背景表示当前会话。“新对话”会打开空白聊天，发送首条消息或首次打开配置时创建会话。

聊天容器宽度达到 760px 时默认显示左栏；较窄时点击标题左边的“对话列表”按钮展开，选中会话后自动收起。希望桌面浮窗常驻左栏，可将上面的 panelWidth 改为 880；本文档站采用 440px 宽的右侧助手栏（窄屏全屏）。实际尺寸仍受视口限制。

顶部还有两个查看入口：

- **当前会话**：查看标题、会话 ID、助手、状态、创建时间、对话轮数和配置版本。
- **工具**：查看该会话接入的工具名称、用途及只读／可写／审批状态。展开面板后可以滚动阅读完整清单。

这些入口是页面层的通用能力，mountChatPage 和 mountChatWidget 都自带。打开面板不会发送消息或调用工具；点击关闭或按 Esc 返回聊天，输入草稿会保留。

工具清单由 chat-server 从该会话的配置生成。如果本轮回答仍使用旧配置，面板会另列“本轮回答的工具”。旧版或自定义服务未返回工具清单时显示“当前服务未提供工具清单”，不会误报为零个工具。名称和说明可由后端助手的 toolDisplay 提供，见[连接后端与用户登录](/docs/frontend-server/)。

## 在独立网页配置当前会话

后端助手显式配置 `settings: true` 后，在已有的 IM 挂载选项中加入 `settingsUrl: "/agent/settings/"`，顶部会出现「配置」。点击在新标签页打开该同源页面，并自动附加当前会话的 `session` 参数。首次打开会创建空会话，不调用模型，聊天草稿保留。

在你的网站提供 `/agent/settings/` 页面，准备一个有明确高度的容器，例如 `<main id="settings" style="height:100dvh"></main>`，页面脚本如下：

```ts
import { mountChatSettingsPage, createHttpChatTransport } from "@agent-runtime/chat-ui";

const sessionId = new URL(location.href).searchParams.get("session");
if (!sessionId) throw new Error("请从聊天配置入口打开");
const settings = mountChatSettingsPage(document.querySelector<HTMLElement>("#settings")!, {
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  sessionId,
  theme: { mode: "system" },
});
// 页面卸载或切换账号时：settings.destroy()
```

使用与 IM 相同的业务登录方式。网页提供四类配置：工具、Skill、知识与记忆、回答与上下文。保存后只影响该会话的后续发言；正在执行的回答和其他会话保持原配置。恢复默认后仍需点击保存，多标签页冲突时先重新载入。

开关只能启停后端已接入的能力；未接入的 Skill、记忆存储显示说明或禁用状态。默认模型可跨刷新保存，输入框的单轮选择优先。关闭记忆读取不会清除本会话聊天记录或已有记忆，见[读取记忆](/docs/memory/)。本站右上角可直接体验，后端开放方式见[连接后端与用户登录](/docs/frontend-server/#开放会话配置)。

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

主题 API 会校验颜色、对比度和尺寸。优先调用公开 API，避免依赖 Shadow DOM 内部类名。助手正文支持安全 Markdown 与代码复制，原始 HTML 不执行。后端启用图片接口且所选模型支持视觉时可上传与查看图片，见[图片接入](/docs/images/)。通用文件、语音和群聊尚未提供。

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

## 编辑输入和选择模型

输入框会随内容增高，可点击“展开输入框”编辑长文本，Esc 收起；光标和选区保留。空输入框按 ↑ 可以取回上一条文字。通用 SDK 默认 Ctrl/⌘+Enter 发送、Enter 换行；挂载时传 `sendShortcut: "enter"` 可以使用 Enter 发送、Shift+Enter 换行，用户也能通过“输入设置”切换。本文档站已使用 Enter 发送。

后端在 assistant.config.models 声明多个模型、routing.primary 指定默认项。可以通过 assistant.modelDisplay[id].label 提供公开名称，输入框下方会自动显示模型选择器及思考/图片能力。模型只影响下一轮，正在运行的回答保持原配置；有图片草稿时不能切到纯文本模型。

```ts
// 在 chat.ready 完成后，使用服务端实际返回的 ID。
chat.controller.setModel("vision");
chat.controller.setSkill("guide"); // 配置了该 Skill 才可选择
chat.controller.setDraft("请按指南解释图片中的接入流程");
// setSkill() 无参数恢复自动；手选 Skill 在发送受理后复位。
```

界面会自动提供已声明 Skill 的选择器。失败重试沿用原模型和 Skill；刷新恢复最近一轮模型，新会话采用默认模型。旧会话增加模型需要宿主更新 Session 配置，通用聊天桥不会自动修改。模型地址、凭据和技能指令始终留在服务端。

麦克风目前置灰并注明“未接入语音识别服务”。配置普通、思考或视觉聊天模型不会自动获得语音识别；当前没有可启用的语音参数。未发送草稿、模型选择和快捷键偏好不跨刷新保存。
