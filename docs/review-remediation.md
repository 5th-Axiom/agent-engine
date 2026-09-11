# 2026-09-11 审查修复记录

依据 CodeRabbit CLI 全量审查与 Codex 独立审查合并后的 31 项确认问题实施修复。原始基线为 `734c342`，文档站独立提交为 `e254936`；本轮修复以该提交为基础。原始审查日志、协议探针和截图仅保留在被忽略的本地审查目录；本页提供可随仓库交付的结论、实现位置与复现入口。

下面的“已修复”指对应代码已经修改，并有表内列明的验证；源码清理项不冒称已注入全部系统故障。M4/M5 的调度、监控产品和真实重放继续延期。

## 问题关闭清单

| 编号 | 优先级 | 修复后的行为 | 实现 / 验证 |
| --- | --- | --- | --- |
| R01 | P1 | 模型响应提交和终态前复核会话、资料授权与保留期；结果句柄交付再次走受控读取。历史回执还核验原始来源会话及当前操作资料授权。拒绝时不提交受限回答。 | `sdk/public/engine.ts`；`review-regressions` 的会话过期、会话撤权、工具来源撤权、回执原始会话过期及操作资料撤权测试。 |
| R02 | P1 | 未填写的预算继承硬上限，保留 `policy-ceiling` 来源；显式超限或费用币种不一致拒绝。 | `sdk/config/schema.ts`；缺省、较低、超限、币种与派发前拒绝测试。 |
| R03 | P1 | 成功回执复用也执行当前 Permission Policy、Tool 权限和回执访问授权；拒绝不改写历史成功，不重复写入。 | `sdk/public/engine.ts`；跨会话同键 deny、require-approval 与原账本保持成功测试。取消结算不抄出未经本轮授权的旧回执。 |
| R04 | P2 | 模型 Secret/原生载荷密钥等待可取消、可到期；Retry Backoff 不超过剩余活动期限。 | `review-regressions`；密钥永久 pending、取消、未派发及退避时限。 |
| R05 | P2 | 异步 Header、Fetch 和响应解析共享请求超时/取消，迟到 Header 不派发。 | `chat-core/http.ts`；Header pending、Abort、迟到返回的合同测试。 |
| R06 | P2 | JSON Schema 编译按规范化内容隔离；最多缓存 128 个验证器，不污染其他会话的 `$id`。 | `review-regressions`；同 `$id` 不同定义、自引用、配置替换和实际 Run。 |
| R07 | P2 | Thinking、签名和工具参数的有效流片段重置空闲时限，不公开正文；纯心跳仍超时。 | `review-protocol` 的本地 SSE Thinking / 文本 / ping 对照。 |
| R08 | P2 | 只有实际选择到 Fallback 才绕过原模型 retryOn；无目标时遵守重试分类。 | `review-regressions` 与既有 `fallback` 合同测试。 |
| R09 | P2 | 未知工具和超限批次进入有界输入修复，整批超限零执行。每批业务上限保持 16。 | `review-protocol`；17 调用和未知名字都在下一轮修正成功，工具执行 0 次。适配器另设 256 调用的传输保护上限，超出报 `MODEL_OUTPUT_LIMIT`。 |
| R10 | P2 | Run 工具子集同步与 Skill 白名单取交集，不再受理自身生成的无效引用。 | `review-regressions`；Skill + 工具收窄后正常完成。 |
| R11 | P2 | 会话按创建时间/ID 稳定排序后分页；聊天桥可跨页查找当前助手空间的最近 50 条。 | 501 次公开 createSession 的分页测试；聊天桥跨过 500 条其他空间会话后找到目标会话的集成测试。 |
| R12 | P2 | 输入总量缺失时不计算 uncachedInput，不把可选 usage 缺项变为 NaN。 | `review-protocol`；部分缓存用量下正文完成，已知缓存量保留、完整性为 false。 |
| R13 | P2 | system 主题在配置时验证浅/深两套色板，错误同步拒绝；主题配置复制保存，失败挂载不留 DOM。 | `verify:review-fixes`；不合法覆盖、系统切换、残留节点检查。 |
| R14 | P2 | 统一 UUID v4 生成器使用 getRandomValues 回退，支持普通内网 HTTP 挂载与发送。 | `verify:review-fixes`；localhost 与非安全 HTTP 浏览器上下文，真实 UUID 请求编号。 |
| R15 | P2 | 永久失效会话清理 URL/存储和选择状态；瞬时连接失败保留重试目标并禁止误发送；旧会话请求的迟到错误不覆盖新选择。 | `verify:review-fixes`；403 过期、断网、502 HTML 与快速切换会话竞态。 |
| R16 | P3 | 设计文档明确本地截图不随 Git 交付，改用可交付说明入口。 | Chat UI / Playground 的 DESIGN.md 链接检查。 |
| R17 | P3 | 技术方案标为历史设计基线，指向当前实施进度。 | `technical-design.md`，保留契约正文。 |
| R18 | P3 | 参考说明的设计文档链接指向实际文件。 | `workbuddy-agent-runtime-usage.md` 链接检查。 |
| R19 | P3 | 原始任务说明标注历史存档，链接当前进度。 | `implementation-task.md`。 |
| R20 | P3 | 真实 Smoke 的默认/指定 Profile 命令明确二选一。 | `local-model-configuration.md`。 |
| R21 | P3 | 提交/等待时输入框只读，保留焦点；未连接时仍禁用。 | `verify:review-fixes`；异步渲染期间与结束后的焦点检查。 |
| R22 | P3 | Playground/文档站逐项关闭资源并捕获信号关停失败；启动失败也尽力清理。 | `scripts/lib/close-resources.ts`；前一个 close 抛错仍执行后一个的故障测试。 |
| R23 | P3 | 包命令无法启动时显示原始 spawn 错误，不再 write(null)。 | `scripts/pack-chat.mjs` 源码检查及实际打包验证。 |
| R24 | P3 | PostgreSQL 管理锁测试的 store/other/reopened 在失败路径全部清理。 | `tests/integration/postgres.test.ts`；真实 PostgreSQL 测试通过，清理结构源码确认。 |
| R25 | P3 | Provider Smoke 从迁移/初始化起进入统一错误与清理流程。 | `scripts/provider-smoke.ts`；不可连接的本地数据库探针退出 1，输出 `stage: initialization` 和 `code: UNKNOWN`，未调用模型。 |
| R26 | P3 | Debug 合同测试用 finally 关闭 Server 和 Engine。 | `tests/contract/debug.test.ts`；合同测试通过。 |
| R27 | P3 | Debug 浏览器验证从资源建立后开始统一 finally 清理。 | `scripts/verify-debug.ts`；桌面/移动验证。 |
| R28 | P3 | 打开后 destroy 恰好发送一次关闭通知，重复 destroy 无副作用。 | `verify:review-fixes`；通知序列 `[true, false]`。 |
| R29 | P3 | 未派发操作结算保留真实终止码，不再硬编码 RUN_CANCELLED。 | `sdk/public/engine.ts` 源码检查及取消/保留期合同测试。 |
| R30 | P3 | ROLLBACK 失败不会覆盖原始迁移错误，连接仍释放。 | `review-regressions`；双重失败注入。 |
| R31 | P3 | 测试页非 JSON 错误归一为连接错误并显示恢复入口。 | `verify:review-fixes`；502 HTML 与实际网络中断。 |

