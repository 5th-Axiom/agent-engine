按公开符号查询；第一次接入先选[完整路径](/docs/integration/)。配置对象是可序列化契约，执行函数和密钥解析只放在宿主 Engine 中。

## defineSessionConfig 与 parseConfig

```ts
import { defineSessionConfig, parseConfig } from "@agent-runtime/sdk";
const config = defineSessionConfig({
  models: { primary: {
    provider: "openai-compatible", baseURL: "https://your-model.example/v1",
    apiKey: { secretRef: "MODEL_API_KEY" }, model: "your-model",
    limits: { contextWindowTokens: 32000, maxOutputTokens: 1024 },
  } },
  routing: { primary: "primary" },
});
```

| 符号 | 输入 | 返回与约定 |
| --- | --- | --- |
| defineSessionConfig | SessionConfigInput | 归一化的 SessionAgentConfig；支持省略默认字段，提供编辑器提示 |
| parseConfig | unknown | 读取外部 JSON 后做相同验证；非法输入抛 CONFIG_INVALID |
| defineTool / defineSkill / defineKnowledgeBase | ToolInput / SkillInput / KnowledgeBaseInput | 已验证的可序列化定义 |
| parseOutput | unknown | OutputConfig；默认 mode 为 provider-native |

Schema 字段接受 JSON Schema 或能无损转为 JSON Schema 的结构化 Zod。自定义 refinements、transforms、函数和类实例不能存入配置。CONFIG_INVALID 返回字段路径和问题类别，不回显传入值。models 和 routing.primary 必须提供，默认 tools / skills / knowledgeBases / memory.stores 为空。能力数组替换，不合并。

`memory.stores[].read.enabled` 可选，省略表示允许读取；false 同时禁止自动及显式读取，写入独立控制。`read.strategy: "none"` 仅禁自动读取。`tools[].permission: "deny"` 同时从模型能力目录中移除，分发前拒绝，不执行该工具的权限 Binding 或返回旧成功回执。

## createAgentEngine

输入 EngineOptions，返回 Promise<AgentEngine>。先显式迁移 Store；同一数据库只有一个管理实例，启动时恢复未完成 Run。

| 字段 | 必需 | 含义与默认行为 |
| --- | --- | --- |
| store | 是 | EngineStore；生产使用 PostgresStore |
| principal | 是 | 已验证的 {tenantId, subjectId}，不能来自模型或未验证请求体 |
| secrets.resolve(ref, principal) | 是 | 异步返回凭据字符串，允许按主体分区；不将值写进配置 |
| authorize(request) | 多用户时必须 | 异步 boolean；false 拒绝；精确契约见下节 |
| bindings | 否 | BindingContract 注册表；注册不自动向 Session 开放 |
| protocolKey | 图片或持久原生续接时必须 | {secretRef}，稳定加密密钥；更换会影响已保存内容 |
| imageStorage | 否 | ImageStorage；默认加密内容存入 EngineStore |
| adapters.models | 否 | 自定义 ModelAdapter；内置两种兼容协议 |
| policy.allowedOrigins | 否 | 精确 HTTP(S) origins；未声明目标不能访问 |
| policy.allowedModelTargets | 否 | {provider, origin, credentialScopes}[]，绑定模型协议、目标和凭据 |
| policy.allowPrivateOrigins | 否 | 明确允许的私网 origins，还必须满足目标授权 |
| policy.allowedExecutorTypes | 否 | binding / http / mcp 的宿主允许范围 |
| defaults / policy.ceilings | 否 | Engine 默认值 / 宿主硬上限；不能由 Session 放宽 |

主要错误：CONFIG_INVALID、CONFIG_POLICY_VIOLATION、ACCESS_DENIED、ENGINE_BUSY、STORE_UNAVAILABLE。引擎启动错误不应将内部异常或凭据转发到浏览器。

自定义 Store 的 `StoreTransaction` 可选实现 `listBySession<T>(table, sessionId)`，返回该表中 sessionId 完全匹配的记录，以优化会话回读；未实现时 Engine 使用原有 list 后过滤。该方法不代替任何身份、来源或保留检查。PostgresStore 已内置参数化查询和幂等索引迁移。

## authorize

`authorize(request: AuthorizationRequest): Promise<boolean>`。每次请求带可信 principal、action、resource；sideEffect 与 data 按调用点可选。当前 sessionId 字段不保证填充，不应依赖它识别能力或数据范围。需要特定业务权限时通过 resource / data 与你的权限服务判断。

