# 输入编辑与模型选择

2026-09-12。用户希望输入框及下方工具栏参考 WorkBuddy。当前架构支持直接补齐这些交互，不需要替换编辑组件或引擎：`composer` 管编辑与按钮，`ChatController` 管草稿与请求，`chat-server` 生成可选目录，Engine 已有 `RunInput.overrides.model` 和 `RunInput.skill`。

## 对齐结果

| 使用动作 | 当前行为 |
| --- | --- |
| 编辑长消息、代码和中文 | 原生 textarea，保留选择、撤销/重做和文本粘贴；内容自动增高，超过上限在输入区滚动 |
| 展开编辑 | 同一个输入框就地展开，光标和选区保留；再次点击或 Esc 收起；响应容器与可见视口变化 |
| 发送与换行 | 文档站默认 Enter 发送、Shift+Enter 换行；输入设置可选 Ctrl/⌘+Enter 发送。通用 SDK 默认仍为后一种 |
| 中文输入法 | composition 期间及确认候选词后的 80ms 不触发快捷发送；按发送按钮仍须已结束组合输入 |
| 找回上一条输入 | 空输入框按 ↑，将当前会话最近一轮文字放回草稿，不发送、不重附图片 |
| 提前写下一条 | 当前 Run 执行时允许编辑下一条、选模型；正在确认发送的短窗口和结果未明的重试期间锁定已提交内容 |
| 选择模型 | 列出宿主配置并允许用于该会话的模型；显示名称、思考/图片能力；切换只作用于下一轮 |
| 选择 Skill | 有已声明 Skill 时在“输入设置”中显示选择器；自动选择保留原行为；手选 Skill 在首个模型请求前应用，受理后复位为自动 |
| 添加图片 | 保留选择、粘贴、拖拽、预览、移除和重试；纯文本模型下入口禁用；有图片草稿时拒绝切到纯文本模型，草稿保留 |
| 麦克风 | 未接入 ASR 时隐藏入口；不申请麦克风权限、不调用浏览器隐式识别服务。调整理由：永久不可用的按钮不应占据每次发送的操作区 |

本次参考的是只读重构仓库中模型 provider、语音 provider、输入编辑和 footer 的代码行为，未做当前线上 WorkBuddy 的逐像素或完整功能验证。独立实现，没有搬运其私有实现、素材或提示词。工作区文件引用、权限模式、通用附件和语音转写尚未接入，不展示可用的占位动作。

## 服务端配置与前端接入

在同一份 Session 配置的 `models` 中声明可选模型、`routing.primary` 指定默认模型、`skills` 声明技能；这些模型仍须通过宿主授权和策略检查。`ChatAssistantDefinition.modelDisplay` 可提供公开名称：

```ts
// 放在 createChatHandler 的 resolveContext 返回值中。
assistants: [{
  id: "support",
  label: "产品助手",
  config: sessionConfig, // 已有的 models、routing、skills 和业务配置
  modelDisplay: {
    general: { label: "日常问答" },
    reasoning: { label: "复杂问题" },
    vision: { label: "图片问答" },
  },
}]
```

这里的 ID 必须与 `sessionConfig.models` 的键一致。只有实际声明 `thinking.enabled: true` 的配置才标注思考；是否可以执行仍取决于适配器和真实模型能力，不能只增加标签。视觉模型按[图片场景](../examples/docs-site/content/images.md)配置能力和图片预算。

```ts
const chat = mountChatWidget({ transport, sendShortcut: "enter" });
await chat.ready;
chat.controller.setModel("vision"); // 只能选服务端返回的 ID
chat.controller.setSkill("guide"); // 可省略，或无参数恢复自动
chat.controller.setDraft("请按接入指南解释这张图");
// 用户还可以在工具栏修改；调用 send() 才实际发送。
```

完整可运行的宿主和前端起点仍是[前端接入场景](../examples/docs-site/content/frontend.md)。页面与浮窗共享同一套能力。单独使用 `createComposer` 时传 `onModel` / `onSkill`、用最新 ChatState 调 `update`，卸载时调用新增的 `destroy()` 释放观察器和全局监听。

## API 变化与边界

