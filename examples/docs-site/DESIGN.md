---
name: Agent Engine 文档站
description: 支持 AI 对话与传统阅读的前后端 SDK 使用手册
colors:
  primary: "#0758a0"
  canvas: "#ffffff"
  text: "#172b42"
  muted: "#48596a"
  surface: "#f6f8fa"
  border: "#dce2e8"
  selected: "#e1edf8"
  dark-canvas: "#111b28"
  dark-surface: "#1d2a3b"
  dark-text: "#edf3fa"
  dark-muted: "#b2c2d6"
  dark-primary: "#8ec5ff"
  dark-border: "#4d6075"
  dark-selected: "#263d55"
  code: "#16283d"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.8
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "14px"
    lineHeight: 1.75
  label:
    fontSize: "14px"
    fontWeight: 500
  small:
    fontSize: "13px"
  chat-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.8
  chat-welcome:
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
  chat-input:
    fontSize: "16px"
    lineHeight: 1.5
  chat-toolbar:
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  chat-detail-note:
    fontSize: "13px"
    lineHeight: 1.75
  chat-panel-title:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.6
  chat-identifier:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.7
  offline-title:
    fontSize: "28px"
    fontWeight: 700
rounded:
  inset: "5px"
  control: "6px"
  code: "8px"
  dialog: "12px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    padding: "8px 12px"
  navigation-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.primary}"
    padding: "7px 10px"
    rounded: "{rounded.inset}"
  mode-navigation:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.code}"
    padding: "3px"
  mode-link:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.inset}"
    padding: "0 14px"
  mode-link-active:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.inset}"
    padding: "0 14px"
  chat-panel:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
  chat-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    typography: "{typography.chat-input}"
    rounded: "{rounded.control}"
    padding: "12px"
---

# Design System: Agent Engine 文档站

## Overview

**Creative North Star: "可以照着做的手册"**

继承现有聊天 SDK 的工作台语言，围绕前端、后端两条接入路线组织阅读和操作。白底与深蓝文字适合用户在明亮桌面环境下对照终端操作，深色模式满足另一种阅读环境。标题、分隔线和实际内容构成页面，不依靠营销插画或装饰卡片。

AI 对话与传统阅读使用同一套蓝色、字体层级和边界语言。对话页把提问与可核对的资料放在工作区内，阅读页保留章节、正文和目录的手册结构。两种模式的入口始终可见，切换后继续已有会话与未发送问题。

**Key Characteristics:**

- 默认通过 AI 对话描述需求，也可切换传统模式选择前端或后端接入路线。
- 阅读层级清楚，长内容可以定位和复制。
- 对话记录独立滚动，输入区持续可用，回答资料可以追溯。
- 左侧会话列表和当前会话／工具入口由两种模式共用，窄容器使用覆盖面板。
- 阅读位置与聊天状态分别保留，模式切换共享会话与同一标签页草稿。

## Colors

使用克制的中性色加单一交互蓝。主色用于行动、当前导航和链接；次要说明使用 muted，不降低到难以阅读的浅灰。浅色为默认，用户可切换深色，选择在浏览器中保存并同时应用到页面与 SDK 对话。当前站点提供浅色／深色切换，没有跟随系统的主题选项。

模式切换的外层使用 surface，当前模式以内嵌 canvas 色面和主色文字区分。用户消息使用 selected；深色主题对应 dark-selected。资料链接沿用交互蓝，不额外引入另一种强调色。

**The Semantic Color Rule.** 蓝色代表可操作或当前选中，不代表产品能力已经验证。

## Typography

中文正文使用系统阅读字体；代码使用等宽字体。站点字体栈显式包含苹方与微软雅黑，SDK 对话保留自己的 system-ui 字体栈。桌面文章一级标题与二级标题有明确字号层级，1180px 以下一级标题缩到 32px，800px 以下为 30px，370px 以下为 27px。行高允许中文说明自然展开。

