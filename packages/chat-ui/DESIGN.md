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
  detail-note:
    fontSize: "13px"
    lineHeight: 1.75
  panel-title:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.6
  history-title:
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  identifier:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.7
rounded:
  control: "6px"
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
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    typography: "{typography.input}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
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

来源为 [Token](src/tokens/index.ts)、[共享样式](src/styles.ts)、[原子组件](src/atoms/index.ts)、[业务组件](src/components/index.ts) 和 [页面](src/pages/index.ts)。方向来自 [接入示例](../../examples/embedded/index.html) 的首个 body 注释及 [PRODUCT.md](PRODUCT.md)，没有替换现有 Playground 或 Debug 的设计。

本次合并依据共享样式、页面、会话列表与详情组件，以及文档宿主的侧栏终审记录。初审发现工具滚动区缺少明确键盘入口；修正为可聚焦且具名的 region 后，复核结论为 `ship`，仅覆盖该项已评分修复。审查记录接受九张当前截图：`widget-sidebar.png`、`widget-tools.png`、`ai-session-details.png`、`ai-tools.png`、`ai-tools-dark.png`、`mobile-sidebar.png`、`mobile-tools.png`、`ai-320.png`、`ai-desktop.png`，均位于文档宿主的 `.impeccable/review/`。

本轮验证记录为类型检查、构建、14 项后端／控制器测试、28 组文档站验证及 19 组 SDK 浏览器验证通过。侧栏检测器本轮只运行一次，三个 advisory 均涉及有意采用的 13／14px 字级，现已记录其用途；这不等于完整无障碍或计算样式对比度审计。本文同步未重跑浏览器或检测器，移动证据限于 Chromium 视口；较早的六张首版截图与供应商验证保留在公开验收说明的历史记录中。

本地审查报告和截图被 Git 忽略，克隆仓库不包含这些材料。可交付的行为说明与复现入口见 [公开验收/使用说明](../../docs/frontend-sdk-acceptance.md)。

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

**The Semantic Color Rule.** 新组件从语义 Token 取色；品牌色变化保留正文、错误、选中和禁用状态的独立角色。

当前解析器校验正文与次级文字对 canvas / surface、onAccent 对 accent、userText 对 userBackground，以及 danger 对 canvas 的文字对比度（至少 4.5:1）。[主题契约测试](../../tests/contract/chat-core.test.ts) 覆盖两种模式、两种皮肤及五个品牌色样本；它不等于所有任意覆盖组合的完整无障碍认证。源码没有色阶 Token，sidecar 不合成未使用的色阶。

## Typography

采用系统无衬线字体栈，SDK 没有远程字体或展示字体。会话 ID 与工具名称使用本机等宽字体，便于辨认标识符。标题通过字号和字重建立层级，正文保留足够行距阅读长回复；字体不承担营销式表达。

| 前置 Token 角色 | 用途                                   |
| --------------- | -------------------------------------- |
| headline        | 空会话欢迎标题                         |
| title           | 对话页头部标题                         |
| body            | 页面正文和助手选项                     |
| history-title   | 左侧会话条目的两行标题                 |
| message         | 保留换行的用户与助手文本               |
| label           | 发送者、状态、执行详情、字符计数和脚注 |
| input           | 多行输入框，触屏下保持明确可读的字号   |
| button          | 主、次、安静按钮的操作文字             |
| toolbar         | 新对话、当前会话和工具数量入口         |
| detail-note     | 配置说明和工具描述                     |
| panel-title     | 左侧列表与右侧详情面板的标题           |
| identifier      | 会话 ID 和工具名称                     |

`fontFamily`、`fontSize` 与 `smallFontSize` 可通过主题覆盖；欢迎标题、页标题、输入、工具栏和详情说明字号当前由共享样式固定。错误反馈采用与 detail-note 相同的字号，沿用页面行高。工具标题为 15px、字重 650，权限类别使用 label。字符计数使用等宽数字；消息、标识符和工具描述允许长串在任意位置换行。会话列表标题最多两行，完整标题保留在按钮的 title 属性。欢迎说明与每轮记录宽度上限（720px），输入区含内边距上限（760px）。

## Layout