表中 `sdk/...` 位于 `packages/sdk/src/`；`review-regressions` 为 [合同回归测试](../tests/contract/review-regressions.test.ts)，`review-protocol` 为 [协议集成回归测试](../tests/integration/review-protocol.test.ts)。

两条条件性意见同时加固：C03 的 `pagehide.persisted` 保留挂载，合成 BFCache 事件验证通过（不声称测试时浏览器实际命中 BFCache）；C20 的局部页面错误会保留到用户修改输入或重试，不再被后台状态更新抹掉。原报告的不采纳项没有据此修改安全边界或首版范围。

## 验证与复现

- Node 26.3.0 与 Node 22.23.2：完整 29 文件 / 134 项测试通过，0 跳过。两次完整测试各使用专用 PostgreSQL 测试库，均已删除。
- 类型检查和六包构建通过；用于提交的隔离源码副本也通过类型检查。
- `pnpm verify:review-fixes`：6 组浏览器边界验证，纯合成 transport，无真实 Provider 调用。
- `pnpm verify:chat-ui`：19 组 SDK 浏览器检查、桌面/移动截图检查，浏览器错误 0。`pnpm verify:playground --functional-only`：10 组旧测试页回归，浏览器错误 0。
- 文档站并行更新后的 20 篇文章通过 17 组确定性检查；该并行内容改动不属于本次修复提交。
- `pnpm verify:debug`：桌面/移动检查通过，无页面溢出。`pnpm verify:chat-packages`：独立项目安装、类型声明、Node SSR 导入、浏览器构建及服务端代码隔离通过。
- 已授权的真实 Provider smoke：OpenAI-compatible 普通模型完成基本问答、工具调用；Anthropic-compatible Thinking 模型完成基本问答、工具调用、原生载荷保护、工具往返及多轮续接。两者 Usage 完整，独立测试库已删除。
- CodeRabbit CLI 0.7.5 对 37 个修复文件的隔离快照完成复查，返回 3 条 minor 意见（旧会话迟到错误、剩余期限不足时的退避、打包失败输出），均已核实修复。其后补充的历史回执来源与操作资料授权检查由 Codex 复核并纳入最终 134 项测试；未声称该最终增量经过 CodeRabbit 再次扫描。

在项目根目录、专用测试数据库可用时执行：

```sh
pnpm typecheck
pnpm build
AGENT_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/你的专用测试库 pnpm test
pnpm verify:review-fixes
pnpm verify:chat-ui --functional-only
pnpm verify:playground --functional-only
pnpm verify:debug
pnpm verify:chat-packages
```

真实模型验证使用既有授权配置、合成提示和独立测试库；凭据、原始协议和私有日志不纳入 Git。审查修复没有发布 npm 包、部署服务或执行生产业务工具。