模式标签使用 label，连接状态、计数与脚注使用 small；AI 页的上下文提示在桌面为 13px，800px 以下使用 small。对话正文使用 chat-body，欢迎标题使用 chat-welcome，输入框使用 chat-input；未连接页面使用 offline-title。SDK 工具栏使用 chat-toolbar，配置说明和工具描述使用 chat-detail-note，面板标题使用 chat-panel-title，会话 ID 与工具名称使用 chat-identifier。会话列表标题为 14px、字重 500，最多两行并保留完整 title；工具标题为 15px、字重 650。长建议问题保持完整并换行，不能靠缩小字号或截断文字来挤入视口。

**The Reading Voice Rule.** 系统字体服务长篇中文阅读，等宽字体仅用于命令、代码和键值。

## Layout

### AI 对话模式

根路径进入 `/ai/`，以 `mountChatPage` 构成页面主体。页面占满动态视口，最小高度 400px，外层不滚动；桌面顶栏 68px，主工作区居中且最大宽度 1200px，左右内边距 24px、底部 16px。浅灰外围包裹白色对话工作面，上方显示可移除的阅读位置；无阅读位置时显示说明。

对话容器内部采用 SDK 的横向页面：根容器达到 760px 时，232px 左侧会话列表默认常驻，右侧主区域包含合并操作的页头与对话主体；列表和对话记录分别滚动。左栏有单一标题和新对话按钮，多助手时显示选择器，当前会话有选中底色与 aria-current。根容器小于 760px 时，列表从左侧覆盖展开，宽度为 `min(280px, 100% - 32px)`，可通过关闭按钮、遮罩或 Escape 收起；展开时主区域 inert，键盘焦点在侧栏内循环，选择会话后返回入口。

右侧主区域仍沿纵向排列，标题和轻量操作入口合并在同一页头，对话记录承担剩余高度，输入区保持在主体底部。当前会话和工具详情覆盖在该主体右侧，宽度为 `min(360px, 100%)`；主区域小于 480px 时全宽显示。详情打开时对话部分 inert，页头与工具栏保持可见。欢迎区和消息最大宽度 720px，输入区最大宽度 760px。欢迎区桌面上下留白 24px、窄屏 8px；留白由对话记录区统一提供，桌面纵向 24px、横向 16px，SDK 主区域宽度小于 480px 时纵向缩为 16px，工具栏同时隐藏图标、收紧间距。空会话初始滚动位置为顶部，长建议按钮允许换行。

800px 以下，AI 顶栏改成最小高度 100px 的两行网格：品牌与主题按钮在第一行，模式切换居中位于第二行。工作区左右内边距 16px、底部 12px，上下文中的接入指南链接隐藏。480px 以下，工作区去掉外侧内边距，对话铺到屏幕两侧，容器去掉圆角及左右、底部边线，输入区继续保留 SDK 的内部间距和底部安全区。

回答资料通过 SDK 的 getRunSources 放在对应的已完成回答下方，每条最多八项；通过当前文档或源码快照白名单核对。新标签页阅读资料，不打断原会话。来源为空时不占空间。

### 传统阅读模式

`/docs/...` 保留手册布局：最大宽度 1440px，桌面三列分别是章节导航、正文和本文目录，栏间距 48px，1500px 以上为 60px。正文上限 760px；桌面顶栏 68px，移动顶栏 60px。侧栏固定于视口内并独立滚动。

第一篇 `/docs/welcome/` 是“产品介绍”，按一句话用途、核心特点、产品形态、体验入口组织。核心特点使用正文列表；产品表保持两列，左侧解释前端 SDK／后端 SDK，右侧用真实链接打开对应接入示例。入门页不先展示调用链路图或配置代码，后续教程继续承载这些实现步骤。

产品表使用现有画布、表头底色与细分隔线，桌面列宽各 50%，480px 以下为 55% / 45%，正文 14px、产品名称 16px。使用入口沿用 44px 最小高度按钮；480px 以下隐藏箭头并缩小横向内边距，保留文字和两列关系，320px 下无需横向滚动。“一键开始使用”指打开接入示例，文案同时说明需要先安装包和连接后端，不表示已经自动安装或提供托管模型。

