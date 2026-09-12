---
name: Agent Engine Chat UI
description: 可嵌入宿主工作台、共享组件与语义主题的聊天界面。
colors:
  white: "#ffffff"
  black: "#000000"
  navy: "#172b42"
  muted: "#48596a"
  line: "#dce2e8"
  surface: "#f6f8fa"
  blue: "#0758a0"
  selected: "#e1edf8"
  error: "#99252c"
  dark: "#111b28"
  dark-surface: "#1d2a3b"
  dark-text: "#edf3fa"
  dark-muted: "#b2c2d6"
  dark-line: "#4d6075"
  dark-blue: "#8ec5ff"
  dark-selected: "#263d55"
  dark-error: "#ffadb1"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
  headline-narrow:
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.35
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.6
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.6
  message:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.8
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
    lineHeight: 1.6
  input:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.5
  button:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.6
  toolbar:
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  composer-select:
    fontSize: "13px"
    lineHeight: 1.6
  composer-select-narrow:
    fontSize: "16px"
    lineHeight: 1.6
  detail-note:
    fontSize: "13px"
    lineHeight: 1.75
  panel-title:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.6
  tool-title:
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.6
  process-heading:
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.6
  process-metadata:
    fontSize: "12px"
    lineHeight: 1.6
  history-title:
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  identifier:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.7
  code:
    fontFamily: "ui-monospace, monospace"
    fontSize: "0.9em"
    lineHeight: 1.7
  code-header:
    fontSize: "12px"
  image-caption:
    fontSize: "12px"
  image-status:
    fontSize: "13px"
  settings-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.35
  settings-title-narrow:
    fontSize: "23px"
    fontWeight: 650
    lineHeight: 1.35
  settings-section-title:
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.4
  settings-body:
    fontSize: "15px"
    lineHeight: 1.6
  settings-item:
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
  settings-description:
    fontSize: "14px"
    lineHeight: 1.6
rounded:
  inset: "4px"
  control: "6px"
  media: "8px"
  message: "12px"
  panel: "12px"
  rounded-control: "14px"
  rounded-message: "20px"
  rounded-panel: "20px"
  launcher: "50%"
spacing:
  small: "8px"
  medium: "12px"
  space: "16px"
  rounded-space: "20px"
  large: "24px"
components:
  pending-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px"
  settings-row:
    textColor: "{colors.navy}"
    typography: "{typography.settings-body}"
    padding: "18px 0"
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-disabled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    typography: "{typography.input}"
    rounded: "{rounded.panel}"
    padding: "12px 14px 4px"
    width: "100%"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    rounded: "{rounded.panel}"
  composer-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    typography: "{typography.composer-select}"
    rounded: "{rounded.control}"
    padding: "4px 24px 4px 8px"
    height: "40px"
  code-block:
    textColor: "{colors.navy}"
    typography: "{typography.code}"
    rounded: "{rounded.media}"
  code-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    typography: "{typography.code-header}"
    padding: "8px 12px"
  image-thumbnail:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.media}"
    width: "144px"
    height: "96px"
  history-item:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    typography: "{typography.history-title}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
  message-self:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.navy}"
    typography: "{typography.message}"
    rounded: "{rounded.message}"
    padding: "12px 16px"
  message-agent:
    textColor: "{colors.navy}"
    typography: "{typography.message}"
    padding: "0 2px"
  run-details:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  run-process:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  process-header:
    textColor: "{colors.navy}"
    typography: "{typography.process-heading}"
  process-pending:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    rounded: "{rounded.media}"
    padding: "12px"
  launcher:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.launcher}"
    width: "56px"
    height: "56px"
---

# Design System: Agent Engine Chat UI

## Overview

**Creative North Star: "Agent Engine 工作台"**

聊天界面沿用 Agent Engine 的白色工作面、深蓝文字、蓝色操作和细分隔线。内容以平整记录排列，操作保持清楚、安静；悬浮入口让用户在当前工作环境中打开对话。深色主题与柔和圆角皮肤延续同一套层级和控件语义。

本规范覆盖可复用 SDK 的 Token、原子组件、业务组件和页面挂载。默认视觉值来自实现，主题与皮肤通过公开接口替换。管理后台的导航、库存表和介绍区域只是接入示例；合成库存不构成 SDK 的业务能力或生产数据承诺。

**Key Characteristics:**

- 语义颜色统一驱动浅色、深色、系统主题和品牌色。
- 细边框、留白与文字层级组织记录，不使用投影构造卡片层级。
- 悬浮对话与容器页面共享左侧会话列表、消息、输入及会话／工具详情。
- 原生控件、清楚的焦点和明确状态支持键盘及触屏操作。
- 每个挂载实例在 Shadow DOM 内应用样式，宿主保留自己的视觉身份。
- 图片预览与上传恢复靠近输入位置，助手 Markdown 以阅读层级和可复制代码呈现。
- 真实活动按顺序组成可展开的处理过程，最终回答单独阅读；查看详情时保留焦点和内部滚动位置。

- 独立会话配置网页沿用同一主题，以分类、开关、明确保存和可恢复状态管理后续发言的设置。
- 问题、结构化表单和审批复用原生待处理输入，过程收起时仍可操作，轮询保留同一请求的字段节点。

来源为 [Token](src/tokens/index.ts)、[共享样式](src/styles.ts)、[原子组件](src/atoms/index.ts)、[业务组件](src/components/index.ts) 和 [页面](src/pages/index.ts)。方向来自 [接入示例](../../examples/embedded/index.html) 的首个 body 注释及 [PRODUCT.md](PRODUCT.md)，没有替换现有 Playground 或 Debug 的设计。

## Colors

默认颜色以冷白和蓝灰组织工作面，用蓝色标明行动，用独立红色表达错误；深色模式使用深海军蓝底色与浅蓝操作色。

### Primary

- **工作台蓝（blue）**：默认主按钮、入口、链接、光标和可见焦点。
- **浅亮蓝（dark-blue）**：深色主题对应的操作与焦点颜色。
- **错误红（error / dark-error）**：失败状态和恢复反馈，不承担装饰用途。

### Neutral

- **白色工作面（white）与深色工作面（dark）**：页面、输入框及对话面板底色。
- **海军蓝文字（navy）与浅色文字（dark-text）**：正文和控件的主要文字。
- **蓝灰次级文字（muted / dark-muted）**：发送者、连接状态、辅助说明和用量。
- **次级工作面（surface / dark-surface）**：历史区域、次按钮悬停和禁用控件。
- **记录分隔线（line / dark-line）**：控件、详情面板与输入色面的必要边界。
- **选中底色（selected / dark-selected）**：用户消息、历史当前项和文本选区。
- **黑色与白色（black / white）**：自定义品牌色按钮的对比文字候选。