| action | resource 的形式 | 调用时机与语义 |
| --- | --- | --- |
| session | list 或 Session UUID | 列表、读取、快照、事件和操作前；Engine 另做 tenant + subject 的归属检查 |
| config | session | 创建或替换配置时检查是否允许配置会话 |
| model | 模型 baseURL | 校验配置和每次发送前，包含重试和摘要 |
| secret | secretRef | 配置检查与每次解析凭据前；也包括 protocolKey |
| capability | 工具名、Binding key、knowledge:ID、memory:ID，或 engine.* 控制名 | 配置校验、向模型提供契约、执行、读取历史上下文；不能只识别工具名称而漏掉 Binding key |
| data | Session UUID、operation:ID、usage:SESSION、knowledge:ID、memory:ID、tool:NAME | 读取、发送历史、用量或复用回执时 |
| data | knowledge:ID/编码后的chunkId、memory:ID/编码后的itemId | 逐条检索或记忆授权；data 带候选元数据 |
| data | image:upload、image:UUID | 上传为 write；读取/发送前为 read；删除为 write；Engine 另检查附件所属主体 |
| resolve | 待答请求 ID 或 Operation ID | 审批、核验和提交执行结果证据前 |

返回 true 仅代表宿主允许本次检查，不覆盖 Engine 的能力白名单、网络目标、写风险、数据所属关系或有效期。授权会重复调用，函数应可重入且不产生业务副作用。不要用 metadata、context 内的任意字段代替 principal。

完整本地登录实现包含在 fullstack 示例 server.ts。该示例只允许固定 demo 身份；生产宿主应按上表接入自己的权限服务，未知资源默认拒绝。

## defineBoundTool

```ts
const inventory = defineBoundTool({
  name: "inventory.read", description: "查询库存", version: "1", sideEffect: "read",
  inputSchema: z.strictObject({ sku: z.string() }),
  outputSchema: z.strictObject({ available: z.number().int().nonnegative() }),
  execute: async ({ sku }, context) => business.readInventory(sku, context.principal),
});
// Engine: bindings: inventory.bindings
// Session: tools: [inventory.definition]
```

以上 business 是宿主服务；无占位函数的完整脚本见[业务工具场景](/docs/tools/)。

返回 `{definition: ToolDefinition, bindings: Record<string, BindingContract>}`。inputSchema / outputSchema 使用结构化 Zod；execute 的输入与返回类型由它们推导。bindingKey 默认等于 name，timeoutMs、permission、idempotency、reconciliation 可选。version 必须随执行契约变更维护。写工具仍要求可信幂等 namespace / businessKey 与实际业务幂等实现。

BindingContext 包含 principal、runId、context、signal、operationId、idempotencyKey。context 是宿主输入，默认不进模型上下文；idempotencyKey 不能由模型自行决定。执行输出继续经过 outputSchema 校验。

## Engine 方法

本站文档助手另装配了只读工具 `sessions.search({query?, after?, limit?})` 和 `sessions.read({sessionId, cursor?})`，通过可信主体作用域的 SDK API 读取其他聊天。这是宿主工具名称，不是 AgentEngine 的新方法，也不受 Memory 偏好开关控制；分页与访问范围见[会话内容读取](/docs/memory/)。

| 方法 | 输入 | 返回与行为 |
| --- | --- | --- |
| createSession | {config, requestId?, metadata?} | Promise<AgentSession>；不调用模型；同主体 requestId + 配置重复创建复用会话 |
| loadSession | id: string | Promise<AgentSession>；按主体和保留期限读取 |
| forPrincipal | VerifiedPrincipal | 同步返回轻量作用域 Engine；不额外创建数据库连接，要求 authorize |
| listSessions | {limit?, after?}，可省略 | 最近会话摘要数组；limit 1–500 默认 500；after 为上一页最后一个 ID |
| readSession / readRun | sessionId；或 sessionId, runId | 完整服务端记录，仅适合受控宿主；不要原样送到浏览器 |
| inspectSession | sessionId | 只读运行、操作与用量视图；run 按受理序号排序 |
| deleteSession | sessionId | 删除会话及对应业务内容；最小用量账本按约定保留 |
| close | 无 | Promise<void>；关闭管理实例资源；不能对 forPrincipal 返回的作用域调用 |

createSession metadata 与配置内 metadata 不是权限输入。SESSION_REQUEST_CONFLICT 表示同一创建请求 ID 对应不同配置。ENGINE_BUSY 可能是重复管理实例或受理容量已满。

## Session.run 与 startRun

