# 实施工作记录

2026-09-11：M0–M3 的实现、可执行示例及首版验收已完成。使用用户授权的 alice 本地模型密钥，真实 Provider 基本响应、Tool、Thinking/Usage 验证全部通过，之前的鉴权阻塞已解除。M4/M5 未进入实现范围。

## 实现与证据

已完整阅读技术设计两轮可靠性审查、参考 Runtime 说明及实施计划。只读核对参考仓库 replay-safety、历史补推、压缩、Thinking、Usage 相关源码。所有生产代码、Prompt 和 Fixture 独立编写，无 WorkBuddy 私有模块、端点或真实 Session 数据依赖；没有对参考仓库执行写操作。WorkBuddy 双端实测未执行，源码证据和新框架验证分别记录在行为卡片。

最近完整验证：2026-09-11 15:27–15:32，`pnpm check`（Node 26.3）及 Node 22.23.2 的完整 Vitest 均通过，各 27 文件 / 110 测试、0 跳过，包含新增聊天 SDK 和 HTTP 接入桥。六个包完成构建，类型检查包含 scripts/examples；聊天相关安装包另在仓库外通过实际安装、声明、SSR 导入与浏览器打包验证。最低运行时 Node 22.19 来自锁定的 undici 依赖要求。

- 契约：严格 Engine/Session/Run 输入、JSON/Zod Schema 转换、稳定错误 DTO、配置默认来源与版本、配置 CAS、声明能力和冻结请求/依赖。
- 持久执行：同库事务 Store、单管理实例锁、Run 推进互斥、请求幂等、完整消息提交/撤销、取消与归档/删除、全局接入和请求限额。
- 写入可靠性：业务 namespace/key 去重、原始回执和各消费者输出校验分离、同键跨 Session/版本复用、未知结果停止自动重放、持久证据核验及独立维护额度。
- 崩溃：真实 PostgreSQL 覆盖受理落库后回包丢失、模型发送前/提交前/提交后、业务派发前、外部写入后、回执落库后。独立 Node 子进程以真实 SIGKILL 验证外部写入后重启，不以抛异常替代该证据。
- 交互：显式问题/表单、冻结 Schema、审批交集、答复 Hash 幂等、超时、重启恢复、重复回调与取消竞争；Skill 状态和固定 Loader 内容恢复、混批拒绝及失败 Observation。
- 能力：Binding/真实本地 HTTP/远程 MCP，共同执行计数与有限重试；MCP 动态描述不扩权，契约变化在业务派发前拒绝，远端收到实际幂等标识。
- 资料：Knowledge 来源引用与必引输出契约；Memory CAS 及自动/显式读取；逐条 Namespace/主体/期限/证据形状/敏感授权、排序去重、TopK/字节预算。重试复用成功检索结果，继续检查撤权。
- 上下文：可选工程裁剪、完整旧消息组摘要、摘要模型窗口分块与有限合并、原历史和视图分离；摘要和来源继续受授权与期限约束。估算明确采用 UTF-8 字节保守上界。
- 数据：按最早适用保留期清除整个 Session 和派生 Session，启动/维护清理、公开访问立即拒绝、迟到写回不能恢复正文；删除后保留最小去重/用量，未知副作用仍可提交证据。保守粒度及数据库备份边界见 ADR 0003。
- 事件与 Usage：事务序号/固定高水位、完整草稿快照、有界慢消费者、逐条撤权检查；未知不补零、币种分组、Snapshot/Delta 去重、最终提交预算、终态后迟到修订、可重启且只结算一次的用量收尾。
- 遥测与 Debug：Run/Step/Attempt/Operation Trace、固定标签指标、用量净修订差值、脱敏日志、独立 Store 健康路径；真实 HTTP 指标抓取和 Trace/日志接收示例已通过。Debug 只读、需鉴权，桌面/移动截图再次验证无页面溢出；之前完成技能要求的独立 UI 审查与文档交接。

