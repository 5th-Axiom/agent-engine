# ADR 0003：保留期、派生数据与维护额度

状态：已实现，2026-09-11。补充技术设计 §5.13、§5.15、§5.18 的字段和首版执行粒度，不延长任何已声明保留期限。

## 保留策略

Engine Policy 支持 `promptRetention`（默认 `7d`）、`protocolPayloadRetention`（默认 `encrypted-7d` 或 `none`）、`thinkingDisplayRetention`（`none`/`session`）、`toolResultRetention`（期限或 `policy-based`）、`knowledgeRetention`、`memoryRetention`。期限单位为 `ms/s/m/h/d`，正整数，最长 3650 天。`policy-based` 和未另设的知识/记忆期限受 Prompt 期限约束；不会成为无限保留。

首版以 Session 为清理单元：创建时计算已声明数据类别的最早期限，后续配置或宿主策略只能缩短。选择这一保守粒度，是因为模型答案、原生载荷和摘要可能混合多个来源，首版不能可靠剥离单个来源的影响。较长策略不是保证最低保留时长；需要不同保留期的独立业务应使用不同 Session。资料自己的 `expiresAt` 也会使相关 Session 失效。普通权限撤销立即阻止再次披露，物理内容清理由保留策略负责；已撤权内容不能通过摘要重新进入模型。

查询和派发在期限边界即拒绝；启动与每秒维护事务清除 Prompt、结果、配置正文、请求/响应快照、原生载荷、来源、草稿与内容事件。复用 Operation 的其他 Session 递归失效。删除源 Session 也触发派生清理。过期后迟到的回调不能把内容重新写回。没有创建时间/期限的旧开发记录在启动时按已过期处理，不授予一个新的保留期。

只保留受控身份、Hash、状态、去重和 Usage 所需的最小记录。未确认写入保留 `outcome_unknown`，仍可提交人工证据；到期后的回执仅保留 Hash，不继续模型推理。相同业务键不会因原内容清除而再次派发。内容接口返回 `DATA_RETENTION_EXPIRED`；经过原主体和 `data: usage:<sessionId>` 授权的用量查询仍可读取最小账本，包括删除后的迟到修订。

这里的清除是 Engine Store 活跃逻辑记录和事件的删除/覆盖。已经交付给调用方的对象、宿主 Memory/Knowledge 服务、Provider、外部遥测、数据库 WAL/备份的生命周期由相应系统管理；本库不声称能撤回已发出的资料或物理擦除所有备份。

## 来源与候选检查

Memory 自动和显式读取共同验证 ID、版本、Namespace/主体标记、证据引用形状、过期时间、去重、TopK 和字节上界。Knowledge 按得分排序，检查主体标记/期限、去重并应用 `defaults.topK/maxTokens`（后者默认 4000）。只有实际进入 Observation 的片段获得可引用 sourceId。原始外部数据不成为系统指令。

宿主 `authorize` 在候选阶段收到 `action: data`、`resource: memory:<storeId>/<encoded-item-id>` 或 `knowledge:<kbId>/<encoded-chunk-id>`，以及只读的 `data` 候选对象，可检查敏感级别和业务规则。被拒候选不注入。发送、重试、摘要合并、快照和逐条事件交付继续检查资料及其保留的来源元数据。重复检查不包含被移除的正文；需要内容级判定的宿主应以版本/Hash 保存其判定依据，未知情况拒绝授权。

## 维护和幂等结算

`usageSettlementMs` 默认 5000，允许 0–60000。收尾期限与完成标记持久化；重启补做，到期只发一次 `usage.settled`。每秒维护轮询可能引入最多约一轮的正常延迟；它不是“用量一定完整”的承诺。

`loop.maxCapabilityInvocations` 也计入 Policy、业务键和 Skill Loader 等宿主调用，共用能力信号量。外部业务执行自身不会重复计数。结果核验使用独立 `limits.maxConcurrentMaintenanceRequests`（默认 4）和 `maxReconciliationsPerOperation`（默认 10），每次开始持久审计；不消耗已耗尽的 Run 模型/能力额度。达到自动核验上限后，具备权限的宿主仍可通过 `resolveOperationOutcome` 提交证据。

Pending Input 答复原子保存答复 Hash、原 Run 与 Session 关联；正文随 Run 管理。即使 Pending Input 已清除，相同答复仍幂等，不同答复拒绝。取消与重复回调不会产生额外推进者。

## 验收

`tests/contract/retention.test.ts`、`capability-boundaries.test.ts`、`subscriptions.test.ts`，以及真实 PostgreSQL 的 `tests/integration/retention.test.ts`、`tests/recovery/interactions.test.ts` 覆盖期限、跨 Session 清理、未知写入、重启收尾、逐条撤权、候选过滤、核验额度和持久答复幂等。