页面根节点是占满挂载容器高度的横向 flex 结构，左侧会话列表与右侧主区域并排。根容器宽度达到（760px）时，左栏默认常驻、宽（232px），可从主区域页头的图标收起；左栏含一个列表标题、新对话按钮、多助手时才显示的选择器，以及占据剩余高度、独立滚动的会话列表。列表组件自身的标题在侧栏组合中隐藏，避免重复标题。主区域保持纵向结构：合并操作入口的页头、主体；主体中的记录、反馈和输入区沿纵向排列，只有记录区独立滚动。宿主需为 inline 容器提供实际高度，SDK 不接管宿主页面的栅格。

根容器小于（760px）时，左栏默认收起，展开后覆盖在页面左侧，宽度为 `min(280px, 100% - 32px)`。关闭按钮、遮罩和 Escape 均可收起；此时主区域 inert，Tab 在侧栏内循环，关闭或选择会话后焦点返回页头入口。右侧详情定位在主区域的主体内，宽度为 `min(360px, 100%)`，不覆盖页头；打开时对话部分 inert，背景遮罩表达当前操作范围。主区域宽度小于（480px）时，详情铺满主体宽度。

默认 `space` 决定头部和主要区域的横向内边距；rounded 皮肤使用 `rounded-space`。页头纵向内边距（8px）、最小高度（64px），记录区纵向采用 large；窄主区域页头为两行网格，标题与连接状态同行，下行放操作，记录区纵向内边距回到 space。每轮记录底部间隔（28px），同轮消息之间（16px）。输入框最小高度（60px）、最大高度（144px），允许纵向调整。

悬浮入口默认在视口右下角，右侧留白（24px），底部留白为 `max(24px, env(safe-area-inset-bottom))`；`position: "left"` 可改到左侧。入口尺寸见前置 `launcher` Token。桌面对话默认宽高（420×680px），位于右侧（24px）、底部（92px）；实际宽度为 `min(panelWidth, 100vw - 32px)`，高度为 `min(panelHeight, visualViewportHeight - 116px)`。

在窗口宽度不大于 `breakpoint`（默认 600px）时，对话使用原生 modal dialog 占满可见视口，去掉外框和圆角，跟随 `visualViewport` 的高度及顶部偏移。桌面使用非模态原生 dialog，宿主可继续操作。输入区底部保留安全区。

页面自身另有主区域响应阈值（小于 480px）：隐藏键盘快捷键提示及工具栏图标、收紧头部和记录区纵向留白。`ResizeObserver` 观察页面根宽度，并按主区域实际宽度设置窄布局；它与窗口是否移动模式分别处理。窗口和容器阈值记录于 sidecar；文档宿主显式配置的（440px）停靠助手和接入示例导航栅格均不属于 SDK 默认尺寸。

**The Container Boundary Rule.** 页面适应被分配的容器；悬浮挂载只通过入口和对话接收指针事件，普通宿主区域保持可操作。

## Elevation & Depth

SDK 没有 box-shadow。页面以背景色、细边框（1px）和空间分区表达层级；用户消息拥有轻底色，助手回复直接排在工作面上。默认悬浮挂载的 `zIndex` 为 1000，移动模态使用浏览器 top layer。这里的覆盖层是交互位置，不是投影装饰。

**The Flat Record Rule.** 记录通过文字、细线和语义底色组织，沿用当前没有投影的组件语言。

对话打开时仅有短促出现动画：`motionMs`（默认 160ms），曲线 `cubic-bezier(.16,1,.3,1)`，从向下偏移（8px）和不透明度（0.7）过渡到原位及完全不透明。`prefers-reduced-motion: reduce` 关闭该动画。按钮悬停直接变化背景或亮度，没有额外过渡 Token。

## Shapes

workbench 皮肤使用前置 control / message / panel 圆角；rounded 只替换这三个半径及 space，不改变组件层次。入口保持圆形，移动全屏面板始终直角。控件边界用细线，文字较长的消息自然换行。

图标由 [原子组件](src/atoms/index.ts) 独立编写的 SVG 路径绘制：viewBox（24×24）、描边（1.75）、圆端点和圆连接，默认无填充、跟随 currentColor；普通图标显示（20×20px），入口图标（26×26px）。图标对辅助技术隐藏，按钮提供名称。交付界面没有位图资产；review PNG 是验收证据，不是产品素材。

## Components

### Tokens 与主题