| 语义 Token                   | 浅色使用的原语 | 深色使用的原语 |
| ---------------------------- | -------------- | -------------- |
| canvas                       | white          | dark           |
| surface / disabledBackground | surface        | dark-surface   |
| text / userText              | navy           | dark-text      |
| muted / disabledText         | muted          | dark-muted     |
| border                       | line           | dark-line      |
| accent / accentText / focus  | blue           | dark-blue      |
| onAccent                     | white          | dark           |
| userBackground               | selected       | dark-selected  |
| danger                       | error          | dark-error     |

`resolveChatTheme()` 默认采用 light / workbench；显式 `system` 跟随系统深色偏好。`accent` 只接受六位十六进制颜色，并自动选择黑或白的 `onAccent`；品牌色在工作面上的文字对比度不足（4.5:1）时，`accentText` 回退到正文色，焦点不足（3:1）时也回退。`tokens` 是最终覆盖层；自定义配色仍需通过运行时校验。

Markdown 代码头、输入色面与图片缩略图背板使用 surface，代码正文沿用 canvas 上的 text，因此随明暗主题切换。聊天代码没有语法着色；文档宿主的深色语法代码框是手册样式，不是 SDK 代码组件的默认值。附件中的颜色是用户内容，不纳入品牌色板。

处理过程以 muted 显示记录，标题与查询输入使用 text，进行中状态使用 `--ae-chat-accent-text`，失败使用 danger，等待状态使用 text 与较重字重。外层标题、内层摘要和详情正文的键盘轮廓均使用 `--ae-chat-focus`，沿用品牌色对比度回退；不直接把任意 accent 当作小字或焦点色。等待问题使用 surface 色面和 border 边界，在过程收起后仍可见。

**The Semantic Color Rule.** 新组件从语义 Token 取色；品牌色变化保留正文、错误、选中和禁用状态的独立角色。

当前解析器校验正文与次级文字对 canvas / surface、onAccent 对 accent、userText 对 userBackground，以及 danger 对 canvas 的文字对比度（至少 4.5:1）。[主题契约测试](../../tests/contract/chat-core.test.ts) 覆盖两种模式、两种皮肤及五个品牌色样本；它不等于所有任意覆盖组合的完整无障碍认证。源码没有色阶 Token，sidecar 不合成未使用的色阶。

会话配置沿用 canvas、text、muted 与 border；分类当前项使用 userBackground / accentText，启用开关使用 accent / onAccent，未启用使用 surface / muted。禁用开关保留原因文字，不能只靠透明度表达宿主限制。

## Typography

采用系统无衬线字体栈，SDK 没有远程字体或展示字体。会话 ID 与工具名称使用本机等宽字体，便于辨认标识符。标题通过字号和字重建立层级，正文保留足够行距阅读长回复；字体不承担营销式表达。

| 前置 Token 角色 | 用途                                   |
| --------------- | -------------------------------------- |
| headline        | 空会话欢迎标题                         |
| headline-narrow | 窄主区域的空会话欢迎标题               |
| title           | 对话页头部标题                         |
| body            | 页面正文和助手选项                     |
| history-title   | 左侧会话条目的两行标题                 |
| message         | 用户纯文本换行与助手 Markdown 正文    |
| label           | 发送者、状态、执行详情、字符计数和脚注 |
| input           | 多行输入框，触屏下保持明确可读的字号   |
| button          | 主、次、安静按钮的操作文字             |
| toolbar         | 新对话、当前会话和工具数量入口         |
| composer-select | 模型、Skill 与发送快捷键的原生选择器  |
| composer-select-narrow | 窄主区域的原生选择器文字          |
| detail-note     | 配置说明和工具描述                     |
| panel-title     | 左侧列表与右侧详情面板的标题           |
| tool-title      | 工具详情列表中的单项标题               |
| process-heading | 处理过程外层标题                       |
| process-metadata | 活动状态、单项耗时和记录范围说明       |
| identifier      | 会话 ID 和工具名称                     |
| code            | 助手回复中的行内代码与代码块           |
| code-header     | 代码围栏标签与复制操作                 |
| image-caption   | 待发送图片的文件名或上传状态           |
| image-status    | 历史图片读取状态与恢复说明             |

`fontFamily`、`fontSize` 与 `smallFontSize` 可通过主题覆盖；欢迎标题、页标题、输入、工具栏和详情说明字号当前由共享样式固定。错误反馈采用与 detail-note 相同的字号，沿用页面行高。工具标题使用 tool-title，权限类别使用 identifier 的字号；窄主区域欢迎标题使用 headline-narrow。这些是现有角色，不是本轮新增的字体系统。字符计数使用等宽数字；消息、标识符和工具描述允许长串在任意位置换行。会话列表标题最多两行，完整标题保留在按钮的 title 属性。欢迎说明与每轮记录宽度上限（720px），输入区含内边距上限（760px）。

处理过程的活动标签、输入／结果摘要、总耗时和用量页脚继承 `smallFontSize`，默认对应 label；外层标题在相同字号上加重为 process-heading。状态、单项耗时和范围说明使用固定的 process-metadata；耗时和用量使用等宽数字。过程中的已提交阶段说明沿用 message 的正文字号和行高，与最后回答一致，不能把小字规格套到这类正文。

输入工具栏的模型、Skill 和快捷键选择使用 composer-select；主区域小于（480px）时改用 composer-select-narrow，保持正常名称可读并允许控件换行。发送／停止按钮沿用 toolbar 的字号与字重，输入设置说明使用 label 的字号；编辑正文继续使用 input，不随工具栏缩小。

助手 Markdown 将输入的一至四级标题下移为 h3 至 h6，以（1.05em）字号置于页头与欢迎标题之下。段落、列表和引用保留段后留白（12px）；表格使用（14px）正文并独立横向滚动。代码文字保持等宽和原始换行，不因窄屏折断代码行。

公开思考正文的有效字号与行高沿用 message，以 muted 与独立边界区分最终答案。思考类的局部字号与行高被后续消息样式覆盖，不将未生效声明另立为 Token。

