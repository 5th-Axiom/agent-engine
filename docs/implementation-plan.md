# Agent Engine 实施清单

状态：M0–M3 首版范围已实现并通过验收，真实 Provider smoke 已通过。证据见 [实施记录](implementation-status.md) 和 [行为卡片](workbuddy-behavior-baseline.md)。

权威契约：[technical-design.md](technical-design.md)。项目路径 `/Users/circle/git/agent-engine`；参考项目 `/Users/circle/git/workbuddy-reconstructed`，仅只读使用。

## 执行方式

逐模块记录参考证据、目标断言、实现与实际执行结果。接口存在、Mock、失败或跳过项不计为真实集成验证。按 M0–M3 连续实施，不在 Demo 阶段停止；M4/M5 不扩入本轮。

## M0：契约和基础设施准备

- [x] 完整阅读设计、参考说明与两轮可靠性审查，核对相关恢复源码。
- [x] 建立行为卡片、证据等级与新框架差异表。
- [x] TypeScript workspace，SDK / Debug / Testing 三包及受测依赖锁文件。
- [x] Config、公共类型、事件 Schema、错误 DTO、状态机、默认值/来源/版本。
- [x] Scripted Model、Fake Capability、Clock、故障注入设施。

## M1：可靠的最小执行闭环

- [x] Session/Run 创建与受理幂等、配置预览/冻结/CAS、取消、归档和删除。
- [x] PostgreSQL 事务 Store、显式迁移、管理锁、Run 锁、检查点版本与失锁保护。
- [x] 标准模型协议、流式草稿提交/撤销、Thinking 原生载荷保护（本地协议验证）。
- [x] Binding Tool、输入/输出校验、执行证据和业务幂等 Ledger。
- [x] Retry/Repair、未知写入保护、模型/能力/宿主控制调用额度与信号量。
- [x] Event、Attempt、Usage 从真实执行闭环进入同库持久记录。

## M2：完整能力与恢复

- [x] 崩溃恢复、Pending Input、问题/表单、审批、答复幂等、Operation 证据核验与独立维护额度。
- [x] 高水位补拉/订阅、背压、过期游标、完整快照、逐条撤权和同源清理。
- [x] Tool / Skill / Knowledge / Memory 共享管线、版本依赖、Scope 及候选授权。
- [x] HTTP 与远程 MCP；描述/执行隔离、Schema 漂移拒绝、实际幂等传递。
- [x] Skill 控制边界/恢复、KB sourceId、Memory CAS/写入核验。
- [x] 冻结请求、工程裁剪、有界摘要分块/合并、全链路预算和迟到 Usage。
- [x] 关键故障、并发、跨主体、取消、未知副作用、失锁及 SIGKILL 矩阵。

## M3：首版交付与验收

- [x] 第二种模型协议、组合能力校验、Thinking 续接和受限 Fallback（本地真实 HTTP SSE）。
- [x] 只读 Debug：Config、Run、Step、Attempt、Operation、Usage、错误，鉴权及桌面/移动验证。
- [x] Telemetry：关联 Trace、净修订指标、脱敏日志、独立健康路径及真实本地 HTTP 接入示例。
- [x] 六个公开可运行场景，含基础、Tool、Skill、知识库、Memory、监控、Usage 和覆盖配置。
- [x] 最终类型/三包构建/完整测试通过；Node 26.3 与 Node 22.23.2 各 100 项、0 跳过。
- [x] 授权真实 Provider 的基本响应、Tool、Thinking/Usage smoke。alice 用户密钥驱动 DeepSeek 的 OpenAI-compatible 与 Anthropic-compatible 两条路径，Thinking 原生保护及续接实测通过。
- [x] 依赖/Secret/隔离检查与首版验收报告收齐；凭据集中管理、配置引用，首版总验收关闭。

## 追加交付：本地交互测试页

用户明确追加了可手动发问的本地页面，属于独立开发宿主示例，Debug 保持只读；边界见 ADR 0004。

- [x] `pnpm playground` 同时启动测试页与 Debug，并使用独立 PostgreSQL 开发库。
- [x] 已授权模型选择、自由对话/合成只读工具、文本草稿、取消、继续、历史记录、用量和会话 Debug 导航。
- [x] HTTP 访问边界、输入拒绝、幂等、取消、原生数据隔离测试通过。
- [x] 桌面/移动浏览器交互通过，独立页面审查为 `ship`，无要求修正项。
- [x] 真实浏览器下普通模型问答、Thinking 工具查询及 Debug 往返通过。
- [x] 服务重启后的真实 Thinking 会话续接与最终操作文档归档。
- [x] PostgreSQL 非时间序返回的实测问题已修正：Run 持久受理序号、旧记录事件恢复及逆序 Store 回归。