`primitiveColors` 定义基础颜色，`lightColors` / `darkColors` 赋予语义，`layoutTokens` 定义尺寸，`skins` 提供几何变体。`applyChatTheme()` 把解析结果写为挂载 host 上的 `--ae-chat-*` 自定义属性，设置 `color-scheme` 并监听系统主题；`updateTheme()` 原地更新样式，保留会话、草稿和选择状态。

覆盖值必须是有限、非负数；正文不得小于（14px）、小字不得小于（12px）、控件高度不得小于（44px）、面板不得小于（300×320px）、窗口断点不得小于（320px），动画不得超过（1000ms）。这描述当前 API 校验边界，不能替代对宿主尺寸的实际检查。

### 原子组件

- **按钮**：`createButton()` 提供 primary、secondary、quiet，默认 secondary。最小高度来自 `controlHeight`（默认 44px），主按钮使用 accent / onAccent；次按钮使用 canvas / text；安静按钮背景和边框透明。图标按钮为正方形，并设置 `aria-label` 和 title。
- **悬停与禁用**：次按钮和安静按钮悬停使用 surface 与 accentText 边框；主按钮和入口降低亮度（0.93）。禁用按钮使用 disabledBackground / disabledText / border，停止指针提示。
- **输入与状态**：`createTextInput()` 创建包含隐藏文字标签的 textarea；`createStatus()` 创建 `role="status"` 的次级文字。焦点统一使用 focus 色轮廓（3px）及外偏移（3px），文本选区使用 userBackground / userText。forced-colors 下按钮、入口和对话使用系统 ButtonText 边框。

### 业务组件

- **消息与时间线**：`createMessage()` 接收 sender / name / text；用户消息靠右并有底色，助手回复为平整文字。`createMessageTimeline()` 接收 Run 列表，按 Run 身份更新既有节点，展现当前文本草稿和明确的运行状态。内容经 textContent 输出；当前没有 Markdown、HTML、附件或富媒体渲染。
- **执行详情**：`createRunDetails()` 使用原生 details / summary 折叠，显示 Token、输入/输出、用量与费用估算是否完整、模型请求数、步骤数、操作执行与校验状态。未知用量显示破折号，不把缺失值画成零；失败和待核验有明确文案。
- **输入区**：`createComposer()` 接收 onDraft / onSend / onCancel 回调。字符上限（8000），接近上限（7200）时展示计数；此前仅宽屏显示快捷键提示。输入和发送操作放在同一边界内，支持按钮发送及 ⌘ / Ctrl + Enter，输入法组合期间不发送；空白、待确认或不可发送时禁用发送。活动 Run 显示停止入口，停止请求期间显示等待状态。
- **左侧会话列表**：`createSessionList()` 接收会话摘要及选择回调。条目整行可操作，标题最多两行，次行显示正在执行或所属助手；当前项用 `aria-current` 和选中底色，空列表有说明。更新条目时尝试恢复原会话按钮的焦点。发送待确认期间禁用选择；助手选择器只在多助手配置下显示，已创建会话时不可切换助手。
- **会话与工具详情**：`createSessionDetails()` 接收公开状态和面板类型。当前会话以键值列表显示标题、助手、状态、ID、创建时间、总轮数、配置版本及工具数；未创建时明确说明发送后生成。工具按细分隔线排列，显示公开名称、显式说明与权限类别；新会话预览所选助手配置，已有会话使用保存配置。活动 Run 的工具快照不同于当前配置时，另列本轮工具与 `activeConfigVersion`，不让新配置冒充正在执行的配置。未提供工具清单与空清单使用不同文案。
- **详情键盘路径**：面板打开后焦点进入关闭按钮，再按 Tab 可进入内容滚动区。滚动根节点为 `tabIndex=0`、`role="region"`，名称随“当前会话”或“已接入工具”变化；保留可见焦点。Escape 或关闭按钮返回对应工具栏入口，外层聊天继续打开。

工具详情仅使用服务器公开投影。标签和说明来自显式 `toolDisplay`，不会自动展示原始工具提示、参数 Schema、执行器或凭据；“只读／可写／需审批／已禁用”是说明，实际调用仍由服务端权限决定。

业务组件只接收数据和回调，没有网络请求。页面组合负责对话记录滚动与面板开关，详情组件更新内容时保留当前滚动位置。文案可由 `ChatCopy` 覆盖公开字段；运行详情及部分状态字符串目前仍在实现中固定为中文，不宣称完整国际化。