独立配置网页的标题使用 settings-title，视口不大于（680px）时使用 settings-title-narrow；分类面板标题使用 settings-section-title。页面基础文字使用 settings-body，开关项目名使用 settings-item，分类导航、简介和操作文字使用 settings-description 的字号；保存状态为（13px），记忆说明为（13px）／行高（1.75）。窄屏搜索与模型选择文字为（16px）。这些角色记录已实现的配置页层级，不改变聊天欢迎标题或文章标题。

## Layout

页面根节点是占满挂载容器高度的横向 flex 结构，左侧会话列表与右侧主区域并排。根容器宽度达到（760px）时，左栏默认常驻、宽（232px），可从主区域页头的图标收起；左栏含一个列表标题、新对话按钮、多助手时才显示的选择器，以及占据剩余高度、独立滚动的会话列表。列表组件自身的标题在侧栏组合中隐藏，避免重复标题。主区域保持纵向结构：合并操作入口的页头、主体；主体中的记录、反馈和输入区沿纵向排列，只有记录区独立滚动。宿主需为 inline 容器提供实际高度，SDK 不接管宿主页面的栅格。

根容器小于（760px）时，左栏默认收起，展开后覆盖在页面左侧，宽度为 `min(280px, 100% - 32px)`。关闭按钮、遮罩和 Escape 均可收起；此时主区域 inert，Tab 在侧栏内循环，关闭或选择会话后焦点返回页头入口。右侧详情定位在主区域的主体内，宽度为 `min(360px, 100%)`，不覆盖页头；打开时对话部分 inert，背景遮罩表达当前操作范围。主区域宽度小于（480px）时，详情铺满主体宽度。

默认 `space` 决定头部和主要区域的横向内边距；rounded 皮肤使用 `rounded-space`。页头纵向内边距（8px）、最小高度（64px），记录区纵向采用 large；窄主区域页头为两行网格，标题与连接状态同行，下行放操作，记录区纵向内边距回到 space。每轮记录底部间隔（28px），同轮消息之间（16px）。原生输入框由运行时自动调整高度，普通状态从（72px）随内容增高，目标上限为 `max(72px, min(180px, 可见视口高度 × 25%))`；展开后同一节点使用 `max(72px, min(480px, 可见视口高度 × 50%))`。CSS 另保留最小高度（60px）与 `50dvh` 上限，展开时清除 CSS 最小高度；没有手动拖拽缩放。超出内容在输入框内滚动，容器宽度、窗口和可见视口改变时重新计算，输入区仍在记录滚动区之外。

输入底栏采用可换行 flex，选择区间距（4px），动作区间距（2px）；模型默认宽（180px）、Skill 宽（130px），选择器高度见前置 Token。窄主区域把选择区和动作区各放一行；选择器横向内边距（8px），模型 flex 填充且最小宽（150px），Skill 宽及最小宽（120px），容纳不下时在选择区继续换行。发送按钮保持在动作区末端。输入设置为原生 details，面板宽（280px）、最大宽 `calc(100vw - 48px)`，距入口上方（8px）；窄主区域改锚定整个输入色面并距右侧（8px），避免跟随靠左的设置按钮越出视口。

待发送图片队列放在输入色面内、文字编辑器上方；横向 flex、间距（12px），内容超出时只在队列内滚动。每项宽（144px），预览高（96px）并使用 contain，下面显示文件名或上传状态与恢复操作。历史图片位于本轮消息中，最大宽度为 `min(360px, 100%)`、最大高度（300px），同样使用 contain。图片保留完整比例，输入和发送仍固定在记录区外。

悬浮入口默认在视口右下角，右侧留白（24px），底部留白为 `max(24px, env(safe-area-inset-bottom))`；`position: "left"` 可改到左侧。入口尺寸见前置 `launcher` Token。桌面对话默认宽高（420×680px），位于右侧（24px）、底部（92px）；实际宽度为 `min(panelWidth, 100vw - 32px)`，高度为 `min(panelHeight, visualViewportHeight - 116px)`。

在窗口宽度不大于 `breakpoint`（默认 600px）时，对话使用原生 modal dialog 占满可见视口，去掉外框和圆角，跟随 `visualViewport` 的高度及顶部偏移。桌面使用非模态原生 dialog，宿主可继续操作。输入区底部保留安全区。

页面自身另有主区域响应阈值（小于 480px）：隐藏键盘快捷键提示及工具栏图标、收紧头部和记录区纵向留白。`ResizeObserver` 观察页面根宽度，并按主区域实际宽度设置窄布局；它与窗口是否移动模式分别处理。窗口和容器阈值记录于 sidecar；文档宿主显式配置的（440px）停靠助手和接入示例导航栅格均不属于 SDK 默认尺寸。

处理过程位于本轮助手名称之后、最终回答之前。活动平整排列，普通活动行的最小高度（36px），可展开摘要和外层标题的最小高度（40px）；这些紧凑原生 disclosure 不是默认（44px）按钮。详情正文相对图标缩进（27px），高度上限（240px），超出后独立滚动并保留键盘入口。窄主区域仅隐藏每项耗时，外层累计活动时间仍显示且标题可换行；处理过程不改变左栏、附件队列或输入区布局。

**The Container Boundary Rule.** 页面适应被分配的容器；悬浮挂载只通过入口和对话接收指针事件，普通宿主区域保持可操作。

公开思考使用独立可聚焦滚动区，继承详情（240px）高度上限；左侧留白（26px）、横向内边距（12px）与（1px）中性边线区分最终回答。外层过程下方留白（14px），标题下方（4px），用量上方（6px）；最终答案仍使用主要正文色并保持独立阅读。

会话配置占满宿主给定高度，最大宽（1080px），桌面内边距（32px 28px 0）；分类列宽（180px），与内容间距（44px）。页头与底部操作不参与中间区域的纵向滚动，分类和当前内容共用中间滚动区域；底栏通过细线分隔并始终保留保存状态、恢复默认和保存操作。视口不大于（680px）时内边距为（24px 16px 0），布局改为单列、间距（24px），四个分类排为两列，标签可换行、最小高度（44px）；底栏状态独占一行，两个操作均分下一行。开关行桌面间距（24px）、窄屏（16px），文字自然换行；模型选择最大宽（480px），搜索和选择最小高度（44px）。

## Elevation & Depth

SDK 没有 box-shadow。页面以背景色、细边框（1px）和空间分区表达层级；用户消息拥有轻底色，助手回复直接排在工作面上。默认悬浮挂载的 `zIndex` 为 1000，移动模态使用浏览器 top layer。这里的覆盖层是交互位置，不是投影装饰。

