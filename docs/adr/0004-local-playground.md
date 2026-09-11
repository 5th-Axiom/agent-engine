# ADR 0004：本地测试宿主与只读 Debug

用户在首版完成后明确要求可交互的本地测试页，并询问 Debug 入口。新增 `examples/playground` 与 `pnpm playground`，沿用现有 HTML/CSS 和 SDK；没有把 SDK 改成 Web 平台。

测试宿主可以在已授权 Profile 下创建会话、发起 Run、取消 Run；工具只有合成只读库存 Binding。请求 ID 直接沿用 Engine 的幂等契约。模型/场景在会话创建时固定，切换时新建会话，保留 Thinking 的身份及原生续接边界。

Debug 包只新增可选 `basePath` 和本地 `backLink` 以适应同一入口的导航，原有 GET-only、Token 鉴权与脱敏不变。宿主通过内部回环连接读取 Debug；浏览器侧的本地 Cookie、精确 Host/Origin 和跨站限制属于单机信任边界，不冒充生产身份认证。

默认创建独立的 `agent_engine_playground` 数据库，使用稳定本地主体和集中管理的协议保护 Key。历史与运行事实仍来自 Engine Store；浏览器不建立第二份运行账本。轮询公开投影提供实时文本快照，原生 Thinking、API 凭据和工具回执不进入该投影。

本页不实现真实 Replay、任意外部工具注册、多租户权限管理、分布式调度或监控产品。新增访问边界、浏览器交互与真实 Provider/重启验证单独记录，不把已存在的首版测试结果当成本页证据。

## 实测发现的顺序修正

PostgreSQL 的通用 `Store.list` 按记录键返回，MemoryStore 的插入顺序不能成为 UI 的隐含契约。Run 现在在 `run.queued` 的同一事务中保存 `acceptedSequence`，`inspectSession` 据此按受理次序返回。旧开发记录缺少此字段时，只读查询保留的 `run.queued` 事件恢复顺序，不修改原记录。若旧记录及事件均缺少顺序证据，测试页明确报 `RUN_ORDER_UNAVAILABLE`，不猜测对话先后。

回归用例通过逆序 Store 强制打乱返回顺序；真实 PostgreSQL 的服务重启测试验证既有 Thinking 会话依然按顺序显示且可继续对话。