### 页面组合、挂载与生命周期

`createChatPage()` 把组件连接到 `ChatController`，负责连接状态、助手选择、新会话、左栏、详情、反馈、焦点和滚动。页头提供侧栏切换、“当前会话”和“工具 N”，左栏提供“新对话”；左栏收起时页头提供新对话图标；没有公开清单时不猜测数量。工具栏入口以 `aria-controls`、`aria-expanded` 连接详情面板，打开项使用选中底色。用户距记录末尾小于（64px）时跟随新内容；用户上翻时保留位置并显示“回到最新消息”。新会话从欢迎标题顶部开始。错误区使用 `role="alert"`，根据状态显示重试发送、结束重试、重新连接；等待宿主输入或核验保持明确状态。

`mountChatPage(target, options)` 与 `mountChatWidget(options)` 均创建开放 Shadow Root 并安装同一套样式。共享样式以 `:host { all: initial }` 重置继承起点，再应用语义字体和颜色；优先使用 adoptedStyleSheets，回退 style 标签可接收 `styleNonce`。低层组件单独复用时，应在自己的 Shadow Root 中调用 `installChatStyles()`，并对 host 调用 `applyChatTheme()`。

悬浮入口通过 `aria-controls`、`aria-haspopup` 与 `aria-expanded` 描述对话关系。打开后入口隐藏、输入框获得焦点；关闭或 Escape 返回入口焦点。移动端的焦点范围由原生模态对话保护。关闭仅收起界面，不取消服务端 Run；停止由显式控制操作发起。

挂载返回 ready、controller、主题更新及销毁接口；widget 另有 open / close / toggle，page 提供 focus。默认每次挂载创建独立控制器；显式传入 controller 才共享状态，调用者拥有该控制器的释放责任。destroy 可重复调用，移除页面、监听器、主题订阅和挂载节点；内部创建的控制器同时释放，`clearSession` 可清理其会话记忆。宿主提供外部控制器时需自行完成释放或清理，卸载不承诺取消已受理任务。

## Do's and Don'ts

### Do:

- **Do** 从语义 Token 取色，并通过主题解析器应用品牌色与皮肤。
- **Do** 让 Token、原子组件、业务组件和页面保持现有职责，业务组件接收数据及回调。
- **Do** 为 inline 容器提供明确尺寸，在宿主真实布局中验证容器与窗口响应。
- **Do** 保留文字状态、用量完整性、可见焦点、输入法保护和用户上翻位置。
- **Do** 保留左栏当前项、详情滚动区的键盘入口、关闭后的焦点返回，以及当前配置与本轮工具快照的区别。
- **Do** 在宿主卸载或退出登录时清理挂载，并按控制器归属管理会话记忆。
- **Do** 将库存工作台与组件展廊标明为示例，保留合成数据的性质。

### Don't:

- **Don't** 把接入示例的导航、库存表或业务内容提升为 SDK 的通用组件契约。
- **Don't** 通过 SDK 主题修改宿主或现有 Playground、Debug 的视觉身份。
- **Don't** 给当前平整记录新增投影卡片层级、位图头像或装饰性素材。
- **Don't** 把收起、卸载或结束重试描述为已取消服务端任务。
- **Don't** 把缺失用量、未知执行结果或降级检测输出表示为已验证成功。
- **Don't** 将模型文字作为 HTML 注入，或让展示组件直接处理模型密钥与网络请求。
- **Don't** 把未提供工具清单显示为零，或从原始配置自动暴露工具提示、Schema 和执行器细节。

## 回答引用与宿主停靠

ChatPageOptions / ChatMountOptions 接受可选 getRunSources(run) 同步回调；createMessageTimeline(copy, options) 同样可用。只为已完成回答解析链接，最多八项，标签作为 textContent。仅 HTTP(S) 且不含用户名密码的 URL 可展示，默认新标签页打开并带 noopener noreferrer；回调抛错不会中断时间线。宿主负责引用来源与授权校验，SDK 不把模型字符串当 HTML。

Widget 的原生 dialog 暴露 part="panel"，宿主可以用 [data-agent-chat]::part(panel) 调整外部位置和几何，优先通过 theme.tokens 配置尺寸与响应断点。不要改写 SDK 内部类名或破坏移动模态行为。