**The Flat Record Rule.** 记录通过文字、细线和语义底色组织，沿用当前没有投影的组件语言。

对话打开时仅有短促出现动画：`motionMs`（默认 160ms），曲线 `cubic-bezier(.16,1,.3,1)`，从向下偏移（8px）和不透明度（0.7）过渡到原位及完全不透明。`prefers-reduced-motion: reduce` 关闭该动画。按钮悬停直接变化背景或亮度，没有额外过渡 Token。

过程内层摘要箭头使用（140ms）展开旋转，外层箭头直接切换方向。支持 `interpolate-size: allow-keywords` 时，原生内外层 details 渐进增强为高度与可见性（180ms）、透明度（120ms）的开合过渡；其余浏览器保留原生即时开合。当前活动标题前的（6px）语义色圆点以（1.6s）脉动，仅在过程可见且文档前台时运行；离屏或后台暂停。减少动态效果时关闭脉动与开合过渡。流式文字末尾的细条是静态接收状态标记，不表示未收到的文字或进度。

## Shapes

workbench 皮肤使用前置 control / message / panel 圆角；rounded 只替换这三个半径及 space，不改变组件层次。入口保持圆形，移动全屏面板始终直角。控件边界用细线，文字较长的消息自然换行。

图片预览与代码块使用固定 media 圆角，代码复制和历史图片重读的小按钮使用 inset 圆角；它们不跟随皮肤的三项可变半径。Markdown 引用以中性边线区分正文，不引入装饰卡片。

图标由 [原子组件](src/atoms/index.ts) 独立编写的 SVG 路径绘制：viewBox（24×24）、描边（1.75）、圆端点和圆连接，默认无填充、跟随 currentColor；普通图标显示（20×20px），入口图标（26×26px）。图标对辅助技术隐藏，按钮提供名称。SDK 不附带装饰位图；用户图片是对话内容，review PNG 与合成演示图片是验收证据，不是品牌素材。

过程行沿用这套描边路径，按模型、思考、工具、Skill、知识、记忆与状态类别显示（18×18px）图标，展开箭头为（14×14px）。内层摘要沿用 inset 圆角；等待问题沿用 media 圆角。现有 Markdown 引用的（3px）中性左边线表达引用语义，属于已接受的阅读样式。

输入区的图片、麦克风、展开、设置和发送采用同一套（20×20px）原创描边 SVG。模型／Skill 选择器与不可用语音说明外框采用固定（6px）圆角，输入设置面板采用固定（8px）圆角；输入色面继续跟随 panel 圆角。设置面板通过 canvas、border 和局部覆盖层级（z-index 2）区分，不添加投影。

会话配置以整行 label 包裹原生 checkbox（role="switch"），开关固定为（42×24px）、圆角（12px），圆形滑块（16px）；整行上下内边距（18px）提供文字与操作空间。搜索框、模型选择和运行提示沿用 control 圆角；项目之间采用（1px）细分隔线，没有新增卡片、投影、字体或图像资产。

## Components

### Tokens 与主题

`primitiveColors` 定义基础颜色，`lightColors` / `darkColors` 赋予语义，`layoutTokens` 定义尺寸，`skins` 提供几何变体。`applyChatTheme()` 把解析结果写为挂载 host 上的 `--ae-chat-*` 自定义属性，设置 `color-scheme` 并监听系统主题；`updateTheme()` 原地更新样式，保留会话、草稿和选择状态。

覆盖值必须是有限、非负数；正文不得小于（14px）、小字不得小于（12px）、控件高度不得小于（44px）、面板不得小于（300×320px）、窗口断点不得小于（320px），动画不得超过（1000ms）。这描述当前 API 校验边界，不能替代对宿主尺寸的实际检查。

### 原子组件

- **按钮**：`createButton()` 提供 primary、secondary、quiet，默认 secondary。最小高度来自 `controlHeight`（默认 44px），主按钮使用 accent / onAccent；次按钮使用 canvas / text；安静按钮背景和边框透明。图标按钮为正方形，并设置 `aria-label` 和 title。
- **悬停与禁用**：次按钮和安静按钮悬停使用 surface 与 accentText 边框；主按钮和入口降低亮度（0.93）。禁用按钮使用 disabledBackground / disabledText / border，停止指针提示。
- **输入与状态**：`createTextInput()` 创建包含隐藏文字标签的 textarea；`createStatus()` 创建 `role="status"` 的次级文字。焦点统一使用 focus 色轮廓（3px）及外偏移（3px），文本选区使用 userBackground / userText。forced-colors 下按钮、入口和对话使用系统 ButtonText 边框。

### 业务组件

