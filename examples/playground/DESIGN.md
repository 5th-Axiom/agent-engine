---
name: Agent Engine 本地测试
description: 沿用 Debug 视觉约定的本地对话与执行详情工作台
colors:
  ink: "#172b42"
  muted: "#48596a"
  line: "#cad4df"
  blue: "#0758a0"
  surface: "#f3f6f9"
  error: "#99252c"
  canvas: "#fff"
  blue-hover: "#064a86"
  selection: "#c7e1fc"
  scrollbar: "#aab8c7"
  session-selected: "#e1edf8"
typography:
  brand:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.6
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.6
  section:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.6
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.6
  hint:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    lineHeight: 1.65
  identifier:
    fontFamily: "ui-monospace, monospace"
    fontSize: "11px"
    lineHeight: 1.7
rounded:
  field: "4px"
  control: "5px"
spacing:
  small: "8px"
  compact: "12px"
  regular: "16px"
  mobile: "20px"
  section: "24px"
  conversation: "28px"
  spacious: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.surface}"
  button-suggestion:
    textColor: "{colors.blue}"
    padding: "8px 0"
  message-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
    width: "100%"
  select-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px"
    width: "100%"
  debug-link:
    textColor: "{colors.blue}"
  session-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px"
    width: "100%"
  session-item-current:
    backgroundColor: "{colors.session-selected}"
    textColor: "{colors.blue}"
  user-message:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "14px 16px"
  usage-row:
    padding: "5px 0"
  operation-row:
    padding: "12px 0"
---

# Design System: Agent Engine 本地测试

## Overview

**Creative North Star: "Operate"**

沿用 Debug 的朴素开发工作台：白色画布、深蓝正文、蓝色操作和细线记录。对话与执行详情并列，内容和状态成为视觉主体；表单沿用系统字体与原生控件，小幅圆角只用于交互控件。

此文档只记录本地测试页已实现的视觉规则，不扩展 Debug 包的设计系统。依据为 `index.html` 的方向契约、`app.css`、`app.js` 和 `server.ts` 的页面组合；视觉参考为 `../../packages/debug/DESIGN.md`。交接截图位于 `.impeccable/review/desktop.png` 与 `.impeccable/review/mobile.png`，独立完成审查结果为 ship，未要求实现修正。截图提供布局证据，不代表所有运行状态或后端行为均已验证。

**Key Characteristics:**

- 白色对话工作面、浅灰设置区和细线执行记录。
- 系统字体与原生表单，蓝色同时指示操作、当前位置和键盘焦点。
- 桌面三列，窄屏折叠设置并纵向排列对话与执行详情。
- 草稿、完成、错误、取消和未知用量都有文字说明。

本地审查报告和截图被 Git 忽略，克隆仓库不包含这些材料。可交付的行为说明与复现入口见 [公开验收/使用说明](../../docs/local-playground.md)。

## Colors

深蓝与冷灰构成克制的工作面，操作蓝承担可交互状态，暗红只用于错误。

### Primary

- **操作蓝（blue）**：发送按钮、Debug 链接、示例操作、当前会话文字、键盘焦点和输入光标。
- **深操作蓝（blue-hover）**：主按钮 hover 背景；当前实现没有单独的 active 色。
- **当前会话浅蓝（session-selected）**：最近会话列表的选中背景。

### Neutral

- **深蓝墨色（ink）**：正文、标题、表单内容和数值。
- **次级灰蓝（muted）**：提示、说明、状态和字段名称。
- **分隔灰蓝（line）**：区域分隔、表单边框和执行记录底线。
- **浅灰工作面（surface）**：设置区、用户消息及次按钮 hover 背景。
- **白色画布（canvas）**：页面、输入区和默认按钮背景。
- **选区浅蓝（selection）**：文本选中背景。
- **滚动条灰蓝（scrollbar）**：细滚动条滑块，轨道使用浅灰工作面。

错误使用 error 暗红色，并保留错误说明与错误码。

**The Written State Rule.** 草稿、取消、失败和用量完整性通过文字表达，颜色不单独承担状态含义。

## Typography

全页使用本机系统 sans 字体栈，无网络字体或图标字体。等宽字体仅用于运行标识与工具名称；统计数值和输入计数使用 tabular-nums。

层级保持紧凑：brand 用于页头产品名，headline 仅用于欢迎标题，title 用于对话与执行详情标题，section 用于详情分区和设置摘要。body 用于消息和表单；输入标签使用 label，说明使用 hint，运行标识使用 identifier。

消息角色标签比正文更小（12px、650）；会话项使用（13px、450），当前会话加粗到（600），附属模型名称使用（11px）。页头页面名使用（15px、500）；工具名使用（12px）等宽字体。正文按自然语言原样换行，不将模型文本渲染成富文本。

在窄屏断点内，产品名缩至（18px），欢迎标题缩至（23px），对话标题缩至（16px）；不引入另一套字体。

## Layout

桌面页头高（76px），左右内边距为（28px），下方采用设置、对话、执行详情三列。两侧宽度为（232px）和（280px），对话列为剩余宽度，允许收缩到零最小宽度。工作区高度为视口减去页头，最小高（640px）；设置、消息和执行详情各自允许滚动。输入区位于对话列底部，使用正常 flex 布局，没有固定覆盖消息。

