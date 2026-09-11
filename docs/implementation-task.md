# 原始实施任务（历史存档）

> 以下为首版实施时的任务说明，不代表当前待办。当前进度见 [实施清单](implementation-plan.md)，已完成验证见 [实施记录](implementation-status.md)。

请直接在 `/Users/circle/git/agent-engine` 实现 Agent Engine。用户明确要求基于已反复审查的技术方案与 WorkBuddy 相关实现，分阶段持续推进，直到首版完整交付；不要只给计划，不要停在脚手架或 Demo。

先完整阅读本项目 `AGENTS.md`、`docs/technical-design.md`、`docs/workbuddy-agent-runtime-usage.md`、`docs/implementation-plan.md`。原参考仓库 `/Users/circle/git/workbuddy-reconstructed` 供只读核对，独立实现新架构，不复制恢复源码为产品代码，不引入其桌面进程、cwd、sandbox 或私有服务依赖。

按方案 M0–M3 逐步实施：公共契约与测试设施；PostgreSQL 事务型 Store；Session/Run/Loop/Thinking；安全 Tool 执行与幂等；恢复/取消/人工输入；可靠事件；Skill/知识库/Memory；压缩；计费与预算；第二种模型协议；只读 Debug、Telemetry 和真实可运行的场景示例。每完成一阶段及时记录证据并继续，直到全部首版验收项通过。M4/M5 是明确延期候选，不应默默扩大本次范围。

特别遵守方案第 6.16 节两轮审查：业务幂等 namespace 不含实现版本；同一 Run 推进锁；失败与未知副作用分离；原生 Thinking 续接数据；草稿提交/撤销；请求快照重试；Skill 控制混批拒绝；知识库引用和 Memory 版本 CAS；交互显式开启；提交顺序事件与断线补拉；未知费用不能当零；终态与迟到 Usage 区分。

用户允许在确有接入需要时从参考项目复用其可合法使用的 API Token；仅复制所需最小集合到被 Git 忽略、权限受限的本地凭据文件。不要在聊天、文档、命令输出、Git 或公开日志中展示 Secret，不以恢复包中出现凭据为授权依据。真实模型验证用非敏感测试输入，控制调用范围，禁止生产业务写操作。

优先确定性测试，再真实数据库集成、故障注入和授权 Provider smoke test。技术方案出现实现歧义时先核对上下文/源码，用明确 ADR 记录取舍并同步文档，不删减安全契约来规避测试。任何未实现、失败或未执行的验证都如实记录；有真实外部阻塞时说明缺少什么，不虚报完成。