- **消息与时间线**：`createMessage()` 接收 sender / name / text 与可选 streaming；用户文字经 textContent 输出、靠右并有底色，助手回复通过 `createStreamingMarkdown()` 与 `updateMarkdown()` 更新受限 DOM。`createMessageTimeline()` 接收 Run 列表，按 Run 身份更新既有节点，展现当前文本草稿和明确的运行状态，并通过注入的 `readImage` 回调读取附件预览。消息的 destroy 清理逐帧更新与偏好监听，直接复用低层组件时由调用者在卸载时调用。
- **Markdown 与代码**：支持段落、强调、删除线、列表、标题、引用、表格、行内代码和代码块；HTML、远程 Markdown 图片及不支持的标记作为惰性文本，不执行也不加载远程图片。链接仅保留无用户名密码的 HTTP(S)，新标签页打开。代码头展示围栏标签或“代码”，复制操作使用原始代码文字，成功显示“已复制”，失败提示选择代码；没有语法高亮。代码区和表格自行横向滚动，不能把消息区撑宽。
- **执行详情**：`createRunDetails()` 使用原生 details / summary 折叠，显示 Token、输入/输出、用量与费用估算是否完整、模型请求数、步骤数、操作执行与校验状态。未知用量显示破折号，不把缺失值画成零；失败和待核验有明确文案。
- **有序处理过程**：`createRunProcess()` 使用原生外层 details / summary 和有序列表。首次活动时自动展开，终态默认收起；用户已主动查看且未主动收起时保持展开，历史可以再次展开。记录只按公开投影的服务器顺序呈现实际活动，包含阶段说明、工具与已开放的公开思考。活动标题优先显示当前进行中或等待阶段；终态有思考条目时显示“思考与处理过程”，否则显示“处理过程”。已完成的排队／模型请求从主要过程隐藏，在执行详情中保留真实状态与时长。最终回答保持在外层 disclosure 之后，不随过程收起，也不被重复的完成状态挤占。
- **过程摘要与阅读连续性**：工具有公开输入或结果摘要时才提供内层 details，初始收起，文字经 textContent 显示。思考条目有独立 details 与受限 Markdown 正文，活动中首次收到正文时展开，其后保留用户开合选择。更新同一活动时复用原 details、summary 和正文节点，保留展开状态、正文焦点及 scrollTop；具名正文使用 `tabIndex=0`、`role="region"`。摘要悬停使用 surface；标题、摘要与正文的可见焦点为 focus 色（2px）轮廓、外偏移（2px）。缺少摘要的活动仍可用文字状态阅读。
- **过程时间、用量与等待**：外层显示服务器累计活动时间；只有运行中才按秒补充计时，最近一次观测后最多延长（3 秒），暂停或终态不继续增长。页脚在 disclosure 外显示已上报 Token 与按币种列出的费用估算，标出待结算／不完整，不用缺失值拼出零。记录不完整时说明只展示当前可用部分。待处理输入同样位于外层之外，以可见标题提示等待确认或补充信息；宿主开放请求标识及解析回调时显示可提交的原生表单，状态区使用 `role="status"`。缺少这些条件才显示由接入方处理的说明，普通输入区保留停止本轮入口。
- **输入区**：`createComposer()` 接收 onDraft / onSend / onCancel、可选图片与 onModel / onSkill 回调，以及 sendShortcut。字符上限（8000），接近上限（7200）时展示计数；此前仅宽屏显示当前快捷键提示，脚注始终可见。保留原生 textarea、选区、撤销／重做与文本粘贴；就地展开复用同一输入节点并返回焦点，再次点击或 Escape 收起。空输入按 ↑ 找回当前会话最近一轮文字，只写入草稿，不重附图片。没有文字和图片、图片未全部上传就绪、待确认或不可发送时禁用发送，已上传图片允许单独发送。活动 Run 显示停止入口，停止请求期间显示等待状态。
- **发送与输入设置**：SDK 缺省 `mod-enter`，即 ⌘ / Ctrl + Enter 发送、Enter 换行；可选 `enter`，即 Enter 发送、Shift + Enter 换行。中文组合输入期间及结束后的（80ms）不触发快捷发送，按钮发送也需组合输入已结束。设置使用原生 details / summary 与 select，Escape 收起后焦点返回设置入口，点击外部收起。选择器、设置入口和不可用语音说明的键盘焦点使用 focus 色（2px）轮廓与（2px）外偏移；输入正文仍把（3px）轮廓画在完整输入色面上。
- **下一轮模型与 Skill**：原生选择器读取服务器实际公开目录，模型名称按真实配置附加“思考／图片”标记，title 解释能力并说明用于下一条消息；目录缺失时隐藏对应选择器。Skill 含“自动技能”，显式选择用于下一轮，受理后回到自动。活动 Run 期间可编辑下一条和修改选择；发送确认窗口及受理结果未明时冻结已提交内容与选择，重试沿用同一请求。图片能力随所选模型检查，有图片草稿时拒绝切到纯文本模型并保留草稿。刷新恢复最近一轮模型，未发送选择与快捷键偏好不跨页面保存。
- **不可用语音入口**：未接入 ASR 时麦克风按钮禁用，外层说明仍可键盘聚焦，以 title、可访问名称和 `role="note"` 解释“未接入语音识别服务”；沿用 disabledBackground / disabledText。它不申请麦克风权限，也不调用浏览器隐式识别服务。
- **图片队列**：`onImages` / `onRemoveImage` / `onRetryImage` 处理选择、粘贴／拖拽、移除与重试；PNG、JPEG、WebP、GIF 由隐藏的原生文件控件选择。每项使用真实本地预览，文字明确区分正在上传、失败和已就绪；移除／重试按钮采用紧凑字号（12px）、最小高度（36px）。未配置图片时隐藏添加入口，当前模型不支持视觉时禁用并提供说明，达到限制或正在发送／等待受理时同样禁用。限制从服务端配置读取，当前为单张（5 MiB）、每条（8 张）；这两个值不是皮肤 Token。
- **历史图片**：通过独立鉴权读取生成临时 Blob 预览，消息与普通事件只携带附件引用。读取时显示状态，失败保留“可能已过期或无权访问”的说明与“重新读取”，不以破图图标代替原因。时间线替换或销毁时中止读取、释放对象 URL；未发送图片不持久化到浏览器存储，切换会话或销毁控制器时释放草稿预览。
- **左侧会话列表**：`createSessionList()` 接收会话摘要及选择回调。条目整行可操作，标题最多两行，次行显示正在执行或所属助手；当前项用 `aria-current` 和选中底色，空列表有说明。更新条目时尝试恢复原会话按钮的焦点。发送待确认期间禁用选择；助手选择器只在多助手配置下显示，已创建会话时不可切换助手。
- **会话与工具详情**：`createSessionDetails()` 接收公开状态和面板类型。当前会话以键值列表显示标题、助手、状态、ID、创建时间、总轮数、配置版本及工具数；未创建时明确说明发送后生成。工具按细分隔线排列，显示公开名称、显式说明与权限类别；新会话预览所选助手配置，已有会话使用保存配置。活动 Run 的工具快照不同于当前配置时，另列本轮工具与 `activeConfigVersion`，不让新配置冒充正在执行的配置。未提供工具清单与空清单使用不同文案。
- **详情键盘路径**：面板打开后焦点进入关闭按钮，再按 Tab 可进入内容滚动区。滚动根节点为 `tabIndex=0`、`role="region"`，名称随“当前会话”或“已接入工具”变化；保留可见焦点。Escape 或关闭按钮返回对应工具栏入口，外层聊天继续打开。

工具详情仅使用服务器公开投影。标签和说明来自显式 `toolDisplay`，不会自动展示原始工具提示、参数 Schema、执行器或凭据；“只读／可写／需审批／已禁用”是说明，实际调用仍由服务端权限决定。

过程输入／结果摘要也由宿主显式开放，浏览器只接收经过投影和 Schema 校验的公开 DTO。公开思考只有模型 `thinking.expose`、宿主 `thinkingDisplay` 与 Engine 会话保留策略同时显式允许时才显示；`summary` 仅展示供应商实际提供的摘要，与 `content` 正文区分，服务端不能把模型关闭的展示升级为正文。未开放时显示状态说明，已开放但供应商未返回时说明没有可展示内容。原始事件、原生签名、遮蔽／加密续接块、未获公开授权的推理正文与凭据不属于展示数据；没有发生的阶段、没有启用的能力和未上报费用不能从图标或占位行补造。

