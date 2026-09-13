# 同批工具结果的 Anthropic 兼容修复

2026-09-13。用户文档站出现 `MODEL_PROVIDER_ERROR`，工具列表显示检索完成却没有最终回答；左侧仍显示正在执行。

## 原因与修复

本地记录确认受影响 Run 使用 `deepseek-thinking`（Anthropic-compatible）：一个模型响应同时请求 `docs.search` 和 `api.lookup`，工具均成功，随后模型调用以不可重试的 Provider 错误终止。记录未保存供应商原始报错，因此不从泛化错误码猜测认证或余额问题。

独立合成请求在同一已授权 DeepSeek 接口验证：两个 `tool_result` 拆成两个连续 user 消息，HTTP 400 且报错涉及工具消息顺序；两个结果放在同一 user 消息则 HTTP 200，并正常回答。符合 [Anthropic 同批工具结果契约](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)；DeepSeek 的 [Anthropic 兼容接口](https://api-docs.deepseek.com/guides/anthropic_api/)使用该消息格式。

适配器现将连续 canonical tool 消息合并为一条 user 消息里的多个结果块。工具 ID、顺序、图片嵌套与内容保留；不修改签名／思考原生块，不跨 assistant 或普通 user 边界合并，不改变引擎串行工具执行与审批、授权、回执、恢复契约。旧会话经同一映射继续，已失败 Run 的事实记录不会改成成功。

Controller 根据已验证的当前 Session 快照即时同步列表标题与活动标记，迟到的列表不能让已结束会话重新显示正在执行。错误文案明确是模型服务未完成本轮回答。

## 验证

- `tests/integration/protocols.test.ts`：单工具／同批双工具 Thinking 原生签名续接、同一 user 消息结果顺序、公开事件与存储不含签名；保留原单工具覆盖。
- `tests/contract/chat-core.test.ts`：completed／failed／cancelled 都立即更新侧栏，迟到列表不会恢复旧标题／活动状态。上述两文件 29 项通过。
- `pnpm exec tsx scripts/smoke-anthropic-tools.ts deepseek-thinking`：仅合成问题与本地只读工具，真实模型同一响应调用两个工具，得到结果后成功回答；同一会话下一轮继续正确回答。共 2 个 Run、2 次工具执行，无重试。
- 该 smoke 命令按指定本地 profile 使用已授权凭据，输出只包含状态和计数；不会发送用户聊天记录，也不会打印密钥、原生推理／签名或完整供应商响应。全量和文档站发布到本地的证据见 DOCS-63。

未通过自动重试 HTTP 400、关闭思考或改成单工具来绕开协议问题；没有新增公开类型、配置字段或 M4/M5 能力。
