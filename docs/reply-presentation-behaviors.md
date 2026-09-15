# 回复元素的顺序、时机与折叠

2026-09-13。用户要求重新参考 WorkBuddy 的实际实现。参考仓库只读；下面记录可观察规则，Agent Engine 独立实现，不复制参考模块、提示词、资产或用户数据。

## 代码确认的参考行为

参考根目录为 `/Users/circle/git/workbuddy-reconstructed/recovered-source/packages/conversation-render/src/`。

| 元素 | 代码确认的规则 | 来源（相对参考根目录） |
| --- | --- | --- |
| 助手框架与状态 | 标识、处理时长位于内容前；完成折叠已有耗时则不重复展示；尾部动作不参与内容折叠 | `scenarios/common/workbuddy-message/agent/agent-renderer.tsx.recovered.js`、`turn-status-line.tsx.recovered.js` |
| 正文 | 按内容单元顺序，稳定标识复用；当前正文缓冲，已结束历史直接显示；正文与相邻过程有独立间距 | `list-like-render/extensions/builtin/text/text-extension.tsx.recovered.js`、`scenarios/common/assistant-fold/content-unit.ts.recovered.js` |
| 思考 | 没有正文时不创建空思考块；末尾正在输出的思考展开，后继内容出现时收起；用户可以再展开 | `scenarios/task-chat/extensions/reasoning/reasoning-extension.tsx.recovered.js` |
| 工具 | 同一调用复用身份与参数；标题行显示真实执行态；有详情才有展开入口 | `scenarios/common/assistant-fold/content-unit.ts.recovered.js`、`scenarios/common/tool-call/shell/tool-header.tsx.recovered.js` |
| 运行中分段 | 连续至少两个过程单元在后继正文出现后形成局部折叠；单个过程单元不再套额外折叠 | `scenarios/common/assistant-fold/fold.ts.recovered.js` |
| 完成布局 | 最长的正文和最后一段正文常显；其余按正文边界分段折叠；完成入口在首个常显正文之前；交互卡保留外露 | 同上 `computeBodyAnchors`、`applyCompletedFold` |
| 折叠与动画 | 稳定折叠状态；已挂载内容保持；尺寸开合只在状态变化时进行，反向操作接续当前高度；首屏和减少动态效果直显 | `list-like-render/extensions/builtin/collapse/collapse-extension.tsx.recovered.js`、`shared/theme/use-expand-motion.ts.recovered.js` |
| 滚动 | 接近底部时跟随，上翻解除跟随；尺寸/文字变更合并处理 | `shared/theme/use-sticky-auto-scroll.ts.recovered.js` |

以上是恢复源码确认，未宣称本轮操作了 WorkBuddy 线上 UI。参考 CSS 与脚本有浏览器能力分支，Agent Engine 使用现有 DOM/Shadow DOM、主题和图标体系。模型与宿主未允许的思考不显示，原生协议与私有载荷不进入浏览器。

## 本次实现

修正前的实现把正文固定在过程区外，完成时又用 CSS order 把整个过程区从上移到下；过程内的阶段正文与正在输出的正文不是同一节点，阶段切换会消失后重建。思考只自动展开而不自动收起；工具行更新重建 summary；过程容器开合没有连续过渡。

现已改为稳定标识的有序内容流，局部折叠保留节点。动画只解释折叠边界变化，采用现有节奏附近的短过渡，不给每个字或历史块重复入场。用户主动展开、焦点和选区优先于自动收起。待处理问题、错误、来源与用量仍按各自状态独立展示。

## 验收依据与差异