业务组件接收数据和回调，不持有模型密钥或自建网络端点；时间线的图片 I/O 通过宿主注入的读取回调完成。页面组合负责对话记录滚动与面板开关，详情组件更新内容时保留当前滚动位置。文案可由 `ChatCopy` 覆盖公开字段；运行详情、图片和部分状态字符串目前仍在实现中固定为中文，不宣称完整国际化。

**The Received Text Rule.** 仅平滑呈现已经收到的文字，单次活动更新在约（220ms）内按字素分帧追上，终态收尾缩短至最多（100ms）；历史、重试撤回、后台页面和减少动态效果偏好立即显示目标文本。保留未变化的节点、焦点、选区与用户阅读位置，不补造思考或回答，不重放历史打字。

Markdown 增量更新复用未变化的段落、代码区与复制按钮，追加文字保留原文本节点，复制读取当前代码文字；保留正文选区、焦点及代码横向滚动。正文更新与内容尺寸观察只在用户原本跟随末尾时继续跟随；独立思考区也保留上翻位置。卸载清理逐帧更新、计时器、可见性观察器与偏好监听。约（450ms）的活动快照轮询仍存在，短缓冲不消除供应商首字延迟，也不新增 SSE、数学公式或代码语法高亮。

### 会话配置网页

四类为“工具”“Skill”“知识与记忆”“回答与上下文”。分类使用 tablist / tab / tabpanel 与当前项标记，方向键及 Home / End 切换并移动焦点；工具和 Skill 用具名原生搜索筛选，零结果给出调整名称的提示。开关标签同时呈现用途与权限原因，知识库与每个记忆存储的读取、写入分别排列；没有接入能力时显示空状态、禁用开关及宿主提供的接入文档。搜索焦点位于完整控件边界（2px 轮廓／2px 外偏移），其余控件沿用共享（3px）焦点。滑块只做（150ms ease-out）的位移，减少动态效果时直接切换。

顶部说明助手、当前会话和配置版本；有活动 Run 时显示“本轮继续使用原配置”的提示。修改进入草稿，底栏区分未保存与已保存；“恢复助手默认”先改草稿，再由“保存配置”提交。版本冲突和普通网络失败保留修改并提供重新载入，保存响应丢失先回读核对；读取期间显示“正在读取配置”，提交期间显示“正在确认保存结果”，不能把读取画成保存。归档会话只读，未保存离开使用浏览器原生提示。

记忆读取与写入分开控制，文字明确关闭读取不会删除已有记忆、聊天记录或已进入上下文的信息；需要新上下文时新建对话。默认模型受宿主目录限制，输入框的单轮选择优先；公开思考与自动整理只呈现宿主开放的开关，界面不暴露模型地址、密钥、记忆 namespace 或运行预算。

**The Confirmed Settings Rule.** 配置读取与保存使用不同状态文案；明确失权（401／403）或宿主关闭配置能力后清除旧目录和草稿、禁用编辑与保存，只有成功重新读取当前会话配置后才恢复。

IM 页头的“配置”使用带新标签页说明的同源链接，宿主须显式开放 `settings: true` 并提供 `settingsUrl`；首条消息前打开只创建空会话，保留输入草稿。`mountChatSettingsPage` 在独立 Shadow Root 挂载，复用主题、HTTP transport 和公开样式；宿主提供明确高度，卸载时清理请求及离开提示。

### 页面组合、挂载与生命周期

`createChatPage()` 把组件连接到 `ChatController`，负责连接状态、助手选择、新会话、左栏、详情、反馈、焦点和滚动。页头提供侧栏切换、“当前会话”和“工具 N”，左栏提供“新对话”；左栏收起时页头提供新对话图标；没有公开清单时不猜测数量。工具栏入口以 `aria-controls`、`aria-expanded` 连接详情面板，打开项使用选中底色。用户距记录末尾小于（64px）时跟随新内容；用户上翻时保留位置并立即显示“回到最新消息”，无需等下一次快照变化；主动发送（包括重试）重新跟随最新一轮，发送后再次上翻仍保留阅读位置。新会话从欢迎标题顶部开始。错误区使用 `role="alert"`，根据状态显示重试发送、结束重试、重新连接；等待宿主输入或核验保持明确状态。

`mountChatPage(target, options)` 与 `mountChatWidget(options)` 均创建开放 Shadow Root 并安装同一套样式。共享样式以 `:host { all: initial }` 重置继承起点，再应用语义字体和颜色；优先使用 adoptedStyleSheets，回退 style 标签可接收 `styleNonce`。低层组件单独复用时，应在自己的 Shadow Root 中调用 `installChatStyles()`，并对 host 调用 `applyChatTheme()`。

悬浮入口通过 `aria-controls`、`aria-haspopup` 与 `aria-expanded` 描述对话关系。打开后入口隐藏、输入框获得焦点；关闭或 Escape 返回入口焦点。移动端的焦点范围由原生模态对话保护。关闭仅收起界面，不取消服务端 Run；停止由显式控制操作发起。

挂载返回 ready、controller、主题更新及销毁接口；widget 另有 open / close / toggle，page 提供 focus。默认每次挂载创建独立控制器；显式传入 controller 才共享状态，调用者拥有该控制器的释放责任。destroy 可重复调用，移除页面、监听器、主题订阅和挂载节点；内部创建的控制器同时释放，`clearSession` 可清理其会话记忆。宿主提供外部控制器时需自行完成释放或清理，卸载不承诺取消已受理任务。

### 回答引用与宿主停靠

ChatPageOptions / ChatMountOptions 接受可选 getRunSources(run) 同步回调；createMessageTimeline(copy, options) 同样可用。只为已完成回答解析链接，最多八项，标签作为 textContent。仅 HTTP(S) 且不含用户名密码的 URL 可展示，默认新标签页打开并带 noopener noreferrer；回调抛错不会中断时间线。宿主负责引用来源与授权校验，SDK 不把模型字符串当 HTML。

Widget 的原生 dialog 暴露 part="panel"，宿主可以用 [data-agent-chat]::part(panel) 调整外部位置和几何，优先通过 theme.tokens 配置尺寸与响应断点。不要改写 SDK 内部类名或破坏移动模态行为。

