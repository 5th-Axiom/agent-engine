# ADR 0002：显式上下文裁剪、来源标签与宿主方法契约

状态：2026-09-11 已实现；补充首版接口，不减少技术设计中的可靠性要求。

技术设计要求“只裁剪明确允许裁剪的已完成 Tool Result”，但没有固定该高级开关的字段名。实现采用可选 `context.toolResultMaxTokens`（至少 256）。不配置时不做工程裁剪；配置后仅处理旧的、完整对话中的 Tool Result，保留 Call ID、operationId、原文 Hash 和有界预览。原始 Session history 与 Operation receipt 保持不变，模型使用的 contextView 可裁剪。原生续接或当前未完成工具组不经过这条路径。

Token 估算当前采用 UTF-8 字节数的保守上界，不声称为 Provider 精确 Tokenizer。`Step.contextEstimate` 标明方法、请求总量、消息/能力部分与预留输出；裁剪产生 `context.thinned` 事件。摘要使用声明的 summaryModel，按该模型输入窗口分块，并在有限轮次内合并到目标长度。无法满足时明确失败，不能静默超窗或丢弃原始记录。

知识库、Memory 和 Tool 的观察携带内部 dataRefs；派生摘要继承引用。每次发送模型请求以及读取公开快照/补拉事件时复核这些来源，失效时拒绝读取整个相关视图，不把已撤权正文转换成“普通摘要”继续使用。来源标签不发送给标准模型协议。固定期限和同源派生记录的清理已实现，具体粒度、维护边界与证据见 ADR 0003。来源检查与清理分别执行。

Memory Binding 可以同时提供读写方法，因此单个 `sideEffect: write` 无法证明 `method: read` 是只读。可信宿主的混合 Memory Binding 需增加 `methods: { read: 'read', write: 'write' }`；写 namespace 仍需与 Session 的业务 namespace 一致。纯只读 Memory Binding 可继续声明 `sideEffect: read`。业务键、审批 Policy、Skill Loader 和核验 Binding 只允许只读契约，不能通过控制入口绕过 Operation Ledger 写入。

有效配置默认/策略版本采用配置内容 Hash，来源使用 JSON Pointer；Run 冻结版本、来源和依赖。来源信息用于解释配置，不冻结持续授权。Operation 保留各 Run/Call 的输出 Schema 验证结果，避免不同版本的消费者覆盖彼此的验证事实。
