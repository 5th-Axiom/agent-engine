---
name: Agent Engine Chat UI
description: 可嵌入宿主工作台、共享组件与语义主题的聊天界面。
colors:
  white: "#ffffff"
  black: "#000000"
  navy: "#172b42"
  muted: "#48596a"
  line: "#cad4df"
  surface: "#f3f6f9"
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
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
  title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.6
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    lineHeight: 1.6
  message:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    lineHeight: 1.7
  label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    lineHeight: 1.6
  input:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    lineHeight: 1.5
  button:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
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
    typography: "{typography.body}"
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
- 悬浮对话与容器页面共享消息、历史、输入和执行详情组件。
- 原生控件、清楚的焦点和明确状态支持键盘及触屏操作。
- 每个挂载实例在 Shadow DOM 内应用样式，宿主保留自己的视觉身份。

来源为 [Token](src/tokens/index.ts)、[共享样式](src/styles.ts)、[原子组件](src/atoms/index.ts)、[业务组件](src/components/index.ts) 和 [页面](src/pages/index.ts)。方向来自 [接入示例](../../examples/embedded/index.html) 的首个 body 注释及 [PRODUCT.md](PRODUCT.md)，没有替换现有 Playground 或 Debug 的设计。

本次文档承接 [finish review](.impeccable/review/finish-review.md) 的 `ship` 结论。该审查接受六张证据：[桌面浅色](.impeccable/review/desktop-light.png)、[桌面深色](.impeccable/review/desktop-dark.png)、[关闭入口](.impeccable/review/desktop-closed.png)、[容器嵌入](.impeccable/review/inline.png)、[移动浅色](.impeccable/review/mobile-light.png)、[移动深色](.impeccable/review/mobile-dark.png)。前四张为 1440×1000，后两张为 390×844；移动截图使用 rounded 皮肤。文档提取没有重跑浏览器验收或机械检测。检测器因缺少解析依赖降级，返回的 `[]` 不能作为计算样式对比度通过证据；颜色依据是主题校验代码及已有契约测试结果，视觉结论限于已审查尺寸和状态。

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
- **记录分隔线（line / dark-line）**：控件边框及头部、工具栏、输入区的细分隔线。
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

采用系统无衬线字体栈，SDK 没有远程字体、展示字体或独立等宽字体。标题通过字号和字重建立层级，正文保留足够行距阅读长回复；字体不承担营销式表达。

| 前置 Token 角色 | 用途                                   |
| --------------- | -------------------------------------- |
| headline        | 空会话欢迎标题                         |
| title           | 对话页头部标题                         |
| body            | 页面正文、历史条目和助手选项           |
| message         | 保留换行的用户与助手文本               |
| label           | 发送者、状态、执行详情、字符计数和脚注 |
| input           | 多行输入框，触屏下保持明确可读的字号   |
| button          | 主、次、安静按钮的操作文字             |

`fontFamily`、`fontSize` 与 `smallFontSize` 可通过主题覆盖；欢迎标题、页标题和输入字号当前由共享样式固定。错误反馈使用局部字号（13px），不扩成通用字号层级。字符计数使用等宽数字；消息保持原始换行并允许长串在任意位置换行。欢迎说明宽度上限（60ch），每轮记录宽度上限（70ch）。

## Layout

页面是占满挂载容器高度的单列 flex 结构：头部、助手工具栏、可展开历史、可滚动记录、最新消息入口、反馈区和输入区。头部、工具栏、输入区保持在各自位置，记录区域独立滚动；历史区域最高占页面高度（35%）。宿主需为 inline 容器提供实际高度，SDK 不接管宿主页面的栅格。

默认 `space` 决定头部和主要区域的横向内边距；rounded 皮肤使用 `rounded-space`。工具栏和输入区的纵向内边距采用 medium，记录区采用 large；窄容器记录区回到 space。每轮记录底部间隔（28px），同轮消息之间（16px）。输入框最小高度（68px）、最大高度（144px），允许纵向调整。

悬浮入口默认在视口右下角，右侧留白（24px），底部留白为 `max(24px, env(safe-area-inset-bottom))`；`position: "left"` 可改到左侧。入口尺寸见前置 `launcher` Token。桌面对话默认宽高（420×680px），位于右侧（24px）、底部（92px）；实际宽度为 `min(panelWidth, 100vw - 32px)`，高度为 `min(panelHeight, visualViewportHeight - 116px)`。