1180px 以下隐藏右侧目录；800px 以下主内容单列，章节目录改为按钮打开的原生 dialog。模式切换放在顶栏下方，正文布局顶部预留 54px。正文左右内边距 24px，370px 以下为 18px。表格与代码自行横向滚动，整个页面不横向溢出。

**The Keep Your Place Rule.** 传统模式内文章导航保留聊天实例，询问本文保留正文位置和未发送草稿；浏览器返回恢复已有阅读位置。跨模式使用同一会话记忆键保留会话 ID，同一标签页通过 sessionStorage 保留草稿，浏览器页面缓存恢复时重新同步草稿。切换到 AI 前保存文章 URL、标题及滚动位置，传统模式入口返回该文章并恢复位置；移除阅读位置后入口回到产品介绍。阅读位置仅是导航，不是自动发送给模型的上下文；询问本文仍通过可编辑草稿明确携带文章。

## Elevation & Depth

页面通过线条和色面分区，不使用阴影堆叠。AI 对话容器保留外边界，标题与操作合并且不重复加线，输入框与发送操作共用单一色面，模式导航用内嵌色面表达当前状态。原生模态框的遮罩用于隔离键盘焦点；聊天继续使用 SDK 自己的样式和布局。

## Shapes

交互控件轻微圆角，代码块和搜索框保持一致的简洁边界。模式导航外层沿用 code 圆角，内嵌链接沿用 inset 圆角；AI 对话框沿用 dialog 圆角，窄屏铺边时变为直角。传统阅读页的聊天 launcher 为 SDK 的 56px 圆形图标，是持久入口而非装饰。

## Components

- **章节导航**：原生 details 分类与文章列表，默认展开当前组，其余组可展开；当前页使用选中背景及 aria-current。前端教程将 JavaScript、React、Vue 示例分组为键盘可切换标签，保留深链接；无 JavaScript 时所有示例仍可阅读，打印时全部展示。
- **产品使用表**：仅用于介绍页，左侧为产品及用途，右侧为对应教程链接和简短使用方式；采用语义表格及具名滚动区域，文本自然换行，链接保留键盘焦点。
- **模式导航**：AI 模式与传统模式使用真实链接，当前模式以 aria-current 标记；链接最小高度 44px，间距 4px，外层内边距 3px。悬停显示选中色面，键盘焦点保留站点的 3px 外轮廓。两种入口在手机仍可见。
- **搜索**：点击或 Cmd/Ctrl + K 打开；输入、方向键、Enter 与 Escape 构成完整键盘路径。状态文字明确区分加载、无结果和加载失败。
- **代码框**：语言标签、复制按钮、可滚动代码区域。复制失败给出手动操作提示。
- **询问本文**：打开 SDK 并填入文章相关问题，已有草稿不覆盖，由用户决定发送。
- **相邻文章**：在正文后提供上一篇和下一篇，帮助完成顺序阅读。
- **AI 对话页**：使用公开的 `mountChatPage`，欢迎标题、说明和三个建议问题位于对话记录顶部；点击建议只填入草稿并聚焦输入框，由用户发送。页头提供左侧会话列表入口，同一页头提供当前会话和工具数量；新对话位于左栏，左栏收起时在页头提供图标入口；连接状态、发送／停止与错误恢复继续使用 SDK 组件。
- **当前会话／工具**：两种模式共用 SDK 详情。当前会话显示标题、ID、助手、状态、创建时间、总轮数与配置版本。新会话工具预览来自所选助手，已有会话工具来自保存配置；活动运行快照不同则另列本轮工具与版本。清单缺失和空清单分别显示，六个只读工具的公开名称、说明与权限类别可滚动查看。打开面板先聚焦关闭按钮，Tab 进入具名的 `role="region"`、`tabIndex=0` 内容区；Escape 关闭内层面板并返回对应入口，保留外层聊天与草稿。公开说明由服务端显式 `toolDisplay` 提供，不自动暴露原始提示、参数 Schema 或执行器。
- **输入区**：多行输入框最小高度 60px、最大高度 144px，可纵向调整大小；与发送操作整合为一块色面。字数达到 7200 时显示计数；此前宽屏显示快捷键提示，窄屏不显示该提示；脚注始终可读。输入区不参与对话记录滚动。用户向上阅读时保持位置，新消息由“回到最新”操作返回；空会话始终从欢迎标题开始。
- **传统页助手**：使用 mountChatWidget，宿主主题配置 panelWidth: 440、panelHeight: 720、breakpoint: 1000。1000px 以上通过公开 ::part(panel) 在顶栏下方停靠右侧，正文布局让出 440px；右侧目录隐藏，1360px 以下同时收起章节侧栏并显示目录按钮。1000px 及以下用原生模态全屏。SDK 通用默认窗口仍为 420×680px、窗口断点 600px。440px 助手内部的会话列表按需展开，当前会话和工具入口始终可见。
- **回答资料**：六个只读工具保持原有能力；两种模式均将白名单核对的资料放在所属回答下方，由通用 SDK 以纯文本标签及 HTTP(S) 链接展示。最多八项，拒绝脚本协议和带凭据的 URL，解析回调失败不影响消息展示。
- **源码阅读**：展示启动时已提交快照的版本与带行号源码。行号可定位，目标行使用选中背景；源码区域自行横向滚动，不能把未提交工作区误标为当前可核对来源。
- **未连接状态**：AI 页用独立说明区提供“阅读文档”和“查看启动方法”两个入口；标题使用 offline-title。连接失败时，已挂载的对话框提供重试提示，并保留传统阅读入口。