两者接受 RunInput：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| input | 必需 | 文本或 JsonValue；普通对象按 JSON 提供给模型 |
| skill | 无 | 首次模型请求前激活已声明的 Skill；未知 ID 报 CAPABILITY_NOT_FOUND |
| attachments | [] | ImageAttachment[]；可以与文本同时提供，最多 8 张 |
| requestId | 自动生成 | 同一条消息重试使用同一个 ID；新消息使用新 ID |
| ifConfigVersion | 无 | 指定本条消息期望的 Session 配置版本 |
| context | {} | 宿主业务上下文；提供给 Binding，不自动加入提示 |
| metadata | {} | 关联元数据，不参与输入幂等判等和授权 |
| output | 无 | {schema, mode?, maxRepairAttempts?}，约束结构化结果 |
| overrides | 无 | 已声明 model、已声明 tools 子集、收紧 loop；不能新增能力 |

run 返回 `Promise<{runId, outputText, output, citations}>`。startRun 返回 `Promise<{runId, result, cancel}>`；result 等待最终结果，cancel() 请求停止。等待审批或未知工具结果时，result 保持待定。

同一 Session 只有一个非终态 Run。重复 requestId 先查原请求，相同 input / skill / attachments / context / output / overrides / ifConfigVersion 复用它；不同返回 RUN_REQUEST_CONFLICT。SESSION_BUSY 不能靠换 requestId 绕过。接受时冻结配置、依赖、图片内容摘要，重试沿用同一份事实和总预算。

## 会话管理与进度

| 方法 | 输入 | 返回与行为 |
| --- | --- | --- |
| getRun | runId | 快照：runId/state/pending/result/error/drafts/snapshotSequence 等 |
| getSnapshot | 无 | Session 和当前活跃 Run 快照；断线后从 snapshotSequence 续读 |
| getConfig | 无 | {version, value}，Session 声明配置 |
| getEffectiveConfig | {runId?} | 当前有效配置或冻结 Run 配置，以及版本、来源与依赖 |
| replaceConfig | {ifVersion, config} | {version, value}；CAS 替换，仅影响后续 Run |
| cancelRun | runId | 请求取消，不能撤销已发生的外部写入 |
| archive / unarchive | 无 | 控制是否允许新 Run，保留历史 |
| listEvents | {afterSequence?, throughSequence?, limit?} | {events, highWaterMark, hasMore}；分页固定 highWaterMark |
| subscribe | {afterSequence?, onEvent, maxBuffer?} | {closed, close}；closed 给出关闭原因和最后序号 |
| onEvent | callback | 实时通知；返回退订函数，不代替持久事件消费 |

游标过期报 EVENT_CURSOR_EXPIRED；消费者滞后报 SUBSCRIPTION_LAGGED。草稿按 Attempt 隔离，撤销后不能拼进下一次尝试的正文。

## 图片 API

| 符号 | 输入 | 返回 / 错误 |
| --- | --- | --- |
| engine.uploadImage | {data: Uint8Array, mediaType, filename?, expiresAt?} | Promise<ImageAttachment>；默认 30 天，最多 365 天；IMAGE_INVALID |
| imageAttachment | attachmentId: UUID | {type: "image", attachmentId}，用于已有附件引用 |
| engine.readImage | attachmentId | {data: Buffer, mediaType, filename, expiresAt, sha256}；授权读取 |
| engine.deleteImage | attachmentId | 删除内容，后续引用无法再读取 |
| ImageStorage | version, put(id, encrypted), get(id), remove(id) | 宿主可选的加密对象存储契约；同一 ID 内容不可变 |

模型需要 capabilities.images=true、适配器 images 能力及 limits.maxImageInputTokens。每张图片按该上限预留输入预算，实际 Usage 仍以 Provider 为准。不支持时报 MODEL_CAPABILITY_MISMATCH，缺少预算上限报 BUDGET_UNVERIFIABLE。IMAGE_EXPIRED 与 IMAGE_UNAVAILABLE 分别表示到期和内容缺失/变化。

工具结果可嵌套 ImageAttachment；Engine 保留业务 JSON，附带相同图片供模型读取。原始字节不进入事件或普通 ChatRun；发送前才解密，按摘要确认冻结内容。

## 审批与结果核验

从 getRun(runId).pending 取得问题或审批 ID。`resolveInput(id, value)` 处理当前待答契约；权限回答形如 `{kind:'permission', decision:'allow_once'}`，不是全局放行。`reconcileOperation(operationId)` 做受授权的只读核验；`resolveOperationOutcome(id,{outcome,evidenceRef,receipt?})` 提交成功、失败或确定未执行的证据。未知写结果保持 awaiting_tool_resolution，不能自动重跑。