| 新增接口/字段 | 含义 |
| --- | --- |
| `ChatModel` / `chatModelSchema` | 仅 id、label、supportsImages、thinking |
| `ChatSkill` / `chatSkillSchema` | 仅 id、label |
| `ChatAssistant` / `ChatSession.models`、`defaultModelId`、`skills` | 可选的公开目录；会话目录以已保存配置和当前助手可用 ID 的交集为准 |
| `ChatAssistantDefinition.modelDisplay` | 服务端公开名称覆盖，不接收浏览器凭据或模型地址 |
| `ChatTransport.sendMessage` 的 `modelId`、`skillId` | 可选 ID；服务端映射到既有 RunInput.overrides.model / skill |
| `ChatRun.modelId`、`skillId` | 本轮冻结配置中的模型 ID、显式请求的 Skill ID；自动选择的 Skill 仍以处理过程为准 |
| `ChatState.modelId`、`skillId` | 下一条草稿的选择；`setModel` / `setSkill` 更新，`composerCatalog` / `selectedChatModel` 读取 |
| 页面/浮窗/输入组件的 `sendShortcut` | `enter` 或 `mod-enter`，缺省 `mod-enter` 保持原 SDK 发送习惯 |

字段均为兼容新增，协议仍为 v1。前端与 chat-server 应一起升级；旧服务的目录缺失时隐藏选择器，继续原有文本发送。服务端不接收任意 `overrides`、模型 URL、API Key 或 Skill 指令。已受理请求的 ID、正文、模型、Skill、图片引用一起冻结，失败重试使用同一内容；当前目录已撤销的选择明确拒绝，不偷偷切换。服务端模型授权仍会在派发前重新检查。

刷新恢复会话时采用最近一轮的模型选择；页面内尚未发送的修改不会被轮询覆盖。新建会话恢复助手默认模型。未发送的文字、模型/Skill 选择及快捷键偏好不跨页面持久化；只有显式配置 memory 的会话 ID 保存到浏览器。跨协议或不兼容模型的历史继续仍受引擎的原生协议/图片能力检查约束，不保证任意模型间无损续聊。

本地文档启动器读取已配置的本地模型 Profile，`AGENT_DOCS_MODEL_PROFILE` 选择默认项，其余可用项加入目录。保持数据库、访客身份与稳定密钥后，本站会在读取空闲历史会话或发送前通过原有 CAS 迁移自己的助手配置；正在执行的 Run 保持冻结配置。通用聊天桥不会自动改动其他宿主的旧会话，新模型需要宿主显式更新 Session 配置。

语音识别不是聊天模型的 `thinking` 或 `images` 能力。后续需要独立配置 ASR 服务及宿主授权，再实现录音、取消、转写错误和文本插入；转写结果先进入草稿，用户确认后再发送。当前没有可开启的语音配置。

## 验证

`pnpm verify:composer` 以确定性模型经过真实 Engine、HTTP 桥和 Chromium 验证选定模型/Skill 确实进入请求，并覆盖原生撤销/重做、选区、自动高度/展开、中文组合输入、两种快捷键、历史找回、运行中的下一条草稿、刷新、隐藏未接入语音入口和 1440/1024/390/320px 布局及销毁。

`tests/contract/chat-core.test.ts` 验证丢失受理结果后的选择冻结、刷新不覆盖草稿、图片能力与非法选择；`tests/integration/chat-server.test.ts` 验证真实 HTTP 目录脱敏、实际选择、幂等、撤销选项和注入拒绝。它们不替代 iOS 真机输入法/软键盘或真实语音验证。

2026-09-12 实际结果：`pnpm check` 32 文件 / 153 项通过（包含真实 PostgreSQL，0 跳过）；文档站 25 篇 / 33 组、聊天 20 组、图片与处理过程回归、输入编辑专项均通过。新增授权 GET 验证：空闲旧会话更新模型目录时不调用模型，原两轮历史保留。独立安装包的声明、Node 导入、浏览器构建和浏览器隔离通过，三个导出示例已更新本地包。

4320 真实文档站使用已授权 DeepSeek 普通 Profile（由默认视觉项手动切换）完成一轮问答：1 次模型请求、1527 Token，刷新恢复选择，浏览器错误 0。此次没有对所有 Profile 做真实模型矩阵；思考标签依据实际服务端配置。最初原生撤销测试把浏览器的单次撤销误认为整段撤销，已改为验证内容回退和 redo；旧聊天回归紧跟 compositionend 发快捷键触发新保护窗口，已明确验证该窗口不发送、结束后正常发送。

独立界面复核对移动名称截断提出 F1；缩减内边距并设置最小宽度、允许换行后，320/390px 完整显示普通名称。复核 F1: resolved，disposition: ship，结论仅覆盖该修复。最终四视图截图和一次 detector 输出位于忽略目录；唯一 detector 提示为既有中性色 Markdown 引用边线，非本次输入组件。未宣称线上 WorkBuddy 全功能或 iOS 真机已验证。
