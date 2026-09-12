# IM 会话配置

IM 顶部的「配置」会在新标签页打开当前会话的配置网页。页面复用聊天 SDK 的主题、身份和 HTTP 接口。首次打开会创建一个空会话，不发送消息，原输入草稿仍保留。

## 用户能调整什么

| 分类 | 可调整内容 | 生效边界 |
| --- | --- | --- |
| 工具 | 搜索、逐个启停 | 只选宿主已声明且未禁止的工具；原有审批仍有效 |
| Skill | 搜索、逐个启停 | 控制自动加载和输入框手选目录；工具开关同时生效 |
| 知识与记忆 | 知识库启停；每个记忆存储独立读、写开关 | namespace、可信身份、写入策略仍由后端管理 |
| 回答与上下文 | 默认模型、公开思考展示、自动整理上下文 | 只能使用宿主开放的模型和策略，输入框单轮选择优先 |

点击「保存配置」后影响当前会话的后续发言，已受理 Run 的模型和能力快照不变。其他会话保持自己的设置。「恢复助手默认」先修改草稿，需要再次保存。多标签页修改发生版本冲突时保留本页草稿，用户可重新载入。未保存离开会触发浏览器提示。

当前文档助手接入 8 个只读工具、2 个 Skill、1 个正式知识库和按浏览器身份隔离的长期记忆，配置页会展示真实目录和独立读写开关。未接入能力的空状态仍用于其他自定义宿主。新增能力和验证入口见 [文档站能力覆盖](docs-capability-coverage.md)。

## 如何接入

1. 后端在 `ChatAssistantDefinition` 上显式设置 `settings: true`。默认不开放。`config` 仍是服务端持有的完整 Session 配置。
2. IM 的 `mountChatPage` 或 `mountChatWidget` 传入同源的 `settingsUrl`，例如 `/agent/settings/`。组件在打开时附加 `session` 查询参数。
3. 该网页用相同的业务身份创建 transport，挂载 `mountChatSettingsPage`。挂载容器需要明确高度；卸载或切换账号时调用 `destroy()`。

前端页面脚本（容器为 `<main id="settings" style="height:100dvh"></main>`）：

```ts
import {
  createHttpChatTransport,
  mountChatSettingsPage,
} from "@agent-runtime/chat-ui";

const sessionId = new URL(location.href).searchParams.get("session");
if (!sessionId) throw new Error("请从 IM 配置入口打开");
const page = mountChatSettingsPage(document.querySelector<HTMLElement>("#settings")!, {
  transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
  sessionId,
  theme: { mode: "system" },
});
// await page.ready；page.updateTheme({ mode: "dark" })；卸载时 page.destroy()。
```

`helpLinks` 可提供 tools / skills / knowledge / memory 的 HTTP(S) 接入文档。`styleNonce` 支持宿主 CSP。可选 `toolDisplay`、`skillDisplay`、`knowledgeDisplay`、`memoryDisplay` 提供公开名称和说明；不会把模型指令、绑定地址、凭据或记忆 namespace 自动投影到浏览器。完整工作实现见 `examples/docs-site/settings.js` 与 `server.ts`。

## API 变化

| 新接口 / 字段 | 用途 |
| --- | --- |
| `ChatAssistantDefinition.settings?: boolean` | 宿主显式开放会话配置 |
| `ChatAssistant.settingsEnabled` / `ChatSession.settingsEnabled` | 可选公开能力标记，兼容旧服务 |
| `ChatTransport.readSettings(sessionId, signal?)` | 读取安全目录、默认值、当前选择及配置版本 |
| `ChatTransport.updateSettings(sessionId, { ifVersion, preferences }, signal?)` | 基于版本比较保存受限选择 |
| `ChatSettings` / `ChatPreferences` 及其 schema | 前端与 HTTP 共用的类型和校验 |
| `ChatController.ensureSession()` | 创建或返回当前会话 ID，不调用模型；创建重试复用请求 ID |
| `ChatPageOptions.settingsUrl` | IM 的独立配置网页入口 |
| `mountChatSettingsPage` | 可单独复用的四类配置页面，根入口与 `/pages` 均导出 |
| `memory.stores[].read.enabled?: boolean` | 缺省 true；false 同时关闭自动和显式记忆读取 |

HTTP 为 `GET /sessions/:id/settings` 与 `POST /sessions/:id/settings`（前面加聊天接口前缀）。保存使用已有 `Session.replaceConfig`，并继续执行 Session 和 config 授权、来源检查、版本比较及归档限制。请求只包含选择 ID、布尔开关和 `ifVersion`；未知字段、未声明 ID、提高权限和任意 config 注入被拒绝。版本冲突不覆盖新配置；保存响应丢失时先回读核对，不能把未确认的请求直接判为成功。

自动整理开关仅在宿主显式配置 `context.compaction.maxCyclesPerRun > 0` 时开放；关闭设为 0，恢复使用宿主原上限。公开思考开关只能收窄 `thinkingDisplay` 与模型 `thinking.expose` 的许可，关闭不再保留新的展示正文，不改变模型是否具备思考能力，也不删除历史已保留正文。

## 记忆与兼容性

`read.strategy: "none"` 沿用原语义：不自动读取，模型仍可按需显式读取。新增 `read.enabled: false` 才是完整的读取禁用；它不会移除独立写入能力。聊天记录仍用于本会话续聊，已经进入上下文的记忆不会被该开关抹去。需要全新上下文请新建会话；删除记忆需业务存储单独提供。

`tools[].permission: "deny"` 现在同时从模型能力目录中移除，并在调用分发前拒绝；不会进入业务权限 Binding 或复用旧成功回执。`require-approval` 的权限与回执检查保持原行为。这是静态禁用语义的收紧，不能依赖被禁止工具继续触发业务策略的副作用。

用户选择保存到 Session 配置的 `metadata.agentChatPreferences`。文档宿主更新旧会话目录时调用 `restoreChatPreferences`，保留用户的限制、新增能力默认关闭、撤销能力从选择中移除。其他宿主若自行迁移 Session，也应在版本比较更新前应用该函数；通用聊天桥不会后台批量迁移会话。

## 验证

`tests/integration/chat-settings.test.ts` 使用真实 Engine、HTTP 与确定性模型验证权限边界、活动 Run 冻结、下一轮实际模型请求、记忆读写分离、版本冲突、归档和目录迁移。`scripts/verify-chat-settings.ts` 验证真实网页的打开、草稿保留、保存、刷新、丢失响应核对、键盘操作及桌面/移动主题。最终执行结果和本地入口证据见 [文档站验收记录](../examples/docs-site/ACCEPTANCE.md)。
