# 回复内容与流式展示改进

2026-09-12。现有 Engine → 事件 → chat-server → chat-ui 架构能够承载这次改进，无需改调度与存储模型。之前看不到思考内容，是聊天服务统一关闭了展示、适配器只上报思考状态，过程投影也过滤了正文；动画生硬则来自每次快照重建 Markdown 节点。

## WorkBuddy 参考依据

只读检查 `workbuddy-reconstructed/recovered-source/packages/conversation-render/src` 下的 reasoning-extension、streaming-text/buffer-core、agent-renderer 和 turn-status-line。代码确认它将 reasoning、阶段文字、工具调用与回答分别渲染，给流式文本设置缓冲，并区分执行中与完成状态。本项目独立实现这些行为，没有复制重建模块、提示词、素材或会话；这不是 WorkBuddy 最新线上版本的完整功能或视觉对齐认证。

## 改动后的行为

- 思考过程／供应商摘要独立显示，可以展开、滚动阅读；与阶段说明、工具调用按事件顺序排列，最终答案独立。
- 执行时按顺序交错展示正文、思考和工具；后继正文出现时局部收起连续过程。完成后保留最长正文与最后结论，其余按正文边界折叠，完成入口在首段常显正文之前。用量、费用完整性和基础执行记录在答案后的独立入口；来源在收尾完成后出现。用户主动展开的内容保留，具体规则见[回复元素行为](reply-presentation-behaviors.md)。
- 接收到的文字按近期到达间隔匀速显示，按字素累计小数进度，避免小批次在数帧内耗尽。首字直接出现；缓冲覆盖轮询和往返时间，最长 900ms，结束时约 100ms 收尾。中文、组合 emoji 不被拆坏；重试撤回旧草稿立即生效，历史消息直接呈现。
- Markdown 仍完整解析以处理后补引用，但只为变化的块创建和更新 DOM，复用未变化的段落、代码块和复制按钮；复制读取当前代码。系统减少动态效果、后台页面立即呈现文本；状态动画离开可见区域暂停。
- 内容增长只在用户原本跟随末尾时保持跟随；向上阅读时不强制拉回。工具和思考的展开状态保持稳定。

