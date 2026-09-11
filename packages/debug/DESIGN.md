---
name: Agent Engine Debug
description: 只读开发运维工作台的已实现视觉系统
colors:
  ink: "#172b42"
  muted: "#48596a"
  line: "#cad4df"
  link: "#0758a0"
  surface: "#f3f6f9"
  canvas: "white"
  error: "#99252c"
  selection: "#c7e1fc"
typography:
  headline:
    fontFamily: "system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "20px"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  code:
    fontFamily: "ui-monospace, monospace"
    fontSize: "13px"
    lineHeight: 1.6
spacing:
  compact: "10px"
  cell-block: "12px"
  regular: "16px"
  mobile: "20px"
  section: "24px"
  spacious: "32px"
components:
  location-link:
    textColor: "{colors.link}"
  table-heading:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "12px 16px"
  disclosure:
    textColor: "{colors.ink}"
    padding: "12px 0"
  code-panel:
    backgroundColor: "{colors.surface}"
    typography: "{typography.code}"
    padding: "16px"
  empty-state:
    textColor: "{colors.muted}"
    padding: "32px 0"
---

# Design System: Agent Engine Debug

## Overview

**Creative North Star: "Operate"**

Operate：朴素、清楚的只读开发运维工作台。白底、深蓝文字、蓝色链接配合细线表格，让配置、执行记录和关系标识成为视觉主体。

采用扁平布局和原生展开交互，不使用装饰性动画、图片、卡片矩阵或营销区块。此文档记录 src/index.ts 的已实现视觉系统；不对后端正确性作验证承诺。

**Key Characteristics:**

- 以表格和原生 details 呈现记录。
- 白色工作面、深蓝正文、蓝色可访问链接。
- 窄屏纵向排列，宽表格在独立区域滚动。

## Colors

冷静的白色与深蓝构成工作面，蓝色仅承担链接与焦点的明确指示。

### Primary

- **操作蓝（link）**：位置导航、Session 链接、配置版本锚点和重试链接；同色用于键盘焦点。

### Neutral

- **深蓝墨色（ink）**：正文、标题和记录。
- **次级灰蓝（muted）**：页头说明和 Session 空态。
- **分隔灰蓝（line）**：表格外框、行分隔和展开区域底线。
- **浅灰工作面（surface）**：页头、表头及 JSON 代码面板。
- **白色画布（canvas）**：页面主体。
- **选区浅蓝（selection）**：文本选中背景。

错误使用 frontmatter 中的 error 暗红色，并始终保留错误文字；颜色不是唯一信号。

## Typography

正文与标题使用系统 sans，无网络字体。页头使用 headline，区块标题使用 title；三级标题为（16px）。表头使用 label，展开摘要为（600）字重。JSON 配置使用 code 等宽字体；普通表格标识符沿用正文 sans，数值采用 tabular-nums，不将当前未实现的等宽标识符当作约定。

## Layout

页头横向排列，基线对齐，间距（24px），内边距（24px 4vw）。主区域居中，最大宽度（1440px），内边距（32px 4vw 80px）。二级标题上方（36px）、下方（12px）；三级标题上方（24px）、下方（10px）。

Session 详情按 Config → Run → Steps/Attempts → Usage → Operations 阅读。每个 Run 保留配置版本链接；Operations 表格保留 runId，关系无需靠位置猜测。

在视口不大于（640px）时，页头纵向排列，页头与正文内边距均为（20px），页头标题缩为（22px），表格单元格内边距缩为（10px）。表格最小宽度（720px），独立横向滚动，保留完整列信息。单元格宽度约束（12ch–56ch）并允许长内容换行；Session 空态最大宽度（70ch）。

## Elevation & Depth

无阴影。通过浅灰背景、细边框和留白区分层级，不使用悬浮卡片。无自定义动画或过渡；链接 hover 通过加粗下划线反馈，键盘 focus-visible 使用清晰外轮廓。精确焦点样式见 sidecar。

## Shapes

矩形表格与代码工作面，无自定义圆角。表格使用（1px）细线，折叠区使用底部分隔线；最后一行移除底线，避免与容器边框重叠。保留浏览器原生 disclosure 标记。

## Components

### Location links

位置导航始终提供 Sessions；蓝色带下划线，偏移（3px），hover 加粗为（2px）。所有可聚焦元素共享焦点轮廓。

### Record tables

占满可用宽度，顶端对齐，表头浅灰，单元格内边距使用 table-heading 的同一尺度。独立滚动容器提供 tabindex、region 角色和可访问名称，列头提供 scope。空表直接显示 No records yet.。

### Disclosures

Session 和 Run 默认展开，配置版本默认折叠。摘要用较粗正文和原生三角指示；配置摘要展示版本与 hash 前缀。Run 下有配置版本锚点、Steps/Attempts 和 Usage；锚点不附加自动展开脚本。

### Code panels

配置详情用等宽、浅灰背景的 pre 呈现，内容溢出时滚动。界面无脚本增强的编辑器。

### Empty and error states

Session 空态说明从应用创建 Session 后刷新。查询失败显示标题、暗红错误码及返回 Sessions 重试链接。Usage 的 token 与 cost 完整性分别以文字呈现。

现有页面没有自定义按钮、文本输入、chip 或卡片组件；后续添加时需明确记录实现，不在此补造样式。

## Do's and Don'ts

### Do:

- Do 保留关系标识、可见链接、空态与错误码。
- Do 保留键盘焦点轮廓和可聚焦的表格滚动区域。
- Do 用文字说明用量完整性，并以文字和暗红色共同标识错误。

### Don't:

- Don't 在只读界面加入写入操作。
- Don't 用装饰性动画、图片、卡片矩阵或营销区块替代记录表格。
- Don't 声称当前界面有未实现的自定义按钮、搜索输入或筛选控件。
