# Alice 诊断接入行为卡

| 卡 | 合约与实现证据 | 实测与边界 |
| --- | --- | --- |
| DIAG-01 | Chat contextRef + resolveRunContext；宿主 PostgreSQL admissions 首次解析胜出 | 两个通用新测试及 Alice 并发/重试/重启测试；浏览器任意 context 不受信 |
| DIAG-02 | 独立 Biz 身份验证、active superadmin 与精确授予来源/用户 | 真实 PG 合成管理员、无 Cookie/跨站/禁用/撤权；真实测试管理员尚未指定 |
| DIAG-03 | libpg_query AST + 每关系字段/ownership/时间投影 + PG 只读角色 | 真实 PG 联表/聚合/CTE、危险语句拒绝、字节/行/次数上限、独立连接取消；未接入任意 shell 或 URL |
| DIAG-04 | 消息/运行/阶段、任务/事件、模型 attempts 与固定版本资料 | 合成路径及已授权模型合成任务通过；真实故障样本、日志与部署版本清单待提供 |
| DIAG-05 | 独立证据 API、签名游标、当前授权、到期正文清除 | 跨身份/查询/规则撤销/到期拒绝，浏览器分页失败重试；历史快照不宣称实时数据 |
| DIAG-06 | 单 Engine writer、SIGKILL 恢复、固定双仓与本地包、独立发布/回滚 | 真实 PG 强杀恢复和来源拒绝契约通过；正式 SHA 未锁定，真实部署/网关/备份恢复未验收 |

实现位于 Alice 仓库 diagnostics/，业务语义不进入 SDK。详细命令、数量、真实模型用量及待办以 Alice diagnostics/ACCEPTANCE.md 为准。没有把测试跳过或空接口计为完成。