## 用量与 Debug

`engine.usage.getRun(runId)` / `getSession(sessionId)` 返回每次尝试最新用量汇总。展示 knownTotals 时同时展示 complete 和 costComplete，未知值不是 0，费用为估算。重试、摘要、修复与迟到统计都进入同一账本。

`startDebugServer({engine, auth:{type:'token',secretRef}, host?, port?, basePath?, backLink?})` 返回独立 HTTP 服务的 url / close。Token 至少 16 字符。basePath 不会自动在已有业务服务中挂载路由；浏览器 Basic 认证与服务端 Bearer 均支持，只接受 GET。完整启动与关闭见 [Debug 场景](/docs/debug/)。

## 浏览器和聊天服务

| 符号 | 输入 / 结果 | 约定 |
| --- | --- | --- |
| createChatHandler | {namespace, allowedOrigins, resolveContext, basePath?, images?, allowCredentials?} | Node handler(req,res) 返回 Promise<boolean>；不匹配路径返回 false |
| resolveContext | IncomingMessage → {engine, assistants, defaultAssistant?} | 每个请求验证登录，engine 已按用户作用域隔离；不能从请求体取 principal |
| createHttpChatTransport | {baseURL, headers?, credentials?, allowCrossOrigin?, timeoutMs?, fetch?} | ChatTransport；超时默认 15000ms，范围 1–120000 |
| ChatTransport | getConfig/listSessions/readSession/createSession/sendMessage/cancelRun | uploadImage/readImage 可选，旧文本 Transport 仍可用 |
| ChatController | transport, {memory?, historyMemory?, assistantId?, activePollMs?, idlePollMs?} | 订阅状态、send/retrySend/cancel/selectSession/newSession/dispose |
| addImages / retryImage / removeImage | File[] / 本地草稿图片 ID | 维护上传、错误与稳定引用；失败不会静默丢图发送 |
| mountChatWidget | options | 悬浮窗口，返回 controller/open/close/destroy/updateTheme 等 |
| mountChatPage | target: HTMLElement, options | 嵌入页面，返回 controller/ready/destroy/updateTheme 等 |
| mountChatSettingsPage | target, { transport, sessionId, theme?, helpLinks?, styleNonce? } | 独立配置网页；容器需明确高度；返回 ready/updateTheme/destroy |
| createSessionMemory | Storage, accountScope | 可选缓存会话 ID；按已验证账号隔离，不保存正文或凭据 |
| createSessionListMemory | Storage, accountScope | 显式配置 historyMemory；5 分钟 / 最多 100 条摘要，后台校验，401/403 和 clearSession 清理 |

现成 Chat UI 支持安全 Markdown、代码复制、图片和引用；原始 HTML 不执行，回答中的任意图片 URL 不自动加载。getRunSources 由宿主把公开引用转换为 HTTP(S) 链接。

images=true 开启 /images 上传和读取接口，需要 Engine protocolKey。所有写请求继续要求允许的 Origin 和 x-agent-chat:1。上传最大 5 MiB（传输为受限 JSON base64）；ChatRun 只含附件引用。Controller 销毁/切换会话时终止上传并释放预览 URL，已受理的服务端 Run 不因此被撤销。

## 聊天过程相关公开接口

| 符号 | 输入 / 字段 | 行为 |
| --- | --- | --- |
| ChatRun.process | entries、complete、observedAt、activeMs、可选 pending / thinkingDisplay | 有序公开过程；字段可选，兼容旧服务 |
| ChatRun.reply | 可选 `{ id, sequence }` | 当前草稿／最终正文的稳定展示身份及首个文本事件顺序；与已提交阶段正文衔接，旧服务可省略 |
| ChatProcessEntry / processEntrySchema | id、sequence、kind、label、state、startedAt / endedAt、可选 input / output | 输入摘要最多 2000 字符、输出最多 8000；不包含原始私有事件 |
| ChatAssistantDefinition.describeProcess | {name, input?, output?} → {input?, output?} 或 undefined | 服务端显式挑选可公开查询/结果；抛错时省略，不改变执行 |
| createRunProcess | chat-ui/components 导出；update(ChatRun)、destroy() | 可独立组合的过程组件；整个聊天页自动接入 |
| ModelStreamEvent.activity.kind | 可选 thinking / tool-call | 自定义适配器报告真实阶段；旧无 kind 活动仍兼容 |
| engine.inspectSession().observedAt | Engine 时钟的毫秒值 | 读取过程时计算活动耗时，兼容确定性时钟 |

