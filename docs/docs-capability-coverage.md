# 文档站 SDK 能力接入与验证

本轮将文档站从资料问答示例扩展为 SDK 的实际接入宿主。标准启动器仍使用授权模型和独立 PostgreSQL；新增能力通过真实 Engine、会话配置、权限与事件管线执行。

## 使用入口

运行 `pnpm docs` 后打开 `http://127.0.0.1:4320/ai/`。

- IM 输入框支持选择「接入指南」「问题排查」Skill；过程记录展示实际加载与能力调用。
- IM 右上角「配置」管理工具、Skill、知识库、记忆读写、模型、公开思考和上下文整理。
- 「能力与记忆」进入 `/ai/capabilities/`，包含能力目录、长期记忆管理、配置实验、会话调试。
- 原有会话如果保存过能力选择，新增能力默认关闭以保留其限制。点击「恢复助手默认」后保存，或逐项启用；新建会话采用完整助手默认配置。已受理 Run 的冻结配置不变。

## 已接入能力

| SDK 能力 | 实际接入位置 | 验证依据 |
| --- | --- | --- |
| 图文、多模型、公开思考、历史与取消 | 原有 IM、输入工具栏与过程记录 | 既有图文/模型/过程契约回归；本轮没有伪造供应商思考内容 |
| Binding 工具 | 6 个公开文档/API/源码工具 | 原有行为回归与真实模型资料查询 |
| 跨会话聊天读取 | sessions.search / sessions.read，标准目录现在共 10 个工具 | 本人会话关键词查找、分页原文、来源撤权/删除继承及 PostgreSQL 故障恢复；见 [历史会话工具](session-history-tools.md) |
| HTTP、Streamable HTTP MCP | 本地公共资料服务，新增目录与检索两个工具 | 真实 HTTP/MCP 初始化、工具 Schema 与执行；授权模型 Smoke |
| inline / loader Skill | integration-guide 与 troubleshoot | 首请求前加载；loader 版本和内容哈希；配置禁用；两个 Skill 均经授权模型运行 |
| KnowledgeBase | manual 手册检索器、来源 ID、知识库开关 | 真实文档检索；严格引用校验另由配置实验验证 |
| 长期记忆 | preferences，按可信浏览器身份隔离 | 自动/显式读取、独立读写开关、审批写入、CAS、幂等、加密、到期和删除 |
| 问题、结构化表单、审批 | IM 原生输入控件，resolveInput 继续原 Run | 真实 Engine/HTTP、Schema 拒绝、重复回复幂等、其他身份拒绝、轮询保留草稿 |
| 配置合并、版本、冻结 | 配置页面、调试快照、配置实验 | CAS 冲突、历史 Run 配置不变、新 Run 使用新配置；宿主能力上限仍有效 |
| 结构化输出、引用修复 | prompt-json / provider-native / citation 实验 | 开关正反路径、实际 Schema、修复请求与来源校验 |
| 模型重试、Fallback | 配置实验 | 真实 Attempt / 路由事件；禁止条件下不发生目标动作 |
| 工具输入修复、只读重试 | 配置实验 | 记录实际业务调用次数与修复后的入参 |
| 写入结果未知、核验 | 写操作实验；真实记忆写入有 reconciliation Binding | 模拟已写入但响应丢失，核验回执后继续，业务写入只调用一次 |
| Token 预算、上下文整理 | 配置实验；主助手有执行与输出限制 | 请求前预算拦截、摘要调用、原始历史保留；超时/取消由既有契约与故障回归覆盖 |
| 事件游标、订阅、Usage | 实验与真实会话调试 | 分页有序/无重复、onEvent 与从游标 subscribe、实际 Usage |
| Trace / Log / Metrics | 可观测性实验 | SDK 真实导出器与 Prometheus 指标；不以自制计数冒充 SDK 输出 |
| Session 归档/删除 | 会话调试与生命周期实验 | 归档后禁止新 Run、解除后继续、删除后拒绝读取；活动会话需先停止/完成 |
| PostgreSQL 恢复、依赖版本、崩溃窗口 | 主助手持久宿主 + 独立自动验收 | 本轮新增记忆审批中重启、恢复确认与跨会话读取；既有 SIGKILL/HTTP 写入及恢复测试回归 |
| 主题、页面、浮窗、组件复用 | 文档 AI/传统模式、配置页、工作台、pending 组件 | 桌面/手机/深色主题、浏览器交互与包消费检查 |

交互实验共有 13 类、21 条开关组合路径。每次创建独立 Engine + MemoryStore，模型和数据来自 Testing 包的确定性脚本。实验不调用供应商，也不写入主助手的会话或记忆；只把实验报告保存到宿主 Store，当前身份保留最近 20 条。恢复与供应商能力不是由这些内存实验推断出来的。

## 实现与 API 变化

新增文档宿主模块：

- `examples/docs-site/capabilities.ts`：Skill、知识库、审批策略、记忆适配器、加密与版本控制。
- `session-history.ts`：当前访客的其他会话搜索/读取、Operation 来源关系与事务内只读授权；不依赖长期记忆开关。
- `remote-capabilities.ts`：只绑定 loopback 的公开文档 HTTP/MCP 服务，默认 4321。SDK 执行器和远端契约均实际启用。
- `experiments.ts`：13 类有界配置实验。检查结果来自真实 Run、执行次数、事件与快照。
- `capabilities-handler.ts`、`capabilities-page.js`、`capabilities.css`：工作台 API、身份隔离、实验报告、记忆与会话管理。

