# SDK 使用约定

[返回文档导航](README.md) · [先跑通第一段代码](sdk-quickstart.md)

本文供接入和维护 SDK 时查询精确规则。第一次使用请先看 [SDK 入门教程](sdk-quickstart.md)，只操作网页请看[测试页面手册](local-playground.md)。本文描述当前已实现的公开接口；验证证据与支持边界见[实施记录](implementation-status.md)。目标设计仍以[技术设计](technical-design.md)为准。

## Engine 与 Session

生产宿主创建 `PostgresStore.fromConnectionString(databaseUrl)`，在没有运行中 Engine 时显式执行 `store.migrate()`，再调用 `createAgentEngine({ store, principal, secrets, policy, ... })`。同一数据库只允许一个管理实例。网络请求不占用状态事务。

`principal` 来自宿主已验证身份；`secrets.resolve(ref, principal)` 从宿主管理的凭据源读取值。`policy.allowedOrigins` 是精确的 HTTP(S) origin 列表，默认不允许外部目标。私网开发服务还须显式列入 `allowPrivateOrigins`。`allowedModelTargets: [{provider,origin,credentialScopes}]` 可进一步绑定协议、端点与 Secret 引用；`allowedExecutorTypes` 限制执行器种类。配置不能携带明文 Token。跨身份作用域通过 `engine.forPrincipal()` 创建，必须提供宿主 `authorize`。

Session 模型声明示例（占位值须由宿主替换）：

```ts
const config = {
  models: {
    primary: {
      provider: "openai-compatible",
      baseURL: "https://your-model.example/v1",
      apiKey: { secretRef: "MODEL_API_KEY" },
      model: "your-model",
      limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
    },
  },
  routing: { primary: "primary" },
};
const session = await engine.createSession({ config, requestId: "create-1" });
const handle = await session.startRun({ requestId: "run-1", input: "你好" });
const result = await handle.result;
```

创建 Session 不发送模型请求。`session.run()` 是等待最终结果的便捷方法。暂停审批/问题/结果未知时 `result` 保持待定。`engine.close()` 关闭当前宿主资源并拒绝本地等待句柄，不假装已终结持久 Run；重启后按检查点恢复。

`getConfig()` 读取声明配置及版本；`getEffectiveConfig({runId})` 读取 Run 冻结配置；`replaceConfig({ifVersion,config})` 通过版本前提替换。能力列表替换而非合并。Run overrides 只支持已声明模型、工具子集和收紧后的 Loop 限额。有效视图带 `sources`、`defaultsVersion`、`policyVersion`；版本使用内容 Hash，来源区分 Session、Engine 默认、库默认和 Run 覆盖。Run 视图还带冻结依赖版本。

## 幂等、工具和审批

同一 Session 同一 `requestId` 重投相同输入/Context/输出契约/覆盖配置，会复用原 Run；不同内容返回 `RUN_REQUEST_CONFLICT`。关联 `metadata` 不参与业务授权或请求判等。

业务写操作的去重身份为 tenant + 可信 namespace + 宿主 business key，不依赖工具名称、版本、Session 或模型 Call ID。宿主 Binding 必须声明 `version`、`sideEffect` 和写 namespace。HTTP/MCP 还需 `remoteContracts` 声明可信风险与版本；远程写入必须配置幂等 header/argument，并返回确认执行的回执。

宿主 Policy Binding 返回 `allow/ask/deny`。Session 的 `deny` 和 `require-approval` 不会被 Policy 的 `allow` 扩大。等待时从 `getRun(runId).pending` 获取请求标识，再提交 `resolveInput(id,{kind:'permission',decision:'allow_once'})`。批准只绑定当前操作及参数。

执行成功和输出 Schema 有效是不同状态。成功但格式不合格的回执不会触发再次写入。外部写入结果未知时 Run 进入 `awaiting_tool_resolution`，必须通过只读 `reconcileOperation()` 或具备权限的 `resolveOperationOutcome()` 提交证据。取消请求不会把未知副作用伪装成未执行。