## 追加交付：新手使用文档

追加的使用文档已按新手路径整理：README 与文档导航、从零启动、页面与 Debug 操作、集中配置、错误排查、SDK 入门和接口参考。两个完整 TypeScript 入门示例通过类型检查并实际运行；配置初始化在独立临时目录验证重复执行、保留原 Key、权限和加载器兼容；现有 PostgreSQL basic 示例再次通过。此次仅更新文档，未将历史全量测试或真实 Provider 结果记为本轮重测。

## 追加实施：通用前端聊天 SDK

- [x] 公开协议、HTTP transport 和状态控制器，输入去重、取消与卸载边界；丢回包与陈旧响应契约通过。
- [x] Token / 原子组件 / 业务组件 / 页面分层及公开导出；独立项目的安装、声明、SSR 导入及浏览器打包通过。
- [x] 悬浮 IM 入口、嵌入式页面、主题/皮肤/品牌色、PC 与移动端；18 个 Chromium 功能检查通过。
- [x] 受鉴权的 Node 接入桥，助手白名单、跨主体隔离与脱敏；真实 HTTP 集成测试通过。
- [x] 后台接入示例、组件展示、新手接入文档和按实装生成的设计规范已交付。
- [x] 27 文件 / 110 测试通过，真实模型、Thinking 工具/Debug、PostgreSQL 重启续聊通过；六视图独立审查为 ship。

具体边界见 [ADR 0005](adr/0005-embeddable-chat-sdk.md)，实际结果见[前端 SDK 验收记录](frontend-sdk-acceptance.md)。不以接口或静态演示作为完成证据。

## 首版完成判定

所有必需契约有实现及验收证据后才能声明首版完成。真实 Provider smoke 未通过时不得关闭首版总验收。源码已确认的 WorkBuddy 行为与其实际运行验证分别标记；没有对照环境不宣称实测对齐。

M4/M5（独立部署、多 Worker、扩容、真实模型或工具重放）明确延期。未发布 npm 包、未部署服务、未执行生产业务操作。

## 验证记录

- 2026-09-11 15:27–15:34：聊天 SDK 六包构建、`pnpm check`（Node 26.3）和 Node 22.23.2 全量各 27 文件 / 110 项通过；18 个 SDK 浏览器检查和旧测试页回归通过，浏览器错误 0；独立项目 tarball 安装/导出/声明/浏览器构建通过。真实普通/Thinking 工具问答、Debug 与 PostgreSQL 重启后的同会话续聊通过；独立 UI 审查 ship，设计文档完成。
- 2026-09-11 14:21–14:22：加入运行受理顺序及旧记录恢复回归后，`pnpm check` 与 Node 22.23.2 完整测试各 25 文件 / 100 项通过、0 跳过；`pnpm verify:playground --functional-only` 再次通过，浏览器错误为 0。
- 2026-09-11 14:13：新增页面后的 `pnpm check` 与 Node 22.23.2 完整测试各 25 文件 / 99 项通过、0 跳过；历史首版记录保留如下。

- 2026-09-11 13:04–13:05：`pnpm check`（Node 26.3），24 文件 / 94 测试通过，0 跳过；随后 Node 22.23.2 相同矩阵全部通过。
- 新增四项本地凭据契约：引用隔离、缺失/占位拒绝、文件权限、错误脱敏。
- 六个公开示例再次通过；生产依赖官方 Registry 审计零已知漏洞，Git 可纳入文件的真实凭据匹配为零。
- `pnpm verify:monitoring`：真实 HTTP 抓取指标，收到 6 个脱敏 Trace、1 个失败信号。
- `pnpm verify:debug`：桌面/移动无页面溢出，独立 UI 审查和交接已完成。
- 2026-09-11 13:03–13:04：alice 授权密钥下，两种真实兼容协议 smoke 通过，覆盖基本响应、只读 Tool、Thinking 原生保护/工具往返/多轮续接及 Usage；旧鉴权阻塞解除。

[首版验收报告](release-acceptance.md) 列出完整证据与首版边界。