专用数据库为 `agent-engine-test-pg`，PostgreSQL 17，仅绑定 127.0.0.1:55439。无数据库时集成测试失败，不以 skip 代替验证。通用聚合表与短事务串行化适用于本轮单实例范围；未宣称完成大规模性能或多 Worker 验证。

## 真实 Provider 验证与集中凭据

2026-09-11 13:03–13:04，按用户明确授权，只读取得 `/Users/circle/git/alice-a2a/backend/config/local/models.yaml` 中的 DeepSeek 连接和 `secrets.yaml` 中对应的一枚模型密钥。Token 统一放在 `.secrets/credentials.json`，另存独立随机协议保护 Key；`.local/models.json` 仅保存连接、模型和 Secret 引用。旧内联密钥文件已移除，没有复制其他业务凭据或修改 alice。

本机代理 DNS 使用特殊地址，已确认官方域名 TLS 验证成功；smoke 只对该精确 Origin 使用本地私网例外。两个 Profile 共用一个 API Key，使用同一真实供应商的两种兼容协议，不宣称是两家独立供应商。

- `pnpm smoke:provider deepseek-chat`：OpenAI-compatible 基本响应、合成只读 Tool 往返通过，各 Run 的 Usage 完整。
- `pnpm smoke:provider deepseek-thinking`：Anthropic-compatible 基本响应、Tool、Thinking 通过。检查真实思考块、加密原生载荷、工具结果后的续接及同一 Session 的后续对话；公开事件不包含 Thinking delta，各 Run 的 Usage 完整。

原有 `MODEL_AUTH_FAILED` 对应已替换的旧凭据，未伪装成成功。新 smoke 有独立成功证据；没有把 `not_configured` 当成 Thinking 已验证。配置、占位模板和固定错误代码见 [本地模型与凭据管理](local-model-configuration.md)。

## 收尾与保留边界

[首版验收报告](release-acceptance.md) 汇总实际证据。六个示例、Debug 与外部遥测接入均已重新运行；npm 官方 Registry 的生产依赖审计为零已知漏洞。集中管理的 API Key 与协议保护 Key 在 Git 可纳入文件中均无匹配，目录/文件权限分别为 0700/0600；暂存区为空。授权真实协议验证通过后关闭 M3 与首版总验收；WorkBuddy 未双端实测。

不包含发布包、生产部署、生产业务写操作、分布式调度、真实 Replay 或监控产品。代码尚未提交或发布；无需为本地实现擅自操作外部服务。

## 追加的可交互本地页面

用户确认后交付 `pnpm playground`，并在同一回环入口挂载只读 Debug。独立 PG 开发库、固定模型与场景、文本快照、取消/续聊、历史、Usage、Debug 往返均已接通。浏览器合成测试、真实 DeepSeek 普通模式和 Thinking 工具查询通过；重启宿主后原 Thinking 会话继续成功。

实际 PG 检查暴露了 UUID 排序与会话顺序不同的问题，新增与 `run.queued` 同事务保存的受理序号，并对旧开发记录从保留事件只读恢复。逆序 Store 回归确保页面和 Debug 不再依赖存储列表顺序。页面独立审查为 `ship`、无 material fixes；设计记录在 examples/playground/DESIGN.md。

## 追加：通用前端 IM SDK

已交付 chat-core / chat-ui / chat-server，界面分为设计 Token、原子组件、业务组件、页面。管理后台 `/embed/` 提供可点击图标、悬浮聊天与页面内嵌实例，支持深浅/系统主题、两种皮肤、品牌色和桌面/移动布局。Node 桥逐请求验证身份和助手权限，密钥留在服务器；未复制 Alice 私有实现。

18 个 Chromium 功能检查通过，独立视觉审查 `ship`；新入口真实普通模型、Thinking 工具/用量/Debug、PostgreSQL 重启后的同会话续聊通过。详细证据和实际边界见[前端 SDK 验收记录](frontend-sdk-acceptance.md)，操作见[前端 SDK 教程](frontend-sdk.md)。