通用聊天包新增兼容性扩展：

| API | 行为 |
| --- | --- |
| `ChatAssistantDefinition.interaction?: boolean` | 宿主显式开放 pending 回复；默认沿用旧展示方式 |
| `describePending({kind,question,input})` | 宿主仅返回可公开的 question/details；原始参数不自动发送给浏览器 |
| `ChatRun.process.pending.id/schema/details` | opt-in 下投影可响应的请求与安全表单 Schema |
| `ChatInputResolution` / `resolveChatInputSchema` | question、structured_input、permission 三类严格回复格式 |
| `ChatTransport.resolveInput` / `ChatController.resolveInput` | HTTP 提交后读取真实状态；相同 pending ID 的相同回复幂等 |
| `POST /api/agent-chat/sessions/:id/input` | 经身份、同源和配置检查后调用 SDK Session.resolveInput |
| `createPendingInput` | 可独立复用的输入组件；简单 Schema 用原生控件，复杂 Schema 提供 JSON 输入 |

没有重写 Engine 执行循环，也没有复制 WorkBuddy 重建代码、提示词或数据。上一轮新增的 `read.enabled`、settings API 与静态工具 deny 行为保持兼容，详见 [IM 会话配置](chat-settings.md)。本轮对审批预览按当前执行游标定位，批量提出多条写入时不会展示另一条的内容。

## 检查配置时发现的细节

1. 之前缺少 Skill 与长期记忆是文档宿主未装配，底层 SDK 已有对应执行契约。现在配置页展示的是真实可执行目录。
2. 原先 Chat 只展示 awaiting_input，不能提交。新增通用 transport/Controller/原生表单闭环，自定义宿主也能复用。
3. `read.strategy: none` 只关闭自动读；完整关闭用 `read.enabled: false`。关闭读取不会抹去已经进入历史的信息，写入开关也独立。
4. Fallback 受模型尝试额度约束。实验显式配置一次额外尝试并设 `retryOn: []`，避免把同一主模型的重试误当作备用模型接管。
5. Run 的输出修复上限不能高于 Session 配置。实验同时声明 Session 上限与本轮修复次数，保留原有宿主限制。
6. 删除记忆需要保留无内容的版本标记，防止「删除—同名重建」后旧页面持旧版本误删新内容。内容删除与历史对话删除分别管理。
7. 401 清空身份数据、操作状态并使旧响应失效；403 清理被拒记录并刷新有效列表。删除/取消/归档后恢复键盘焦点。
8. PostgreSQL 的记忆清理事务必须在 Engine 获取 fencing 锁后启动。实际启动器复验发现并修正了初始化顺序；退出时停止定时清理并关闭 HTTP 长连接，随后释放 Engine。

## 记忆与运行边界

标准宿主按签名 Cookie 的可信主体隔离记忆，以稳定协议密钥派生 AES-GCM 密钥。默认保留 30 天，过期即拒绝读取，启动和每分钟清除过期密文；保留无内容版本标记与幂等回执。示例按最近更新选取最多 5 条偏好，没有接入向量检索。邮箱/手机号过滤是基本模式，不能冒充完备 PII 服务。

主助手支持自由文本 Markdown，因此知识引用不强制结构化；引用实验另行验证严格 citations。HTTP/MCP 为真实本地公共资料服务，不代表某个外部厂商的 MCP 已验收。

浏览器不编辑密钥、模型地址、身份、绑定实现或宿主安全上限。文档站是本地接入示例，匿名身份不跨浏览器设备。ASR 尚未实现所以麦克风保持禁用；CLI、压缩包、安装包保留产品形态空位；M4/M5 的分布式调度、真实 replay 与监控产品未扩入。

## 验证记录

- 全量：`pnpm exec vitest run --exclude '.local/**'`，38 文件 / 192 项通过，含真实 PostgreSQL、过期清理与故障恢复。显式排除其他并行任务留在忽略目录的验证副本，避免重复计算；类型检查和构建通过。
- 能力集成：身份/Origin、Schema、权限、审批、CAS、批量预览、ABA 删除、加密、过期、Skill、知识库、真实 HTTP/MCP、实验幂等与 Debug 隔离。
- PostgreSQL：审批等待中关闭并重启 Engine，恢复同一 pending 后才写入，新 Session 能读取已确认的记忆。4320 实际启动器重启后，真实模型此前保存的记忆仍可回读；此阶段没有新增模型请求。
- 真实模型：4 个 Run 全部完成，验证批准记忆写入、新 Session 回忆、KnowledgeBase + HTTP + MCP、loader 与 inline Skill；供应商价格/费用准确性不在本次声明中。
- 浏览器：`pnpm verify:docs-capabilities` 的真实 Engine/HTTP 与合成模型覆盖记忆审批/删除、追问/表单提交、配置开关、实验正反路径、Debug、桌面/手机/深色；另测 401/403、延迟旧响应及焦点返回。12 张有效截图，浏览器错误 0；原有 25 篇 / 33 组文档回归和独立包声明、Node/浏览器消费通过。
- 独立界面终审：身份清理、焦点返回和产品/设计同步三项均 resolved，disposition: ship；结论仅覆盖这三项修复，没有扩大成整个界面或供应商认证。
- 精确命令、最新状态与终审记录见 [验收行为卡](../examples/docs-site/ACCEPTANCE.md)。私有本地诊断与截图位于 ignored 目录，不纳入发布内容。