在窗口宽度不大于 `breakpoint`（默认 600px）时，对话使用原生 modal dialog 占满可见视口，去掉外框和圆角，跟随 `visualViewport` 的高度及顶部偏移。桌面使用非模态原生 dialog，宿主可继续操作。输入区底部保留安全区。

页面自身另有容器响应阈值（小于 480px）：隐藏键盘快捷键提示、压缩头部和记录区纵向留白。这由 `ResizeObserver` 观察组件宽度，与窗口是否移动模式分别处理。窗口和容器阈值记录于 sidecar；接入示例自身的导航栅格不属于 SDK 布局 Token。

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
- **输入区**：`createComposer()` 接收 onDraft / onSend / onCancel 回调。字符计数上限（8000），支持按钮发送及 ⌘ / Ctrl + Enter，输入法组合期间不发送；空白、待确认或不可发送时禁用发送。活动 Run 显示停止入口，停止请求期间显示等待状态。
- **历史**：`createSessionList()` 接收会话摘要及选择回调。条目整行可操作，当前项用 `aria-current` 和选中底色；空列表有说明。更新条目时尝试恢复原会话按钮的焦点。

业务组件只接收数据和回调，没有网络请求，也不拥有滚动策略。文案可由 `ChatCopy` 覆盖公开字段；运行详情及部分状态字符串目前仍在实现中固定为中文，不宣称完整国际化。

### 页面组合、挂载与生命周期

`createChatPage()` 把组件连接到 `ChatController`，负责连接状态、助手选择、新会话、历史、反馈、焦点和滚动。用户距记录末尾小于（64px）时跟随新内容；用户上翻时保留位置并显示“回到最新消息”。新会话重新跟随末尾。错误区使用 `role="alert"`，根据状态显示重试发送、结束重试、重新连接；等待宿主输入或核验保持明确状态。

`mountChatPage(target, options)` 与 `mountChatWidget(options)` 均创建开放 Shadow Root 并安装同一套样式。共享样式以 `:host { all: initial }` 重置继承起点，再应用语义字体和颜色；优先使用 adoptedStyleSheets，回退 style 标签可接收 `styleNonce`。低层组件单独复用时，应在自己的 Shadow Root 中调用 `installChatStyles()`，并对 host 调用 `applyChatTheme()`。

悬浮入口通过 `aria-controls`、`aria-haspopup` 与 `aria-expanded` 描述对话关系。打开后入口隐藏、输入框获得焦点；关闭或 Escape 返回入口焦点。移动端的焦点范围由原生模态对话保护。关闭仅收起界面，不取消服务端 Run；停止由显式控制操作发起。

挂载返回 ready、controller、主题更新及销毁接口；widget 另有 open / close / toggle，page 提供 focus。默认每次挂载创建独立控制器；显式传入 controller 才共享状态，调用者拥有该控制器的释放责任。destroy 可重复调用，移除页面、监听器、主题订阅和挂载节点；内部创建的控制器同时释放，`clearSession` 可清理其会话记忆。宿主提供外部控制器时需自行完成释放或清理，卸载不承诺取消已受理任务。

## Do's and Don'ts

### Do:

- **Do** 从语义 Token 取色，并通过主题解析器应用品牌色与皮肤。
- **Do** 让 Token、原子组件、业务组件和页面保持现有职责，业务组件接收数据及回调。
- **Do** 为 inline 容器提供明确尺寸，在宿主真实布局中验证容器与窗口响应。
- **Do** 保留文字状态、用量完整性、可见焦点、输入法保护和用户上翻位置。
- **Do** 在宿主卸载或退出登录时清理挂载，并按控制器归属管理会话记忆。
- **Do** 将库存工作台与组件展廊标明为示例，保留合成数据的性质。

### Don't:

- **Don't** 把接入示例的导航、库存表或业务内容提升为 SDK 的通用组件契约。
- **Don't** 通过 SDK 主题修改宿主或现有 Playground、Debug 的视觉身份。
- **Don't** 给当前平整记录新增投影卡片层级、位图头像或装饰性素材。
- **Don't** 把收起、卸载或结束重试描述为已取消服务端任务。
- **Don't** 把缺失用量、未知执行结果或降级检测输出表示为已验证成功。
- **Don't** 将模型文字作为 HTML 注入，或让展示组件直接处理模型密钥与网络请求。