过程类型含 model、thinking、tool、skill、knowledge、memory、context、retry、waiting、warning、message、run；状态为 running、completed、failed、waiting、cancelled。历史有界，complete 为 false 时应显示缺失提示。usage.costs 按币种提供 amount 与 complete，仅代表估算费用。完整使用步骤见[进度、用量与取消](/docs/events/)。

## 输入编辑与模型选择

| API | 用途 | 默认与边界 |
| --- | --- | --- |
| ChatModel / chatModelSchema | id、label、supportsImages、thinking | 公开目录不包含模型地址或凭据 |
| ChatSkill / chatSkillSchema | id、label | 指令、工具子集留在服务器 |
| ChatAssistant / ChatSession.models、defaultModelId、skills | 输入工具栏目录 | 可选字段；旧服务缺失时隐藏选择器；会话取保存配置与当前可用 ID 的交集 |
| ChatAssistantDefinition.modelDisplay | 按模型 ID 覆盖公开 label | 服务端配置 |
| sendMessage.modelId / skillId | 选择本轮模型和显式 Skill | 可选；映射 RunInput.overrides.model / skill，参与幂等 |
| ChatRun.modelId / skillId | 已受理轮次的选择 | 自动 Skill 选择见 process |
| controller.setModel(id) / setSkill(id?) | 更新下一条草稿选项 | 不改当前 Run；发送结果未明时禁止修改；有图片不能切纯文本模型 |
| composerCatalog(state) / selectedChatModel(state) | 自定义界面读取目录与选项 | 由 chat-core 导出 |
| mountChatPage / mountChatWidget 的 sendShortcut | enter 或 mod-enter | 缺省 mod-enter；文档站使用 enter |
| createComposer.destroy() | 清理输入组件资源 | 独立使用组件时在卸载调用；页面/浮窗已代办 |

选择器会显示实际配置的模型；声明 thinking.enabled 不代表供应商或适配器必然支持，仍须满足 Engine 能力验证。语音识别没有实现，麦克风保持禁用。具体使用见[定制聊天界面](/docs/frontend-customize/#编辑输入和选择模型)。


### 公开思考与回复流式展示

| 接口 | 字段 | 行为 |
| --- | --- | --- |
| ModelConfig.thinking.expose | none / summary / content | content 显式展示供应商返回的公开内容；summary 仅摘要 |
| ChatAssistantDefinition.thinkingDisplay | 可选 summary / content | 宿主默认关闭；只能收窄模型展示权限 |
| ChatAssistantDefinition.settings | 可选 boolean | 默认关闭；开放受限的会话配置 GET/POST |
| ChatPageOptions.settingsUrl | 可选同源网页地址 | IM 打开新标签页，附加 session 查询参数 |
| ChatController.ensureSession | 无参数 | 创建/返回空会话 ID，不发送消息；保留草稿 |
| ChatTransport.readSettings | sessionId, signal? | 读取 ChatSettings 安全目录、默认/当前偏好与版本 |
| ChatTransport.updateSettings | sessionId, { ifVersion, preferences }, signal? | 保存 ChatPreferences，版本冲突不覆盖，影响后续 Run |
| restoreChatPreferences | nextHostConfig, previousSessionConfig | 宿主迁移配置时保留用户限制；chat-server 导出 |
| ModelStreamEvent.delta.thinkingFormat | 可选 summary / content | 未标注沿用 summary；标准协议公开正文标注 content |
| content.thinking.delta.data.format | 可选 summary / content | 与 content.output.delta 分离，原生签名不进入事件 |
| createMessage | MessageViewData.streaming?、destroy() | 低层组件可选择流式缓冲；卸载时清理监听器和动画 |

Engine 的 thinkingDisplayRetention 为 none 时不记录展示正文；具体三处配置及普通模型限制见[展示思考内容](/docs/events/#显示模型返回的思考内容)。

## Pending 回复与能力工作台

`ChatTransport.resolveInput`、`ChatController.resolveInput`、`ChatInputResolution` 负责继续等待用户的 Run；服务端 `interaction: true` 是显式开关，前端不能自行提高权限。`createPendingInput` 可用于自定义时间线，标准聊天页已自动接入。完整场景见[文档站接入](/docs/docs-site/)。

[能力工作台](/ai/capabilities/)中的 `/api/docs-capabilities/*` 是文档示例宿主接口，不属于通用 SDK 的稳定 HTTP 协议。它组合 SDK 的配置、调试、事件和生命周期 API，避免把示例站点路由当成业务 SDK 必选依赖。