当前会话活动快照每次读取结束后等待约 250ms；历史列表独立、合并请求，不能阻塞回答刷新。缓冲改善已收到内容的呈现，不能消除供应商首字延迟，也未新增 SSE、数学公式或代码语法高亮。发送、会话切换和服务端读取优化见 [响应验收](chat-ui-experience.md#后续会话切换与响应延迟修复)。

2026-09-13 用户反馈“一卡一卡”后补测：旧缓冲在 560–720ms 的小批次下，连续输出阶段有 500–517ms 空档；100 段既有 Markdown 在约五秒内被创建三万多次节点。`verify:stream-cadence` 的同一输入修复后，连续阶段最大间隔 67ms、全程最大 76–84ms，创建 125 个元素；桌面/390px 窄屏均无超过 150ms 的连续阶段停顿。页面通过 ResizeObserver 在布局后跟随内容尺寸，避免每个字的事件触发同步布局。数字是本机合成负载，不是供应商或所有设备的性能保证；实际验证和兼容回归见 DOCS-61。

同轮真实模型检查还发现反复读取会话/逐轮记录/事件导致 2 秒以上的响应延迟。chat-server 改用 `engine.readSessionView` 批量取得当前展示数据和增量事件；每次仍重新授权，现有序号、窗口、保留与公开投影不变。该兼容新增接口的返回值和不完整窗口语义见 [SDK 使用](sdk-usage.md#批量读取聊天展示数据)。

## 如何开启思考正文

默认聊天助手仅展示状态。需要同时满足三处配置：

```ts
// 1. createAgentEngine 的 policy（合并进你的现有策略）
thinkingDisplayRetention: "session"

// 2. Session 的 models.<模型别名>.thinking
// enabled / effort / budgetTokens 按实际供应商能力保留。
// expose 只控制公开展示，不会让一个普通模型自动拥有思考能力。
thinking: { enabled: true, budgetTokens: 1024, expose: "content" }

// 3. createChatHandler 的 assistants 中，与 config 同级
thinkingDisplay: "content"
```

这里的三个片段位于不同配置对象，不能直接当成一个对象传入。使用标准 Anthropic 协议且支持 Thinking 的模型可按第二段配置；OpenAI-compatible 适配器目前不能请求 Thinking，不要直接照搬 enabled: true。普通模型可以保持 enabled: false，仅当服务实际返回 reasoning_content 时展示。

`none` 不记录展示文本；`summary` 只接受供应商实际提供的摘要；新增 `content` 显式允许供应商返回的公开思考内容。服务端不能把模型的 none 升级为 content。Engine 的保留策略为 none 时始终不记录正文。签名、遮蔽块和加密的原生续接数据仍只用于受保护协议续接，不能展示或解密为 UI 文本。

文档站本地启动已显式开启 content + session，保持各配置原来的 Thinking 请求开关。空闲旧会话会在授权读取时迁移配置；正在运行的请求保持冻结。**请刷新后发起新一轮问题；以前没有记录的思考正文不能补回。** 如果供应商只返回状态，则仅显示当前阶段，不创建空思考框或编造分析文字。

## API 变化与兼容

| 接口 | 新增内容 |
| --- | --- |
| ModelConfig.thinking.expose | 新增 `content`，保留 `none` / `summary` 语义 |
| ModelStreamEvent.delta | 可选 `thinkingFormat: "summary" \| "content"`；旧自定义适配器未标注时按 summary 处理 |
| content.thinking.delta | 可选 `data.format`，保持与最终正文事件分离 |
| ChatAssistantDefinition | 可选 `thinkingDisplay: "summary" \| "content"`，默认关闭 |
| ChatRun.process | 可选 thinkingDisplay，公开思考行使用既有 thinking kind / output |
| createMessage | 可选 streaming，新增 destroy() 清理动画和监听器；低层直接使用者在卸载时调用 |

标准 OpenAI-compatible reasoning_content 和 Anthropic thinking_delta 按 content 标注。原生签名不进入事件。重试失败或丢弃的思考行从公开过程移除；思考内容受原有保留、授权、输出与过程大小上限约束。每块公开思考最多回读 8000 字符，过程整体有界，不能作为无限日志或完整审计载荷。

## 验证

新增 `pnpm verify:reply-display` 使用真实 Engine/HTTP 与确定性合成模型，检查思考和工具顺序、逐帧更新、字素完整、代码复制与焦点、阅读位置、减少动态效果、刷新恢复和卸载，生成五张桌面／手机／明暗截图。新增集成契约覆盖显式开启、summary/content 区分、撤销配置后缓存重读、失败草稿清理，以及两种标准协议的公开正文和签名隔离。

最终回归、真实供应商与界面复核证据见 [DOCS-43 至 DOCS-46](../examples/docs-site/ACCEPTANCE.md)。


实际结果：`pnpm check` 32 文件 / 157 项（0 跳过），25 篇 / 33 组文档、20 组聊天、图片／过程／输入／回复专项及独立安装消费者通过。五视图独立 UI 复核为 ship，结论限于回复范围和抽查代码。

已授权默认视觉 Profile 的真实 PostgreSQL smoke 完成 3 次模型请求、3 次资料工具调用，返回 3 段实际公开思考（113/243/35 字符），总计 10886 Token，运行中显示及刷新回读通过，浏览器错误 0。另一个 deepseek-thinking Profile 首次请求返回 MODEL_PROVIDER_ERROR，不能据此宣称该项可用；默认入口的成功也不代表全部模型矩阵通过。

最新本地宿主已重启，实际服务的浏览器包哈希与构建产物一致；授权会话在宿主重启后仍能从 PostgreSQL 回读上述三段思考。