本次事实合并依据共享 Token、样式、Markdown、输入、时间线、控制器与服务端公开投影。2026-09-12 的文档宿主本地 `scenario-finish-review.md` 结论为 `ship`，审查五张供应截图及所列源码；其中 `chat-images-desktop.png` 和 `chat-images-mobile.png` 展示成功图片预览、队列与助手代码。失败／重试、剪贴板和键盘路径在该终审中仅确认源码，不视为独立交互或安全测试。较早侧栏终审及测试数量保留为历史证据，准确验证范围见 [前端 SDK 验收说明](../../docs/frontend-sdk-acceptance.md) 与 [文档站验收说明](../../examples/docs-site/ACCEPTANCE.md)。本次文档合并未重跑浏览器、检测器或 Provider；本地报告和截图受 Git 忽略，移动视觉证据限于 Chromium 视口。

2026-09-12 处理过程追加合并依据 [过程组件](src/components/process.ts)、[时间线](src/components/message.ts)、共享样式与公开过程投影，采用代码主导的现有设计细化，没有新增已批准的视觉稿。终审交接确认自定义品牌色的状态／焦点与更新时详情焦点／滚动两项修复已解决，复核结论为 `ship`，范围限于这两项修复。供应证据位于文档宿主 `.impeccable/review/` 的 `process-running-desktop.png`、`process-running-mobile.png`、`process-completed-desktop.png`、`process-completed-mobile.png`、`process-expanded-desktop.png`、`process-waiting-mobile.png`、`process-custom-accent-desktop.png` 和 `process-detail-continuity-mobile.png`；后者对应焦点与（150px）内部滚动穿过真实完成更新的交互断言。文档合并查看了展开桌面与详情连续性手机截图、核对了实现，没有重新执行这些交互或 Provider 验证。

2026-09-12 输入区追加合并依据 [输入组件](src/components/composer.ts)、共享样式、[页面组合](src/pages/page.ts) 与 [输入对齐说明](../../docs/composer-alignment.md)，保留既有工作台身份。供应截图位于文档宿主 `.impeccable/review/`：`composer-desktop.png`、`composer-dark.png`、`composer-mobile.png`、`composer-compact-settings.png`。新终审复核为 `ship`，仅确认 F1 手机选择器文字裁切已通过换行修复，不代表整个界面再次通过终审。机械扫描没有新增输入区发现，仅保留范围外既有 Markdown 中性引用边线提示。文档合并核对源码并查看手机与紧凑设置截图，未重跑浏览器或 Provider；功能与本地真实模型验证见验收分轮记录，不宣称线上 WorkBuddy、iOS 真机软键盘或 ASR 已验证。

2026-09-12 回复展示追加合并依据 [过程](src/components/process.ts)、[消息](src/components/message.ts)、[Markdown](src/components/markdown.ts)、[短缓冲](src/components/streaming.ts)、共享样式与页面组合，以及 [回复展示说明](../../docs/reply-display-alignment.md)。这是现有白色／蓝灰开发工具界面的 Operate 细化，没有新视觉世界或视觉稿。新独立终审结论为 `ship`，范围为五张供应截图及抽查代码，未发现需要实质 UI 修复的问题。截图位于文档宿主 `.impeccable/review/`：`reply-thinking-desktop.png`、`reply-thinking-mobile.png`、`reply-tool-dark.png`、`reply-completed-desktop.png`、`reply-completed-mobile.png`。本次文档合并已查看五图并核对实现；交接的确定性 Engine／HTTP／Chromium 验证通过有界逐帧与字素、代码节点／复制／焦点连续性、滚动跟随、减少动态效果、刷新与卸载检查。本次文档工作未重跑交互或真实供应商，终审不等于真实供应商行为、线上 WorkBuddy 或 iOS 真机认证；新增真实供应商证据仅以 [文档站验收记录](../../examples/docs-site/ACCEPTANCE.md) 为准。私有报告与截图继续保持 Git 忽略。

2026-09-12 会话配置追加合并以已实现的设置页面、共享样式、IM 入口与文档宿主为依据，沿用既有工作台设计，没有新视觉稿、种子或图像资产。独立终审首次要求修复 F1 明确失权后仍保留旧目录／可编辑状态、F2 读取期间误用保存文案；两项已复核为 resolved，disposition 为 `ship`，结论仅覆盖这两项修复，不表示重新批准整个界面。九张供应截图位于文档宿主 `.impeccable/review/`：`settings-tools-desktop.png`、`settings-tools-mobile.png`、`settings-memory-desktop.png`、`settings-memory-mobile-dark.png`、`settings-skills-desktop.png`、`settings-empty-mobile.png`、`settings-response-desktop.png`、`settings-loading-desktop.png`、`settings-access-mobile.png`。本次文档合并查看了桌面工具、深色手机记忆与手机失权三张代表图，并核对源码；这些较早截图只证明当时的配置演示状态；当前标准文档宿主的 Skill、知识库与记忆接入事实见能力工作台补充。

交接验证为 `pnpm check`（33 文件／162 项，含真实 PostgreSQL 与故障测试）、文档（25 篇／33 组）、聊天（20 组）通过；配置专项通过真实 Engine／HTTP、确定性模型与 Chromium 验证打开空会话、草稿保留、保存、版本冲突、丢失响应核对和授权恢复，并生成上述九图。一次机械扫描中的配置标题字号提示由本规范记录实际层级；其余为既有 Markdown 中性引用边线与回复高度过渡提示，没有据此修改范围外样式。本次文档工作未重跑浏览器、检测器或供应商，不宣称真实供应商、线上 WorkBuddy 全功能或手机操作系统验证；私有截图与日志继续保持 Git 忽略。

实现详见 [设置页面](src/pages/settings.ts)、[IM 页面](src/pages/page.ts)、[共享样式](src/styles.ts) 与 [会话配置说明](../../docs/chat-settings.md)。验证分轮记录见 [文档站验收记录](../../examples/docs-site/ACCEPTANCE.md)。

### 原生待处理输入与宿主能力扩展

`createPendingInput(resolveInput?)` 经 `createRunProcess`、时间线与页面组合接入控制器；宿主声明 interaction 后才能提交安全投影中的请求。问题使用文本框；最多二十个简单对象字段按 string／enum／boolean／number／integer 映射为 textarea、select、checkbox 或 number input，复杂 schema 使用具名 JSON 输入。权限请求显示宿主安全预览与“不允许／允许这一次”，问题和表单显示“提交并继续”；服务端继续校验权限与答案。