知识库 Retriever 返回 `{items:[{chunkId,content,...metadata}]}`，Engine 分配可引用 sourceId；必引知识源需在 Run 输出 Schema 的配置路径声明 `{sourceId:string}[]`。Memory Binding 使用带 Namespace 的读写 DTO、`expectedVersion` 和确认回执；原子 CAS、业务证据规则和敏感信息策略由宿主实现。读写共用一个 Memory Binding 时，宿主声明 `methods: {read: 'read', write: 'write'}` 和稳定写 namespace。自动与显式读取都应用逐条授权、有效期、去重、TopK 和 `read.maxTokens`；候选 DTO 至少含 id/content/version。Knowledge 的 `defaults.maxTokens` 默认 4000，按得分、去重、作用域及期限选择片段。

## 事件和用量

`session.onEvent()` 是有界实时提示。需要可靠恢复时使用 `listEvents({afterSequence,throughSequence,limit})` 和 `subscribe({afterSequence,onEvent,maxBuffer})`。分页补拉固定首屏 highWaterMark。消费者异常或滞后关闭自己的订阅，不改变 Run。

游标过期后先取 `getSnapshot()`，应用快照中的完整未提交 `drafts` 与状态，再从 `snapshotSequence` 补拉。草稿撤销/提交与状态事务一致；快照不依赖旧 delta 仍被保留。

`engine.usage.getRun(id)` / `getSession(id)` 返回每个 Attempt 最新 Usage 汇总。未知用量不等于零，Thinking 是输出子集，币种不相加。`complete` 与 `costComplete` 必须一并展示。本地配置费率计算的是估算，不是实际账单。迟到 Usage 修订原 Attempt；不会重新打开终态 Run。`usageSettlementMs` 默认 5000，收尾标记持久化并可重启补做；`usage.settled` 不保证所有字段完整。删除或内容到期后仍可经原主体授权查询最小用量账本。

重试使用持久请求快照、有限次数和同一总预算。Fallback 只在声明类别上发生，受同一尝试数限制；含原生续接或工具历史的跨模型切换被拒绝。当前各次请求快照保存在 Step 的 `attemptRequests`。

## 上下文、数据与维护

`context.toolResultMaxTokens` 是可选的工程裁剪授权，仅裁剪旧完整组的 Tool Result；原文及回执在有效期内保持不变。摘要分块和合并使用已声明模型及统一 Usage/预算。`Step.contextEstimate` 采用 UTF-8 字节保守上界，并列出消息、能力和输出预留；不是精确 Provider Tokenizer。

Policy 的 Prompt、Thinking、Tool Result、Knowledge、Memory 保留字段及候选 `authorize.data` 约定见 [ADR 0003](adr/0003-retention-and-maintenance.md)。首版按 Session 最早期限清除混合来源数据，禁止过期继续或公开读取正文；权限检查在每次模型发送、摘要合并和每条订阅回调前生效。

Policy、业务键、Skill Loader 和真正的业务执行均受能力额度/信号量约束。`limits.maxConcurrentMaintenanceRequests` 默认 4，`maxReconciliationsPerOperation` 默认 10；核验额度独立于 Run 预算。耗尽后仍可人工提交受权证据。

## 遥测

`telemetry.metrics.record`、`traces.export`、`logs.write` 接到宿主现有平台。Trace 提供 Run → Step → Attempt 关联及能力 Operation、起止时间、状态和稳定 ID。`prometheusExporter()` 的 `render()` 可由宿主 HTTP 服务提供给监控系统抓取；事件标签为固定集合。`agent_usage_*_tokens_net` 是按账本修订差值更新的进程期净值，可能减少，不能当单调 Counter 或精确账单。跨进程对账以 Usage Ledger 为准。

`pnpm verify:monitoring` 通过真实本地 HTTP 抓取指标、接收脱敏 Trace/日志，验证一次失败信号和成功 Run；示例接收端不等于完整告警产品或内置 OTel 服务。数据库失锁另走 `telemetry.health`，不依赖同库失败事件。

健康回调在启动及成功维护周期更新。Prometheus 适配器提供 `agent_store_health` 和 `agent_store_heartbeat_seconds`；外部平台应同时检查不健康、心跳过旧和抓取失败，不因上一次值为 1 就认定进程仍正常。

## 本地测试宿主与 Debug 挂载

`pnpm playground` 使用公开 SDK 和独立开发库提供可交互测试页，操作步骤见 [本地测试页面](local-playground.md)。它固定监听回环地址，浏览器只能选择宿主已授权的模型与只读工具，不能提交任意 Endpoint 或 Token。