设置区内边距为（24px 20px）；对话标题、消息和输入区主要水平留白使用 conversation；执行详情内边距使用 section。消息轮次最大宽度为（72ch），上下轮次以 spacious 分隔；欢迎说明最大宽度为（62ch）。字段纵向间距使用 section，标签与控件之间使用 small。

视口不大于（1150px）时，两侧缩至（210px）和（232px），对话区与详情区水平留白缩至 mobile，输入区内边距为（16px 20px），隐藏键盘快捷键说明。

视口不大于（850px）时，页面按页头 → 可折叠设置 → 对话 → 执行详情纵向排列；工作区恢复内容高度。页头最小高（68px），隐藏页头页面名与设置区底部说明。脚本在初始加载、打开会话和成功发送后收起设置，保留原生 details 供用户展开。消息区高（52dvh）、最小高（300px），对话区最小高（650px）；详情区在下方自然滚动，底部留白为（40px）。

长消息、会话名称、模型说明、运行标识与工具记录允许换行；不通过截断隐藏执行证据。

## Elevation & Depth

无阴影、渐变、浮层材质、自定义动画或过渡。浅灰设置区和用户消息提供背景区分，其余层级来自细线、字重和留白。按钮 hover 直接改变背景或边框，链接 hover 加粗下划线。

**The Flat Workbench Rule.** 保留平面区域与分隔线，不将对话和执行记录改为悬浮卡片。

所有可聚焦元素使用操作蓝外轮廓（3px），轮廓偏移（3px）。这些焦点规则与无动画事实记在 sidecar 中；它们不是阴影或动效 token。

## Shapes

区域、用户消息和记录保持矩形。按钮、会话项和输入框使用 control 的小圆角；下拉字段使用 field 圆角。控件与区域边框均为（1px）实线。没有 chip、pill、头像或自定义图标；折叠标记与下拉箭头保留浏览器原生外观。

## Components

### Buttons

主按钮使用操作蓝、白字；新对话、停止生成和重新连接使用白底细边框。按钮最小高（42px）、字重（600），重新连接按钮缩至（36px）。次按钮 hover 使用浅灰背景与操作蓝边框，主按钮使用更深蓝背景。禁用按钮保持位置，透明度为（0.55），使用默认指针；提交中与停止中改用明确文字。

示例操作是带下划线的文字按钮，字重（500）、无默认背景或边框；继承共享按钮 hover 的浅灰背景。窄屏发送与停止按钮的水平内边距缩至（12px）。

### Inputs and selects

字段始终有可见 label；下拉使用浏览器原生选择行为，最小高（42px）。消息输入区允许纵向调整，高度范围为（88px–240px），最大输入（8000）字符，保留计数。输入框 placeholder 使用次级灰蓝，光标使用操作蓝，focus-visible 使用共享外轮廓。

模型与场景在会话建立后禁用，并显示固定配置说明。禁用下拉和输入框保留原生状态样式；当前代码没有单独的字段错误边框或错误图标。提交错误通过输入区上方的文字反馈显示。

### Navigation and settings

页头始终保留 Debug 链接；会话建立后出现当前会话的 Debug 链接。链接带下划线，偏移（4px），hover 厚度为（2px）。设置使用原生 details/summary，摘要字重（650），可通过键盘展开。跳转链接仅在获得焦点时显示，目标为消息输入区。

### Session list

会话以整行文字按钮呈现，标题下方显示模型与运行状态。当前项同时使用 aria-current、浅蓝背景和蓝色加粗文字。项目间距为（6px），文字允许长串换行；无独立图标或状态点。

### Conversation turns

每轮先显示浅灰背景的用户消息，再显示白色背景上的 Agent 文本；双方都有文字角色标签。助手区使用少量水平内边距（2px），不包围成气泡。生成中的草稿、等待输出、已完成、错误及取消确认均显示在回答下方；错误使用暗红。消息区域可聚焦并独立滚动。

### Execution details

按运行状态与标识、请求/步骤计数、Token 用量、工具调用、Debug 链接排列。定义列表左右对齐标签与数值，合计行加顶线并加粗。未知数值显示破折号，并用完整性说明解释；费用未配置时直接说明。

工具记录使用等宽名称、次级状态文字和底线，状态有结果校验说明时一起显示。工具空态直接显示说明句，不加入占位图或虚构记录。

### Empty and error states

欢迎区用标题、短说明和两个可执行示例帮助开始；没有营销内容。连接状态和执行状态使用 status 语义，操作错误区域使用 alert；网络错误可显示重新连接按钮。错误既给出中文说明，也保留错误码。Sidecar 示例仅使用合成展示内容，不承载会话数据或外部调用。

## Do's and Don'ts

### Do:

- Do 沿用白底、深蓝正文、操作蓝和细线分区。
- Do 保留可见字段标签、键盘焦点、原生折叠与下拉行为。
- Do 用文字区分草稿、完成、失败、取消和未知用量。
- Do 让长消息、会话标题、标识与工具记录自然换行。
- Do 在窄屏将执行详情放到对话下方，并保持设置可展开。

### Don't:

- Don't 将当前页面扩展为新的品牌体系、营销页面或悬浮卡片界面。
- Don't 添加当前实现没有的装饰图、阴影、渐变、动画、chip 或头像。
- Don't 将未知用量显示成零，或用颜色替代状态说明。
- Don't 在设计记录中复制真实会话、密钥或原生思考内容。