| 行为卡 | 检查与证据 |
| --- | --- |
| REPLY-01 | `tests/contract/reply-layout.test.ts`：运行中分组、最长／最终正文锚点、相同长度、没有正文的终态与警告外露，3 项通过 |
| REPLY-02 | `tests/integration/chat-process.test.ts`：真实 Engine 事务中的 draft→阶段提交→最终提交间隙→结果身份和顺序一致；8 项过程集成通过，包含公开思考授权、失败草稿与待处理状态 |
| REPLY-03 | `verify:reply-presentation`：1440／390 宽度的完整顺序、空／活动／后继思考、节点身份、连续过程与完成分段、收尾后来源和明细、反向开合、用户展开／焦点、历史及减少动态效果通过；无溢出和浏览器错误 |
| REPLY-04 | `verify:chat-process`：真实 HTTP/Engine，详情内部 150px 滚动和焦点跨完成状态保持、刷新收起、等待／停止、重试撤回、明暗／自定义品牌色与手机布局通过 |
| REPLY-05 | `verify:reply-display`、`verify:chat-ui`、`verify:chat-responsiveness`：思考顺序、正文逐帧、字素、代码复制／焦点、阅读位置、安全链接、来源、独立挂载、慢网络切换和销毁回归通过 |

全量 `pnpm exec vitest run --exclude '.local/**'` 为 41 文件／217 项通过，无跳过或未处理错误，包含 PostgreSQL 和故障恢复。首次全量发现旧测试临时库强删与连接关闭竞态；修正为等待该库连接退出后普通删除，再次全量通过，没有忽略异常。

最终 `verify:stream-cadence` 回归：1280／390px 合成小批次的连续阶段最大显示间隔为 117／67ms，均无超过 150ms 的停顿，单次绘制最高 2／3ms，已有正文节点保持；这些是本机合成负载数据。标准 PostgreSQL 文档站的独立身份真实模型 Run 完成 4 次工具调用（包括 api.lookup、code.read），显示 2 个来源与完成折叠，刷新直显和资源哈希一致，浏览器错误为 0。

展示规则由参考恢复源码确认，浏览器证据验证的是 Agent Engine 独立实现。没有运行 WorkBuddy 线上 UI，也没有宣称全量视觉等同。保留本项目字体、配色、图标和详情面板；采用短的 240／190ms 高度过渡及低强度状态明暗变化，不复制参考自适应长时动画与渐变闪烁。来源是宿主已校验链接，执行详情是本项目公开用量／事件，参考没有的产品功能不补造。浏览器视口验证不等于 iOS／Android 真机认证。

修复中发现并验证：创建完成折叠组时，先让目标容器挂载，再移动仍连接的节点；否则原生滚动区会在重新挂载时归零。支持 `moveBefore` 时使用保留状态的移动，其他环境恢复已有滚动偏移和焦点。用户手动开合会解除页面跟随；同内容来源链接保持原节点。

桌面／手机完成、手机思考和深色工具截图批量检查后，统一收紧正文首块顶部空白，再次桌面／手机确认。检测器仅提示既有 Markdown blockquote 的 3px 中性引用边线；它表达引用语义，保留且不视为新卡片装饰。截图保存在被 Git 忽略的 `examples/docs-site/.impeccable/review/`。实际文档站交付证据见 DOCS-62。

## 2026-09-15 消息复制与选区（REPLY-06）

原选区背景/文字复用了用户气泡的同一组颜色，导致用户文字已选中但看不出来。现在选区使用有对比度校验的 accent/onAccent 配色，正文显式允许原生文字选择。用户消息、无过程投影的助手回复及过程中的每段公开正文均有常驻的「复制」按钮；占位提示和纯图片不提供文字复制。按钮复制点击时的原始文字/Markdown，保留换行，不拼入工具详情、思考、状态或用量。结果以可见文字和屏幕阅读器状态提示，失败可重试或手动选中复制。新增 ChatCopy 的三项文案为可选字段，既有调用兼容；不持久化剪贴板内容。

`verify:message-copy` 在 Chromium 1440/390px 通过原生拖选/系统快捷键复制、轮询保留选区、明暗高亮对比度、流式正文/完成/历史复制、原文安全、代码复制、键盘、剪贴板拒绝后的可见错误和重试、44px 按钮、无溢出及销毁检查。过程详情不进入复制结果，已选段落跨追加和完成保持节点/选区。浏览器证据为合成数据，不代表手机真机认证；截图保存在忽略目录。

本次定向回归 `verify:reply-display`、`verify:reply-presentation`、类型检查与构建通过。界面检测器仅报告既有 Markdown 引用边线，未修改该语义样式。
