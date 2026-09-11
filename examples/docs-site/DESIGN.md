---
name: Agent Engine 文档站
description: 面向接入方的前后端 SDK 使用手册
colors:
  primary: "#0758a0"
  canvas: "#ffffff"
  text: "#172b42"
  muted: "#48596a"
  surface: "#f3f6f9"
  border: "#cad4df"
  selected: "#e1edf8"
  dark-canvas: "#111b28"
  dark-surface: "#1d2a3b"
  dark-text: "#edf3fa"
  dark-muted: "#b2c2d6"
  dark-primary: "#8ec5ff"
  dark-border: "#4d6075"
  code: "#16283d"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.9
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "13px"
    lineHeight: 1.75
rounded:
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
---

# Design System: Agent Engine 文档站

## Overview

**Creative North Star: "可以照着做的手册"**

继承现有聊天 SDK 的工作台语言，围绕前端、后端两条接入路线组织阅读和操作。白底与深蓝文字适合用户在明亮桌面环境下对照终端操作，深色模式满足另一种阅读环境。标题、分隔线和实际内容构成页面，不依靠营销插画或装饰卡片。

**Key Characteristics:**

- 先选前端或后端接入路线，再给可用示例、配置与接口。
- 阅读层级清楚，长内容可以定位和复制。
- 文章导航与聊天状态彼此独立。

## Colors

使用克制的中性色加单一交互蓝。主色用于行动、当前导航和链接；次要说明使用 muted，不降低到难以阅读的浅灰。深色模式同时切换页面和 IM 主题。

**The Semantic Color Rule.** 蓝色代表可操作或当前选中，不代表产品能力已经验证。

## Typography

中文正文使用系统阅读字体；代码使用等宽字体。桌面一级标题与二级标题有明确字号层级，手机一级标题缩到 30px，最窄视口再缩到 27px。行高允许中文说明自然展开。

**The Reading Voice Rule.** 系统字体服务长篇中文阅读，等宽字体仅用于命令、代码和键值。

## Layout

最大布局宽度 1440px，桌面三列分别是章节导航、正文和本文目录，栏间距 48px。正文上限 760px；桌面顶栏 68px，移动顶栏 60px。侧栏固定于视口内并独立滚动。

1180px 以下隐藏右侧目录；800px 以下主内容单列，章节目录改为按钮打开的原生 dialog。正文外边距 24px，最窄视口为 18px。表格与代码自行横向滚动，整个页面不横向溢出。

**The Keep Your Place Rule.** 页面内导航保留聊天实例，询问本文保留正文位置和未发送草稿；浏览器返回恢复已有阅读位置。

## Elevation & Depth

页面通过线条和色面分区，不使用阴影堆叠。原生模态框的遮罩用于隔离键盘焦点；聊天继续使用 SDK 自己的样式和布局。

## Shapes

交互控件轻微圆角，代码块和搜索框保持一致的简洁边界。聊天 launcher 为 SDK 的 56px 圆形图标，是持久入口而非装饰。

## Components

- **章节导航**：分类标题与文章列表，当前页使用选中背景及 aria-current。
- **搜索**：点击或 Cmd/Ctrl + K 打开；输入、方向键、Enter 与 Escape 构成完整键盘路径。状态文字明确区分加载、无结果和加载失败。
- **代码框**：语言标签、复制按钮、可滚动代码区域。复制失败给出手动操作提示。
- **询问本文**：打开 SDK 并填入文章相关问题，已有草稿不覆盖，由用户决定发送。
- **相邻文章**：在正文后提供上一篇和下一篇，帮助完成顺序阅读。
- **文档助手**：默认折叠，手机打开为全屏。移动端不显示额外的悬浮提示文字，减少对正文的遮挡。

**The One Motion Rule.** 文章切换使用 140ms 的短交叉淡化，搜索框用 160ms 入场；尊重 prefers-reduced-motion，内容默认可见。

## Do's and Don'ts

Do:

- 每个接入步骤说明代码位置、前置配置与成功标志。
- 让表格和代码在自己的区域滚动。
- 保留清楚的焦点样式和可访问名称。
- 使用现有 SDK 的公开入口和主题配置。

Don't:

- 不把本机配置、预设模型或开发状态写成面向所有用户的事实。
- 不在正文中添加与任务无关的装饰标签或大面积背景效果。
- 不把模型输出当作可执行 HTML。
- 不把尚未执行的验证写成通过。