**The One Motion Rule.** 文章切换使用 140ms 的短交叉淡化，搜索框与 SDK 浮层用 160ms 入场；尊重 prefers-reduced-motion，内容默认可见。AI 页面布局不添加入场动画。

本次合并依据 `ai-render.ts`、`ai.css`、`ai.js`、`chat-shared.js`、`render.ts`、`app.js`，以及共享 SDK 的页面、样式、会话列表、详情组件与主题 Token。既有双模式设计与早期验收记录继续保留，界面未新增位图素材。

本地 `sidebar-finish-review.md` 初审只要求补齐工具滚动区的键盘入口；修正后结论为 `ship`，仅覆盖该项已评分修复。记录接受九张当前证据：`widget-sidebar.png`、`widget-tools.png`、`ai-session-details.png`、`ai-tools.png`、`ai-tools-dark.png`、`mobile-sidebar.png`、`mobile-tools.png`、`ai-320.png`、`ai-desktop.png`，均位于忽略的 `.impeccable/review/`，不作为产品资产交付。本轮检测器只运行一次，三个 advisory 均涉及已记录用途的 SDK 13／14px 字级。文档同步未重跑浏览器或检测器；依据[公开验收记录](ACCEPTANCE.md)，类型检查、构建、14 项后端／控制器测试、28 组文档站与 19 组 SDK 浏览器验证已通过。移动证据限于 Chromium 视口，供应商结果与失败项以公开验收记录为准。

## Do's and Don'ts

Do:

- 每个接入步骤说明代码位置、前置配置与成功标志。
- 让表格和代码在自己的区域滚动。
- 保留清楚的焦点样式和可访问名称。
- 使用现有 SDK 的公开入口和主题配置。
- 保持模式入口可见，让欢迎内容与长建议自然换行，并把输入区留在对话容器底部。
- 只为已核对的文档或源码路径生成资料链接，显示源码快照与行号。
- 保留左栏当前项、具名详情滚动区及关闭后的焦点返回，在主题切换时保留文档浮窗尺寸。

Don't:

- 不把本机配置、预设模型或开发状态写成面向所有用户的事实。
- 不在正文中添加与任务无关的装饰标签或大面积背景效果。
- 不把模型输出当作可执行 HTML。
- 不把尚未执行的验证写成通过。
- 不把传统页助手的默认折叠行为套用到 AI 页面主体。
- 不用双重欢迎区内边距或初始滚动到底部挤掉空会话的标题和建议。
- 不把未知工具清单显示为零，也不让公开工具说明暴露原始配置或覆盖本轮运行快照的事实。