请求标识、类型、问题、预览及 schema 未变时保留原生表单节点和草稿。提交时禁用字段与动作并显示正在提交；成功显示已提交并等待继续，错误保留输入供修正，过期明确提示。预览保留换行与长串折行，缺少请求标识或回调时仅显示由接入方处理的说明。组件不添加网络端点，也不为宿主自动启用能力。

待处理区沿用 process-pending 的 surface 色面、边界、media 圆角与内边距；字段纵向排列、上下外边距（14px）、标签间距（8px），输入内边距（10px）、最小高（44px），采用 canvas／text／border 与 control 圆角。字段文字固定（16px）、沿用当前行高，状态文字（13px）；textarea 最小高（90px），允许纵向调整，checkbox 为（24px）。操作区顶部留白（16px）、间距（8px）并换行。字段焦点采用 accentText（2px 轮廓／3px 外偏移），按钮沿用原子组件焦点；没有新色板、阴影或动效。

文档宿主能力工作台采用四个原生锚点导航、平整能力行、记忆记录、十三项真实 SDK 实验和身份范围内的会话调试。其（17px）小标题是本轮新增且被检测器提示的字号台阶，记录在 [文档站设计规范](../../examples/docs-site/DESIGN.md) 的 capability-subheading；不新增到共享聊天字号表。主宿主使用 PostgreSQL，实验每次使用隔离 MemoryStore 和合成模型／数据，报告存回宿主；这些导航、宽度与实验布局不成为通用 Chat UI 页面契约。宿主记忆采用用户确认、加密、版本 CAS、无内容 tombstone 和到期清理；401 清空身份内容并阻止迟到响应，403 清理被拒记录，删除／取消确认／归档后恢复焦点。

2026-09-12 合并依据 [待处理输入](src/components/pending-input.ts)、[过程](src/components/process.ts)、[页面](src/pages/page.ts)、[共享样式](src/styles.ts) 与文档宿主能力代码，沿用原工作台的 Operate 设计，没有新视觉稿。标准宿主已声明八个只读工具（六个 binding、实际本地 HTTP 目录与 Streamable HTTP MCP 检索）、inline integration-guide、版本／hash 固定的 loader troubleshoot、正式 KnowledgeBase manual 与跨 Session 偏好记忆；SDK 不默认安装这些能力。文档同步对应能力终审 F3，最终修复复核结论见 [验收记录](../../examples/docs-site/ACCEPTANCE.md)。

文档合并查看了能力总览桌面、深色手机记忆、手机表单及桌面审批四张供应截图。交接验证为 38 文件／192 项（含独立 PostgreSQL 与崩溃测试；全量源码检查显式排除并行任务的 .local 验证副本），十二张确定性浏览器截图、六次合成对话请求且无浏览器错误；另有已授权真实供应商四个 Run 验证记忆审批写入后新 Session 回读、两项 Skill、KnowledgeBase、HTTP 与 MCP，标准启动器重启后的 PostgreSQL 记忆回读也已通过。文档工作未重跑浏览器、检测器或供应商；互动实验不代表完整供应商／崩溃验证，私有截图与记录保持 Git 忽略。既有 contextRef 与 contextBar 的可信上下文职责继续按 [页面上下文契约](../../docs/chat-context.md) 实施，不因待处理表单而自动将上下文放入模型提示词。

## Do's and Don'ts

### Do:

- **Do** 从语义 Token 取色，并通过主题解析器应用品牌色与皮肤。
- **Do** 让 Token、原子组件、业务组件和页面保持现有职责，业务组件接收数据及回调。
- **Do** 为 inline 容器提供明确尺寸，在宿主真实布局中验证容器与窗口响应。
- **Do** 保留文字状态、用量完整性、可见焦点、输入法保护和用户上翻位置。
- **Do** 保留左栏当前项、详情滚动区的键盘入口、关闭后的焦点返回，以及当前配置与本轮工具快照的区别。
- **Do** 在宿主卸载或退出登录时清理挂载，并按控制器归属管理会话记忆。
- **Do** 将库存工作台与组件展廊标明为示例，保留合成数据的性质。
- **Do** 保留图片完整比例、明确上传状态与恢复操作，按服务端配置显示可用动作。
- **Do** 按真实顺序展示处理过程，保留主动展开、键盘焦点和详情内部滚动，把最终回答、用量与待处理问题留在外层折叠之外。
- **Do** 保留原生编辑节点、中文输入法保护、输入焦点和选区，让窄屏模型／Skill 选择器以可读字号换行。

- **Do** 保留公开思考、供应商摘要、工具和最终回答的独立层级；短缓冲更新保持代码、复制、焦点、选区及上翻阅读位置。

- **Do** 保留配置分类、读写记忆的独立开关、未接入原因和始终可见的保存状态，让当前会话与后续发言的作用范围明确可读。

- **Do** 让待处理表单留在过程折叠之外，保留同一请求的原生输入、明确提交状态及服务端授权边界。

### Don't:

- **Don't** 把接入示例的导航、库存表或业务内容提升为 SDK 的通用组件契约。
- **Don't** 通过 SDK 主题修改宿主或现有 Playground、Debug 的视觉身份。
- **Don't** 给当前平整记录新增投影卡片层级、位图头像或装饰性素材。
- **Don't** 把收起、卸载或结束重试描述为已取消服务端任务。
- **Don't** 把缺失用量、未知执行结果或降级检测输出表示为已验证成功。
- **Don't** 将模型文字作为 HTML 注入、自动加载 Markdown 外链图片，或让展示组件直接处理模型密钥。
- **Don't** 把未提供工具清单显示为零，或从原始配置自动暴露工具提示、Schema 和执行器细节。
- **Don't** 把未发送图片写入持久化草稿，或把无权读取／到期图片伪装成可用预览。
- **Don't** 把私有推理或原始工具载荷用作过程摘要，补造未发生的步骤、进度或费用，或在缺少宿主请求标识与解析回调时显示可提交的审批动作。
- **Don't** 用可点击占位动作暗示未接入的语音或附件能力，也不为容纳工具栏而裁切正常选择名称或缩小窄屏选择器字号。
- **Don't** 把未获授权的推理、原生签名或遮蔽块当作公开思考，也不补造未收到的文本、重放历史打字或持续播放离屏状态动画。
- **Don't** 将读取配置显示为保存、把明确失权后的旧目录留作可编辑内容，或用开关暗示能够扩大宿主权限、删除聊天记录和追改活动 Run。
