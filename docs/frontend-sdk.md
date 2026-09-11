# 把聊天助手放进自己的管理后台

你可以在自己的管理后台右下角放一个图标。用户点击后打开聊天窗口，发送消息，由服务器上的 Agent Engine 调用模型并返回回答。也可以把聊天直接放在某个页面的内容区域。

先看效果，再接入代码。**本地示例：[管理后台与 IM SDK](http://127.0.0.1:4318/embed/)**。尚未启动时，按[新手上手指南](getting-started.md)运行 `pnpm playground`。模型密钥仍在服务器的独立文件里管理，网页不用填写。

## 1. 在本地试一遍

1. 打开示例，点击右下角蓝色聊天图标。
2. 选择助手，输入「你好，请介绍你自己」，点「发送」。Enter 换行，Ctrl / Cmd + Enter 发送。
3. 试着切换页面上的「主题」「皮肤」「品牌色」；打开的对话和未发送的输入会保留。
4. 点击库存表中的「询问助手」，再点聊天里的「发送」。这会选中库存工具助手并填好问题。DEMO-1 的合成库存为 24 件。
5. 点「执行详情」看工具状态和用量；点「查看 Debug」看这次会话的只读执行记录。
6. 向下找到「也可以作为页面嵌入」，点击「加载嵌入式聊天页」。它是另一个独立实例。
7. 用浏览器设备模式切换到手机宽度：聊天会变成全屏；点关闭或按 Escape 返回入口。

示例使用本机已配置的真实模型，会产生模型用量；库存工具只返回演示数据。页面下方的组件展区使用固定合成消息，不会调用模型。

## 2. 先认识三个包和四层界面

| 包                           | 安装位置               | 做什么                                 |
| ---------------------------- | ---------------------- | -------------------------------------- |
| `@agent-runtime/chat-ui`     | 前端                   | 图标、聊天窗口、换肤和可复用组件       |
| `@agent-runtime/chat-core`   | 前端，也能在 Node 导入 | 对话数据、网络接口、发送/重试/取消状态 |
| `@agent-runtime/chat-server` | Node 后端              | 验证宿主身份后，把聊天请求交给 Engine  |

`chat-ui` 按下面四层组织。Alice 项目只作为分层思路参考；本项目独立实现，没有搬运它的组件或私有数据。

| 层         | 公开入口                            | 典型内容                                         |
| ---------- | ----------------------------------- | ------------------------------------------------ |
| 设计 Token | `@agent-runtime/chat-ui/tokens`     | 原始色、语义色、字体、间距、圆角、窗口尺寸、主题 |
| 原子组件   | `@agent-runtime/chat-ui/atoms`      | 按钮、图标、输入框、状态文字                     |
| 业务组件   | `@agent-runtime/chat-ui/components` | 消息、消息列表、输入区、历史列表、执行详情       |
| 页面       | `@agent-runtime/chat-ui/pages`      | 组合聊天页、页面挂载、悬浮入口挂载               |

这里的 **设计 Token** 是颜色和尺寸变量，和登录用的 Token、模型消耗的 Token 是三个不同概念。

业务组件只接收展示数据和回调，不直接请求接口。页面连接 `ChatController`，后者通过 `ChatTransport` 访问服务器。你的登录身份、模型地址、API Key 和工具授权由后端管理。

## 3. 安装到另一个项目

当前版本尚未发布 npm。先在本仓库生成本地安装包：

```sh
cd /Users/circle/git/agent-engine
pnpm install
pnpm pack:chat
```

成功后，`.local/chat-packages/` 里有四个 `.tgz` 文件。因为这些包互相依赖、但尚未发布，**先在接入项目根目录创建或合并 `pnpm-workspace.yaml`**，让 pnpm 从本地读取内部依赖；保留已有的其他配置：

```yaml
overrides:
  "@agent-runtime/chat-core": "file:/Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz"
  "@agent-runtime/sdk": "file:/Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-sdk-0.1.0-dev.tgz"
```

纯前端项目只需要 `chat-core` 这一条；后端需要两条。单包项目也可以使用这个配置文件；多包项目放在工作区根。`.tgz` 文件必须保持可访问；团队可换成内部制品库位置，正式发布包后再移除本地覆盖。覆盖设置说明见 [pnpm overrides](https://pnpm.io/settings/dependency-resolution#overrides)。

切换到**你自己的前端项目**目录，再安装两个前端包：

```sh
pnpm add /Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz /Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-chat-ui-0.1.0-dev.tgz
```

在你的 **Node 后端项目**目录安装：

```sh
pnpm add /Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz /Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-sdk-0.1.0-dev.tgz /Users/circle/git/agent-engine/.local/chat-packages/agent-runtime-chat-server-0.1.0-dev.tgz
```

同一个全栈项目可以一次安装四个包。换电脑时，把上述路径换成实际路径。包升级后重新打包、重新安装；不要直接运行尚未发布的 `pnpm add @agent-runtime/chat-ui`。

服务端需要 Node 22.19 或更新版本。前端使用支持 Shadow DOM、原生 dialog、ResizeObserver、VisualViewport 和现代 JavaScript 的浏览器；当前自动化覆盖 Chromium 的桌面和移动视口，真实 iOS/Android 设备兼容性需要接入方验收。

## 4. 前端：放上一个图标

下面的代码放在前端页面已经加载、用户已经登录之后执行，例如应用布局的挂载阶段：

```ts
import {
  createHttpChatTransport,
  mountChatWidget,
} from "@agent-runtime/chat-ui";

const chat = mountChatWidget({
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  theme: { mode: "system", skin: "workbench", accent: "#0758a0" },
  copy: { title: "工作台助手", welcomeTitle: "有什么需要帮忙？" },
});

// 可由你自己的菜单、按钮调用。
// chat.open();
// chat.close();
// chat.controller.setDraft('请介绍当前可以使用的工具。');

// 用户退出或应用布局卸载时：
// chat.destroy({ clearSession: true });
```

不需要额外引入 CSS 文件。SDK 在自己的 Shadow DOM 中安装样式，宿主通常的 `button`、`textarea` 等样式不会覆盖聊天内部。Shadow DOM 是样式/DOM 封装，不是身份或数据安全边界，参见 [MDN Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)。

`/api/agent-chat` 必须在你的后端实际挂载下一节的接入桥。只装前端包会看到连接错误。开发时可以使用前端开发服务器的同源代理，把这个路径转给后端；后端 `allowedOrigins` 应填写**浏览器地址栏的前端 origin**，如 `http://localhost:5173`。

### React 中挂载

```tsx
import { useEffect } from "react";
import {
  createHttpChatTransport,
  mountChatWidget,
} from "@agent-runtime/chat-ui";

export function ChatEntry({ accountId }: { accountId: string }) {
  useEffect(() => {
    const chat = mountChatWidget({
      transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
      copy: { title: "工作台助手" },
    });
    return () => chat.destroy({ clearSession: true });
  }, [accountId]);
  return null;
}
```

把 `<ChatEntry accountId={当前账号标识} />` 放在登录后的全局布局中。组件不是 React 专属控件，React 只负责它的挂载和销毁。SSR 环境中导入包可以，但挂载必须在浏览器 effect 中运行。

### Vue 3 中挂载

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import {
  createHttpChatTransport,
  mountChatWidget,
} from "@agent-runtime/chat-ui";

let chat: ReturnType<typeof mountChatWidget> | undefined;
onMounted(() => {
  chat = mountChatWidget({
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
    copy: { title: "工作台助手" },
  });
});
onBeforeUnmount(() => chat?.destroy({ clearSession: true }));
</script>
```

让这个组件随登录布局卸载；切换账号时用 `:key="accountId"` 重建，避免复用上一个账号的前端状态。

### 没有构建工具的 HTML 项目

构建会生成 `packages/chat-ui/dist/agent-chat.mjs`（独立 ESM）和 `agent-chat.js`（全局变量 `AgentChat`）。将文件作为你的网站静态资源提供，再使用：

```html
<script type="module">
  import {
    mountChatWidget,
    createHttpChatTransport,
  } from "/assets/agent-chat.mjs";
  const chat = mountChatWidget({
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  });
</script>
```

`/assets/` 是你配置的静态路径。不要双击 HTML 用 `file://` 打开。全局脚本形式需先加载 `agent-chat.js`，再调用 `AgentChat.mountChatWidget(...)`。

## 5. 后端：接到已有登录系统和 Engine

可复用的 TypeScript 示例在 [`examples/embedded/host.ts`](../examples/embedded/host.ts)。它导出 `createHostChat`，要求宿主提供三件事：已有 Engine、验证登录的方法、当前用户允许使用的助手列表。

```ts
import { createHostChat } from "./host.js";

// rootEngine、verifyExistingLogin、getAllowedAssistants 来自你的服务端应用。
const chatHandler = createHostChat({
  engine: rootEngine,
  origin: "https://admin.example.com", // 改成你的后台实际 origin，不带路径或结尾斜杠
  namespace: "my-admin-chat", // 当前应用固定标识，重启后保持不变
  verifyLogin: verifyExistingLogin,
  assistantsFor: getAllowedAssistants,
});

// 在已有 Node HTTP 服务中，放在默认 404 之前；此前不要消耗请求正文。
// if (await chatHandler(req, res)) return;
// ...继续处理你原有的其他路由
```

上面的三个宿主变量需要接到你现有的服务。`verifyLogin(request)` 必须验证现有 Cookie 会话或业务访问令牌，成功时返回可信 `{ tenantId, subjectId }`，失败时返回 `null`。不能直接把请求体、查询参数或未经验证的请求头当成身份。

`getAllowedAssistants(principal)` 返回服务器配置，例如：

```ts
return [
  {
    id: "office",
    label: "办公助手",
    description: "回答工作问题",
    config: serverSideSessionConfig,
  },
];
```

`serverSideSessionConfig` 就是后端 SDK 使用的会话配置，包含模型和允许调用的工具。如何创建 Engine/配置模型见 [SDK 入门](sdk-quickstart.md)。密钥通过 `secretRef` 引用，集中配置方法见[模型与凭据配置](local-model-configuration.md)。`id` 和 `namespace` 使用字母开头的 1–64 位字母、数字、下划线、点或连字符。

接入桥会在**每次请求**重新调用身份验证和助手授权；会话同时按应用标识、租户和用户隔离。浏览器只能提交助手 ID 和文本，不能覆盖模型、工具或身份。SDK 返回文本、状态、工具名称和用量；Thinking 原生载荷、凭据、工具原始回执不发给浏览器。

同源 Cookie 登录是最短接入路径。若宿主使用短期业务令牌，前端可在每次请求时获取最新值：

```ts
const transport = createHttpChatTransport({
  baseURL: "/api/agent-chat",
  headers: async () => ({
    Authorization: `Bearer ${await getBusinessAccessToken()}`,
  }),
});
```

`getBusinessAccessToken()` 是宿主已有的登录功能；这里传业务令牌，**不要传模型 API Key**。跨域部署需前端 `allowCrossOrigin: true`，后端明确允许前端 origin。跨域 Cookie 还需前端 `credentials: 'include'`、后端 `allowCredentials: true` 及宿主正确设置 Cookie。已有 CSRF 校验可留在宿主，并用 `headers` 传相应值。

`chat-server` 是 Node HTTP 接入桥，并非浏览器直连数据库服务；Express 中应放在会消耗正文的中间件之前。其他后端语言可以实现同一 `ChatTransport` 协议，不应把服务端 SDK 打进前端包。

## 6. 换皮肤、改颜色、调整尺寸

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

`updateTheme` 接收**完整的下一份主题选项**，没有传的项恢复默认值；不会清空会话。`system` 会响应系统深浅变化。桌面浮窗默认 420 × 680，并受当前视口限制；宽度不超过 `breakpoint` 时，使用原生模态 dialog 占满可用视口。移动端会根据 VisualViewport 变化调整高度；真实手机软键盘效果仍需在目标设备验证。dialog 行为依据浏览器原生机制，见 [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)。

Token 完整类型见 [`ChatTokens`](../packages/chat-ui/src/tokens/index.ts)。颜色如 `canvas`、`text`、`muted`、`userBackground` 都可覆盖；正文、辅助文字等配色组合会检查至少 4.5 的对比度。纯品牌色会自动选择可读的按钮文字色，不能直接拿浅品牌色当白底文字。

数字尺寸用 px（`motionMs` 用毫秒，`zIndex` 无单位）。正文至少 14、辅助文字至少 12、按钮高度至少 44；非法颜色或不可读的组合会抛出主题错误。你也可以保存自己的主题对象作为第三套皮肤；不需要修改业务组件。

SDK 输出统一的 `--ae-chat-*` CSS 变量，例如 `--ae-chat-panel-width`。优先使用公开主题 API，这样可以一起更新尺寸、响应式判断和校验；不要依赖 Shadow DOM 内部类名去打补丁。默认入口在右下角，`position: 'left'` 可改到左下角。

## 7. 放进一个页面，或单独使用组件

页面容器必须有明确高度：

```html
<div id="chat-area" style="height: 680px; min-height: 320px"></div>
```

```ts
import { mountChatPage, createHttpChatTransport } from "@agent-runtime/chat-ui";
const target = document.querySelector<HTMLElement>("#chat-area")!;
const page = mountChatPage(target, {
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  theme: { mode: "light" },
});
// page.destroy();
```

页面会随容器宽度变化；较窄时收起键盘提示并调整间距。挂载多个实例时，默认各自拥有控制器和对话；不会全局复用同一个聊天状态。

单独组合组件时要自行安装样式和主题，并在卸载时移除主题监听：

```ts
import { createMessage } from "@agent-runtime/chat-ui/components";
import { applyChatTheme } from "@agent-runtime/chat-ui/tokens";
import { installChatStyles } from "@agent-runtime/chat-ui/styles";

const root = target.attachShadow({ mode: "open" });
installChatStyles(root);
const theme = applyChatTheme(target, { mode: "light" });
const message = createMessage({ sender: "agent", name: "助手", text: "你好" });
root.append(message.element);
// message.update({ sender: 'agent', name: '助手', text: '新的内容' });
// theme.destroy();
```

完整组件示例见 [`examples/embedded/app.js`](../examples/embedded/app.js)。消息当前按纯文本展示，HTML 不会执行；首版没有 Markdown 富文本、图片/文件上传、语音或群聊。

## 8. 生命周期、历史和错误处理

| 操作                                  | 实际行为                                                 |
| ------------------------------------- | -------------------------------------------------------- |
| `open()` / `close()` / `toggle()`     | 控制悬浮窗；关闭后焦点回到入口，后台 Run 继续执行        |
| `controller.setDraft(text)`           | 只填输入框，不自动发消息                                 |
| `controller.send()`                   | 受理成功才清空输入；结果不明时保留同一请求标识           |
| `controller.retrySend()`              | 重试尚未确认的发送，复用原标识避免重复受理               |
| `controller.cancel()`                 | 请求服务端停止当前 Run，等待最终状态                     |
| `controller.newSession(assistantId?)` | 开始新对话；有未确认请求时先处理请求                     |
| `controller.selectSession(id)`        | 读取当前用户已获授权的历史会话                           |
| `controller.reconnect()`              | 重新读取配置和状态，登录恢复后可调用                     |
| `destroy({ clearSession: true })`     | 清理自身请求、计时器、监听和 DOM，并清掉可选会话 ID 缓存 |

`ready` 表示首次连接尝试结束；是否成功用 `controller.snapshot.connection === 'ready'` 判断。可以传 `onStateChange(state)` 监听状态、传 `onOpenChange(open)` 监听弹窗开关。

网络断开时，界面提供重新连接；发送受理结果不明时提供「重试发送」。放弃重试只停止客户端继续尝试，**不会撤销服务器可能已受理的运行**。服务器返回 401/403 时清掉当前可见会话和历史；宿主负责重新登录，并在退出/换账号时销毁和重建实例。

默认不写浏览器存储。需要刷新后恢复当前会话时，显式传按账户隔离的存储：

```ts
import { createSessionMemory } from "@agent-runtime/chat-ui";
const memory = createSessionMemory(sessionStorage, `${tenantId}:${accountId}`);
// 将 memory 传给 mountChatWidget({ transport, memory })。
```

这里只存会话 ID，不存聊天正文或密钥。历史正文保存在服务端。默认最近 50 个会话、当前会话最近 50 次运行；界面显示总运行数提示。长历史分页尚未提供。

如果主动传入自己的 `controller`，它由你负责调用 `controller.dispose({ clearSession: true })`；视图 `destroy()` 不销毁共享控制器。关闭/卸载都不等于取消 Run，确需停止时先显式请求取消。

## 9. 当前范围与验证方式

- 文本答案以服务端快照持续更新；控制器默认活跃时每 450ms、空闲时每 2500ms 拉取，不是 WebSocket/SSE 客户端。
- 展示工具状态和 Token 用量；用量不完整、费用估算不完整会分别注明，不把缺失值当零。
- 可展示审批/等待状态，但首版 IM 没有审批或人工处置表单；需要宿主通过后端 SDK 完成人工流程。
- 默认中文，`copy` 可覆盖主要按钮和欢迎文案；不是完整多语言系统。
- Debug 是单独鉴权的开发页面。通用桥默认不提供 Debug 链接；仅本地示例配置了该入口。
- `styleNonce` 支持需要 nonce 的样式后备路径；宿主自己的 CSP、定位层级和真实设备需要联调。

```sh
pnpm check
pnpm verify:chat-ui --functional-only
pnpm verify:chat-packages
```

第一条还会执行真实 PostgreSQL 集成/恢复测试，需按上手指南准备专用测试库；第二条用确定性模型在 Chromium 验证聊天，不需要模型 Key。去掉 `--functional-only` 会输出本地截图。第三条会打包，再在独立临时项目安装并验证导出、声明和浏览器构建，需要下载依赖；仅生成安装包用 `pnpm pack:chat`。真实模型验证结果和安装包验证记录见[前端 SDK 验收记录](frontend-sdk-acceptance.md)。
