# 首版验收报告

最新追加的聊天 SDK 验收见[前端 SDK 验收记录](frontend-sdk-acceptance.md)：六包构建、27 文件 / 110 测试，Node 26.3 与 22.23.2 均通过；18 个浏览器检查、独立视觉审查、仓库外安装和真实模型/数据库重启续聊通过。下文保留首版各阶段的历史证据。

日期：2026-09-11。结论：**M0–M3 首版实现及验收通过**。用户授权的 alice 本地模型密钥已解除鉴权阻塞；真实 DeepSeek 基本响应、Tool、Thinking/Usage 取得成功证据。M4/M5、发布部署与 WorkBuddy 双端实测不包含在该结论中。

## 实际执行结果

| 检查                     | 结果                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`，Node 26.3  | 14:21，TypeScript、三包构建、25 文件 / 100 测试通过，0 跳过                                                                                               |
| Node 22.23.2 完整 Vitest | 14:22，同一 25 文件 / 100 测试通过，0 跳过；最低运行时声明为 Node 22.19                                                                                   |
| PostgreSQL 17            | 专用回环测试库；事务、锁/失锁、跨 Session 去重、保留/删除、表单及 Skill 恢复全部实测                                                                      |
| 崩溃                     | 受理/模型/业务各关键检查点故障注入；独立 Node 进程真实 SIGKILL 后未知外部写入不重放                                                                       |
| 标准协议                 | 真实本地 OpenAI-compatible / Anthropic-compatible HTTP SSE；Thinking 签名工具往返、错误终止门、原生保护                                                   |
| HTTP/MCP                 | 实际幂等 Header/Argument，额外发现能力不暴露；Schema 漂移在业务派发前拒绝                                                                                 |
| `pnpm example` 六个场景  | basic / tool / skill / knowledge / memory / monitoring 全部通过；真实 PG，模型/业务使用合成数据                                                           |
| `pnpm verify:debug`      | 桌面 1440×1000、移动 390×844，无文档水平溢出；只读鉴权与脱敏测试通过                                                                                      |
| `pnpm verify:monitoring` | 真实本地 HTTP 抓取指标，6 个脱敏 Trace，1 个失败信号；不依赖另一次模型调用发送告警                                                                        |
| 生产依赖审计             | npm 官方 Registry，info/low/moderate/high/critical 均为 0                                                                                                 |
| Secret 检查              | API Key 与协议保护 Key 集中保存，模型仅引用 Secret；两个目录被忽略且为 0700，文件 0600；Git 可纳入文件中真实 key 匹配为 0，暂存文件 0                     |
| 真实 Provider            | 13:03–13:04，DeepSeek 的 OpenAI-compatible 与 Anthropic-compatible 路径通过；基本响应、只读 Tool、Thinking 原生保护与工具/多轮续接成功，各 Run Usage 完整 |

类型检查、构建和测试通过表示对应矩阵通过，不是对所有未来供应商差异、负载或宿主实现的无限保证。所有 Fixture、协议服务和示例独立编写；没有复制 WorkBuddy 私有实现或真实业务数据。参考仓库只用于只读行为核对。

## 关键交付

公开 SDK 提供严格配置与来源、Session/Run 生命周期、同库事务与恢复、模型流式草稿、四类显式能力、可信审批/问题/表单、业务 Operation Ledger、有限 Retry/Repair/Fallback、上下文裁剪与摘要、Usage/预算、持久事件与订阅。Testing 提供确定性模型/能力、Clock 与故障注入；Debug 提供需鉴权的只读查看。

本轮最终审查补齐：只读工具真正重试而非误入未知态、控制 Binding 额度和并发、独立核验额度、Memory/Knowledge 逐条资料约束、跨 Session 保留/删除级联、迟到回写保护、可重启的单次 Usage 收尾、跨重启答复幂等、Skill 加载失败 Observation、缓存事件页中途撤权和遥测净修订差值。

可执行契约与证据定位见 [SDK 使用约定](sdk-usage.md)、[行为卡片](workbuddy-behavior-baseline.md) 和 [实施计划](implementation-plan.md)。

## 必须保留的边界

- 到期清理使用 Session 最早适用期限，可能早于某一类别单独期限；原始资料及混合派生内容一并停止披露。清理作用于活跃逻辑 Store，不能撤回已交付内容或擦除外部系统/数据库备份。见 [ADR 0003](adr/0003-retention-and-maintenance.md)。
- Token 估算是 UTF-8 字节保守上界；Provider 用量未知不记零。遥测净值是进程期观察，账务以 Usage Ledger 为准。
- 外部副作用结果未知必须核验。没有远端幂等/结果查询时不承诺 exactly-once；宿主 Binding 必须协作处理 AbortSignal。
- 内置 OpenAI-compatible Adapter 不宣称支持供应商特有 Thinking 扩展；显式不支持的能力会拒绝配置。Anthropic 兼容原生续接已有本地 HTTP 及真实 DeepSeek 证据；未测试 Anthropic 自有端点，不能推广到所有供应商。
- 单实例聚合 Store 未进行大规模负载、多 Worker 或分布式调度验收；M4/M5、生产 Replay、告警产品和包发布明确不在本轮。
- WorkBuddy 双端实测未执行；参考源码已确认与新框架独立测试通过是不同证据等级。

## 真实 Provider 证据与复现

两个命令均退出 0：`pnpm smoke:provider deepseek-chat` 返回 `verifiedStages: ["basic", "tool"]`、`usageComplete: true`；`pnpm smoke:provider deepseek-thinking` 返回 `verifiedStages: ["basic", "tool", "thinking"]`、`thinking: "verified"`、`usageComplete: true`。前者的 `not_configured` 仅表示未启用 Thinking，后者才提供对应成功证据。

Thinking 验证同时检查已提交响应中的真实思考块、带认证标签的加密原生载荷，以及公开事件不出现 Thinking delta；在工具结果后和同一 Session 的下一轮继续调用成功。脚本只使用独立编写的合成问题及只读 echo Binding，不执行外部业务副作用。Usage 完整性不等于费用完整性，也不代替实际账单。

两个 Profile 使用同一 DeepSeek 密钥。Anthropic 兼容入口及 Thinking 支持来自 [DeepSeek 官方说明](https://api-docs.deepseek.com/guides/anthropic_api/)；该接口忽略 `budget_tokens`，脚本仍限制总输出与 Run 超时。首版未用这个供应商差异放宽 SDK 的原生签名与加密要求。

凭据与更新方法见 [本地模型配置](local-model-configuration.md)。源项目只读；实际 Token 和协议保护 Key 统一保存在被忽略的 `.secrets/credentials.json`，`.local/models.json` 只保留 Secret 引用。之前的旧密钥鉴权失败记录被新配置的成功结果取代，没有将失败视为通过。

当前未提交 Git、未发布包、未部署服务或执行生产业务写操作。所有成果保留在 `/Users/circle/git/agent-engine`。

## 用户追加的本地测试页

`pnpm playground` 提供可交互页面与同一入口的 `/debug/`，默认使用独立 `agent_engine_playground` 库。当前模型、场景、历史、输入、流式文本快照、取消、续聊、工具与 Usage 均接到 SDK；Debug 保持只读。

- `pnpm verify:playground`：真实浏览器、合成模型检查发送/草稿/续聊/刷新/取消/错误/工具/Usage/Debug 往返和 HTML 文本安全，浏览器错误为 0；1440×1000 与 390×844 布局无文档水平溢出。
- 实际浏览器使用授权 DeepSeek：普通模式回复测试、Thinking 模式合成库存工具调用、Usage 完整性及 Debug 往返通过。停止并重启宿主后，原 Thinking 会话继续回答成功。
- 重启实测发现存储返回顺序不能当作对话顺序，现以同事务写入的 `acceptedSequence` 排序，并从旧记录的保留事件恢复；逆序 Store 强制覆盖该问题。
- 顺序修复后再次执行 `pnpm verify:playground --functional-only`，全部浏览器交互断言通过、错误为 0；此轮复验不生成或重复审查布局截图。
- 页面独立审查 disposition 为 `ship`、无 material fixes。机械 detector 因 parser 模块缺失降级，不作为完整对比度验证；两项 advisory 指向旧 Debug 未改动字号，由审查结合现有文档确认。

使用方法见 [本地测试页面与 Debug](local-playground.md)。浏览器仅读取受限投影，模型密钥与原生 Thinking 不进入页面；本机信任边界与版本范围见 ADR 0004。上述追加验收不宣称测试了所有供应商、生产身份系统或分布式运行。