`startDebugServer({engine,auth,host?,port?,basePath?,backLink?})` 可通过 `basePath: "/debug"` 挂在统一入口下，`backLink: {href: "/", label: "返回本地测试"}` 提供回链。两个新增选项都只接受本地路径；省略时保持原有根路径行为。`inspectSession().runs` 按持久受理序号 `acceptedSequence` 排序；旧开发记录优先从保留的 `run.queued` 事件恢复，无法恢复时该字段缺失，不以记录 UUID 作为时间顺序。Debug 仍要求 Token，拒绝非 GET 请求；本地测试宿主在受限回环代理中注入该内部凭据，不把它发给页面脚本。

## 验证命令

- `pnpm playground`：启动持续运行的本地测试页和只读 Debug。
- `pnpm verify:playground`：合成模型驱动真实浏览器交互及桌面/移动检查，完成后退出。
- `pnpm check`：类型、六包构建、所有契约/集成/恢复测试。
- `pnpm test:integration`：真实 PostgreSQL、标准协议 HTTP、远程 HTTP/MCP、恢复与 SIGKILL。
- `pnpm verify:debug`：需已安装 Playwright Chromium 的只读 Debug 桌面/移动布局检查。
- `pnpm smoke:provider [profile]`：从集中凭据文件解析 Secret，顺序检查基本响应/Usage、合成只读 Tool 往返，以及本地明确启用时的 Thinking 原生保护与续接；首次失败即停止。DeepSeek 两种兼容协议已实测通过。路径、权限与占位模板见 [本地模型配置](local-model-configuration.md)。

## 前端聊天 SDK

`chat-core` 提供受限聊天协议/状态控制器；`chat-ui` 提供四层组件、悬浮入口和嵌入页；`chat-server` 通过 Node HTTP 对接已验证用户的 Engine。浏览器传助手 ID、文本和可选的已授权图片引用，模型、凭据与工具授权留在服务器。完整安装、宿主鉴权、React/Vue、主题和生命周期示例见[前端 SDK 接入教程](frontend-sdk.md)，边界见 [ADR 0005](adr/0005-embeddable-chat-sdk.md) 和 [ADR 0006](adr/0006-scenario-usage-and-images.md)。


## 会话分页与审查修复后的配置边界

`engine.listSessions({ limit: 100, after })` 返回当前主体的会话，按创建时间从新到旧、同时间按 ID 排序。`limit` 为 1–500，默认 500；下一页把上一页最后一项的 `id` 作为 `after`，返回空数组即结束。游标必须属于当前主体且仍存在；不存在或已删除时从首页重新读取。返回项含 `id/version/archived/createdAt`，不含正文。IM 桥分页查找当前助手空间的最近 50 条，不会被其他助手空间占满第一页而遮蔽。

Engine 的预算硬上限在会话未填写预算时仍生效；有效配置将这类字段的来源标记为 `policy-ceiling`。显式超限或费用币种不一致会拒绝配置。Run 的 `overrides.tools` 同时与 Skill 的 `allowedTools` 取交集，空交集不能调用业务工具。

标准模型协议将未知能力和最多 256 个调用内的超限批次送入有界输入修复；业务上限仍是每批 16 个，超限批次零执行。256 是适配器的传输保护上限，达到更高索引时以 `MODEL_OUTPUT_LIMIT` 结束，不扩大业务能力额度。Thinking、签名与工具参数的有效数据片段可重置流空闲计时；纯心跳不重置，也不公开私有正文。

## 场景接入与图片扩展

本轮新增 defineBoundTool（同源工具定义/绑定与 Zod 类型推导）、SessionConfigInput 等作者类型，以及 uploadImage/readImage/deleteImage 和 RunInput.attachments。RunInput.skill 可在首次模型请求前显式选择已声明的 Skill。图片需 protocolKey、实际模型 capabilities.images=true 与 limits.maxImageInputTokens；现成 Chat UI 支持上传和安全 Markdown。普通快照只有附件引用，模型发送前读取已冻结内容并重新授权。完整约定见 [ADR 0006](adr/0006-scenario-usage-and-images.md)。

传统文档按环境、对话、图片、工具、Skill、知识、记忆、进度、Debug、登录与界面场景组织；精确符号参考在 examples/docs-site/content/api.md。pnpm example:export 导出可独立安装的后端、前端与全栈目录。所有包仍为本地开发版，CLI/公共 npm/压缩包/安装包形态待确定。
