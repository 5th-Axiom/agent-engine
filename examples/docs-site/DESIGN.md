---
name: Agent Engine 文档站
description: 支持 AI 对话与传统阅读的场景接入手册
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
  code-text: "#edf3fa"
  syntax-keyword: "#e5a9ea"
  syntax-string: "#8ddbc0"
  syntax-symbol: "#95c6ff"
  syntax-comment: "#a3afbd"
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
  code-header:
    fontSize: "12px"
  search-title:
    fontSize: "15px"
    fontWeight: 650
  search-excerpt:
    fontSize: "12px"
    lineHeight: 1.75
  chat-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.8
  chat-welcome:
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
  chat-welcome-narrow:
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.35
  chat-input:
    fontSize: "16px"
    lineHeight: 1.5
  chat-toolbar:
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  chat-composer-select:
    fontSize: "13px"
    lineHeight: 1.6
  chat-composer-select-narrow:
    fontSize: "16px"
    lineHeight: 1.6
  chat-detail-note:
    fontSize: "13px"
    lineHeight: 1.75
  chat-panel-title:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.6
  chat-tool-title:
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.6
  chat-process-heading:
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.6
  chat-process-metadata:
    fontSize: "12px"
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
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.chat-input}"
    rounded: "{rounded.dialog}"
    padding: "12px 14px 4px"
  chat-composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
  chat-composer-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.chat-composer-select}"
    rounded: "{rounded.control}"
    padding: "4px 24px 4px 8px"
    height: "40px"
  chat-process:
    textColor: "{colors.muted}"
    typography: "{typography.small}"
  chat-process-header:
    textColor: "{colors.text}"
    typography: "{typography.chat-process-heading}"
  article-code:
    backgroundColor: "{colors.code}"
    textColor: "{colors.code-text}"
    typography: "{typography.code}"
    rounded: "{rounded.code}"
  search-result:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "13px 14px"
  scenario-action:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "44px"
---

# Design System: Agent Engine 文档站

## Overview

**Creative North Star: "可以照着做的手册"**

继承现有聊天 SDK 的工作台语言，以清楚的任务、步骤和代码组织阅读和操作。白底与深蓝文字适合用户在明亮桌面环境下对照终端操作，深色模式满足另一种阅读环境。标题、分隔线和实际内容构成页面，不依靠营销插画或装饰卡片。

AI 对话与传统阅读使用同一套蓝色、字体层级和边界语言。对话页把提问、用户图片与可核对的资料放在工作区内，阅读页保留章节、正文和目录的手册结构。两种模式的入口始终可见，切换后继续已有会话与未发送文字问题；未发送图片仅保留在当前挂载的内存中。

**Key Characteristics:**

- 默认通过 AI 对话描述需求，也可切换传统模式按任务进入可执行教程。
- 阅读层级清楚，长内容可以定位和复制。
- 对话记录独立滚动，输入区持续可用，回答资料可以追溯。
- 左侧会话列表和当前会话／工具入口由两种模式共用，窄容器使用覆盖面板。
- 阅读位置与聊天状态分别保留，模式切换共享会话与同一标签页草稿。
- 图片作为用户内容预览，上传状态、移除和重试与输入区一起呈现。
- 文档助手按真实顺序展示可核对的处理过程，过程可收起，最终回答保持独立阅读。

## Colors

使用克制的中性色加单一交互蓝。主色用于行动、当前导航和链接；次要说明使用 muted，不降低到难以阅读的浅灰。浅色为默认，用户可切换深色，选择在浏览器中保存并同时应用到页面与 SDK 对话。当前站点提供浅色／深色切换，没有跟随系统的主题选项。

模式切换的外层使用 surface，当前模式以内嵌 canvas 色面和主色文字区分。用户消息使用 selected；深色主题对应 dark-selected。资料链接沿用交互蓝，不额外引入另一种强调色。

文章代码使用 code 背景和 code-text 正文，在深色主题改用 dark-surface，两个主题都保持深色代码面。语法颜色只区分关键字、字符串、符号／数值和注释，不作为新操作色；聊天里的 Markdown 代码使用 SDK 的 canvas／surface 随主题切换，不使用文章语法高亮。搜索命中词沿用 selected 和 primary。

处理过程继续使用 SDK 语义色：活动文字用 muted，标题和查询输入用 text，运行状态用 `--ae-chat-accent-text`，焦点用 `--ae-chat-focus`；两者保留 SDK 自定义品牌色的对比度回退。失败使用 SDK 的 danger，等待问题使用 surface 色面和细边界；这些状态不新增站点品牌色。

**The Semantic Color Rule.** 蓝色代表可操作或当前选中，不代表产品能力已经验证。

## Typography

中文正文使用系统阅读字体；代码使用等宽字体。站点与 SDK 对话的系统字体栈都显式包含苹方与微软雅黑。桌面文章一级标题与二级标题有明确字号层级，800px 以下一级标题为 28px，370px 以下为 27px。行高允许中文说明自然展开。代码头使用 code-header；搜索结果以 search-title 区分标题、search-excerpt 展示命中片段，并用 11px 次级文字标明分类与章节。

模式标签使用 label，连接状态、计数与脚注使用 small；AI 页的上下文提示在桌面为 13px，800px 以下使用 small。对话正文使用 chat-body，欢迎标题使用 chat-welcome，窄主区域改用 chat-welcome-narrow，输入框使用 chat-input；未连接页面使用 offline-title。SDK 工具栏使用 chat-toolbar，配置说明和工具描述使用 chat-detail-note，面板标题使用 chat-panel-title，会话 ID 与工具名称使用 chat-identifier。会话列表标题为 14px、字重 500，最多两行并保留完整 title；工具标题使用 chat-tool-title。长建议问题保持完整并换行，不能靠缩小字号或截断文字来挤入视口。

处理过程的标签、查询／结果摘要、总耗时和用量继承 SDK 的 smallFontSize，默认对应 small；外层标题使用 chat-process-heading 的字重。活动状态、单项耗时和范围说明使用 chat-process-metadata，耗时与用量使用等宽数字。过程中的已提交阶段说明仍用 chat-body，与最终回答保持同一正文阅读层级。

模型、Skill 与快捷键选择器使用 chat-composer-select；SDK 主区域小于 480px 时改用 chat-composer-select-narrow，正常名称保持可读并通过控件换行适应宽度。发送／停止沿用 chat-toolbar，编辑正文继续使用 chat-input。输入设置说明为 13px，麦克风不可用原因可通过鼠标提示或键盘焦点读取。

**The Reading Voice Rule.** 系统字体服务长篇中文阅读，等宽字体仅用于命令、代码和键值。

公开思考正文的有效字号与行高沿用 chat-body，以 muted 与独立边界区分最终答案。思考类的局部字号与行高被后续消息样式覆盖，不将未生效声明另立为 Token。

## Layout

### AI 对话模式

根路径进入 `/ai/`，以 `mountChatPage` 构成页面主体。页面占满动态视口，最小高度 400px，外层不滚动；桌面顶栏 68px，主工作区居中且最大宽度 1200px，左右内边距 24px、底部 16px。浅灰外围包裹白色对话工作面，上方显示可移除的阅读位置；无阅读位置时显示说明。

对话容器内部采用 SDK 的横向页面：根容器达到 760px 时，232px 左侧会话列表默认常驻，右侧主区域包含合并操作的页头与对话主体；列表和对话记录分别滚动。左栏有单一标题和新对话按钮，多助手时显示选择器，当前会话有选中底色与 aria-current。根容器小于 760px 时，列表从左侧覆盖展开，宽度为 `min(280px, 100% - 32px)`，可通过关闭按钮、遮罩或 Escape 收起；展开时主区域 inert，键盘焦点在侧栏内循环，选择会话后返回入口。

右侧主区域仍沿纵向排列，标题和轻量操作入口合并在同一页头，对话记录承担剩余高度，输入区保持在主体底部。当前会话和工具详情覆盖在该主体右侧，宽度为 `min(360px, 100%)`；主区域小于 480px 时全宽显示。详情打开时对话部分 inert，页头与工具栏保持可见。欢迎区和消息最大宽度 720px，输入区最大宽度 760px。欢迎区桌面上下留白 24px、窄屏 8px；留白由对话记录区统一提供，桌面纵向 24px、横向 16px，SDK 主区域宽度小于 480px 时纵向缩为 16px，工具栏同时隐藏图标、收紧间距。空会话初始滚动位置为顶部，长建议按钮允许换行。

800px 以下，AI 顶栏改成最小高度 100px 的两行网格：品牌与主题按钮在第一行，模式切换居中位于第二行。工作区左右内边距 16px、底部 12px，上下文中的接入指南链接隐藏。480px 以下，工作区去掉外侧内边距，对话铺到屏幕两侧，容器去掉圆角及左右、底部边线，输入区继续保留 SDK 的内部间距和底部安全区。

回答资料通过 SDK 的 getRunSources 放在对应的已完成回答下方，每条最多八项；通过当前文档或源码快照白名单核对。新标签页阅读资料，不打断原会话。来源为空时不占空间。

处理过程排在助手名称与最终回答之间，两种模式共用 SDK 的原生外层折叠与内层摘要。普通活动行最小高度 36px，外层标题和详情摘要最小高度 40px；详情正文缩进 27px、高度上限 240px，自行滚动。SDK 主区域小于 480px 时隐藏单项耗时，累计活动时间保留，标题允许换行；输入、附件和左侧会话列表继续采用既有布局。

输入框由同一原生 textarea 自动增高：普通状态从 72px 随内容增加，运行时目标上限为 `max(72px, min(180px, 可见视口高度 × 25%))`；展开状态的目标高度为 `max(72px, min(480px, 可见视口高度 × 50%))`。CSS 另有 50dvh 上限，普通状态保留 60px 最小高度；展开清除 CSS 最小高度。超出内容自行滚动，容器和可见视口变化重新计算。底栏可换行，模型默认宽 180px、Skill 宽 130px；SDK 窄主区域的模型 flex 填充且最小宽 150px，Skill 宽及最小宽 120px，选择器横向内边距 8px，容纳不下则继续换行。动作另占一行，发送在末端。设置面板宽 280px、最大宽 `calc(100vw - 48px)`；窄主区域锚定输入色面右侧 8px，保留上方 8px 间距，320px 布局中仍在视口内。

### 传统阅读模式

`/docs/...` 保留手册布局：最大宽度 1440px，桌面三列分别是章节导航、正文和本文目录，栏间距 48px，1500px 以上为 60px。正文上限 760px；桌面顶栏 68px，移动顶栏 60px。侧栏固定于视口内并独立滚动。

第一篇 `/docs/welcome/` 是“从这里开始”，先解释用途，再呈现“你的目标／从哪里开始”两列表格。三行对应创建对话、嵌入界面和完整示例，采用同等权重的真实链接；下方用文字列表进入图片、工具、Skill、知识、记忆、事件和 Debug 等任务。当前 25 篇文章分为开始使用、使用场景、参考与附录；这是手册内容组织，不是新的全站视觉身份。

场景表使用现有画布、表头底色与细分隔线，桌面列宽各 50%，480px 以下为 55% / 45%，正文 14px。使用入口沿用 44px 最小高度按钮；480px 以下隐藏箭头并缩小横向内边距，保留文字和两列关系，320px 下无需横向滚动。源码和本地 SDK 开发包的可用性用正文说明；公共 npm、CLI、压缩包和安装包待确定，不为尚未交付的形式绘制下载动作。

1180px 以下隐藏右侧目录；800px 以下主内容单列，章节目录改为按钮打开的原生 dialog。模式切换放在顶栏下方，正文布局顶部预留 54px。正文左右内边距 24px，370px 以下为 18px。表格与代码自行横向滚动，整个页面不横向溢出。

**The Keep Your Place Rule.** 传统模式内文章导航保留聊天实例，询问本文保留正文位置和未发送文字草稿；浏览器返回恢复已有阅读位置。跨模式使用同一会话记忆键保留会话 ID，同一标签页通过 sessionStorage 保留文字草稿，浏览器页面缓存恢复时重新同步草稿。切换到 AI 前保存文章 URL、标题及滚动位置，传统模式入口返回该文章并恢复位置；移除阅读位置后入口回到“从这里开始”。阅读位置仅是导航，不是自动发送给模型的上下文；询问本文仍通过可编辑草稿明确携带文章。未发送图片不跨页面持久化。

公开思考使用独立可聚焦滚动区，继承详情（240px）高度上限；左侧留白（26px）、横向内边距（12px）与（1px）中性边线区分最终回答。外层过程下方留白（14px），标题下方（4px），用量上方（6px）；最终答案仍使用主要正文色并保持独立阅读。

## Elevation & Depth

页面通过线条和色面分区，不使用阴影堆叠。AI 对话容器保留外边界，标题与操作合并且不重复加线，输入框与发送操作共用单一色面，模式导航用内嵌色面表达当前状态。原生模态框的遮罩用于隔离键盘焦点；聊天继续使用 SDK 自己的样式和布局。

## Shapes

交互控件轻微圆角，代码块和搜索框保持一致的简洁边界。模式导航外层沿用 code 圆角，内嵌链接沿用 inset 圆角；AI 对话框沿用 dialog 圆角，窄屏铺边时变为直角。传统阅读页的聊天 launcher 为 SDK 的 56px 圆形图标，是持久入口而非装饰。

处理过程采用 SDK 同源描边图标：活动图标为 18px、展开箭头为 14px；等待问题使用 SDK 固定 8px 圆角，内层摘要使用 4px 圆角。聊天 Markdown 的中性左边线表示引用，属于既有语义阅读样式，不作为装饰线推广。

输入工具栏沿用 SDK 原创 20px 描边 SVG 与原生 select / details，不引入新的图标或字体体系。选择器和可聚焦的语音不可用说明使用固定 6px 圆角，设置面板使用固定 8px 圆角与 canvas、border，局部覆盖层级为 z-index 2；没有额外投影或输入展开动画。

## Components

- **章节导航**：原生 details 分类与文章列表，默认展开当前组，其余组可展开；当前页使用选中背景及 aria-current。前端教程将 JavaScript、React、Vue 示例分组为键盘可切换标签，保留深链接；无 JavaScript 时所有示例仍可阅读，打印时全部展示。
- **场景入口表**：仅用于起始页，左侧是用户目标，右侧用同等样式呈现“创建对话／嵌入界面／完整示例”；采用语义表格及具名滚动区域，文本自然换行，链接保留键盘焦点。后续场景用正文链接及简短说明延展。
- **模式导航**：AI 模式与传统模式使用真实链接，当前模式以 aria-current 标记；链接最小高度 44px，间距 4px，外层内边距 3px。悬停显示选中色面，键盘焦点保留站点的 3px 外轮廓。两种入口在手机仍可见。
- **搜索**：点击或 Cmd/Ctrl + K 打开；输入、方向键、Enter 与 Escape 构成完整键盘路径。每条结果显示文章标题、所属组／章节与命中片段，片段中的命中词通过文本 DOM 标记；章节结果直接进入相应锚点。选中结果使用 selected 底色，状态文字明确区分加载、无结果和加载失败。
- **代码框**：代码头优先显示围栏中提供的文件名，否则显示语言，右侧保留复制按钮；已知语言经 highlight.js 高亮，未知语言转义后显示。正文使用可聚焦、横向滚动的代码区。复制取原始代码文本，失败给出手动操作提示。受类型检查的示例源文件插入教程，视觉标签不意味着所有文章代码都已运行。
- **询问本文**：打开 SDK 并填入文章相关问题，已有草稿不覆盖，由用户决定发送。
- **相邻文章**：在正文后提供上一篇和下一篇，帮助完成顺序阅读。
- **AI 对话页**：使用公开的 `mountChatPage`，欢迎标题、说明和三个建议问题位于对话记录顶部；点击建议只填入草稿并聚焦输入框，由用户发送。页头提供左侧会话列表入口，同一页头提供当前会话和工具数量；新对话位于左栏，左栏收起时在页头提供图标入口；连接状态、发送／停止与错误恢复继续使用 SDK 组件。
- **当前会话／工具**：两种模式共用 SDK 详情。当前会话显示标题、ID、助手、状态、创建时间、总轮数与配置版本。新会话工具预览来自所选助手，已有会话工具来自保存配置；活动运行快照不同则另列本轮工具与版本。清单缺失和空清单分别显示，六个只读工具的公开名称、说明与权限类别可滚动查看。打开面板先聚焦关闭按钮，Tab 进入具名的 `role="region"`、`tabIndex=0` 内容区；Escape 关闭内层面板并返回对应入口，保留外层聊天与草稿。公开说明由服务端显式 `toolDisplay` 提供，不自动暴露原始提示、参数 Schema 或执行器。
- **有序处理过程**：只展示安全 DTO 中实际发生的模型阶段、资料工具、阶段说明与已开放的公开思考，按服务器顺序排列；文档宿主显式开放六项只读工具的查询词和结果摘要。活动时外层展开，终态默认收起，用户主动查看后保留展开状态；历史可重新打开。最终回答在外层之后，用量和待处理问题也位于折叠之外，不因收起而消失。工具以外的能力只有宿主配置并执行后才出现。活动标题直接显示当前阶段，终态存在思考条目时显示“思考与处理过程”；完成的排队／模型请求移到执行详情，保留状态与时长，让最终答案成为主要阅读内容。
- **过程详情与连续阅读**：工具存在公开查询或结果摘要时才显示内层原生 details；工具正文为纯文本，具名 `role="region"`、`tabIndex=0`，键盘焦点为 SDK focus 色 2px 轮廓和 2px 外偏移。更新同一活动保留 details、summary 和正文节点，维持展开状态、焦点与内部滚动；摘要悬停显示 surface。累计时间来自实际活动时长，运行中最多补计到最近观测后的 3 秒；Token 和费用区分未知、待结算和不完整。等待问题说明由接入方处理后继续，也可停止本轮；本站没有新增审批或答案提交表单。
- **公开思考与供应商摘要**：模型 `thinking.expose`、宿主 `thinkingDisplay` 与 Engine 会话保留策略同时显式允许时才展示正文；`summary` 只接受供应商实际提供的摘要，与 `content` 区分，不能把模型关闭的展示升级为正文。本站本地配置显式开放 content 与 session 保留，保持各模型原有 Thinking 请求开关；此前未记录的思考不能补回。思考条目有独立 details 与受限 Markdown 正文，活动中首次收到正文时展开，其后保留用户开合选择。未开启时显示状态说明，已开启但模型未返回内容时明确说明；原生签名、遮蔽／加密续接块和未获公开授权的推理不进入界面，不编造分析文字。
- **流式 Markdown**：已收到的思考、阶段文字和回答共用短缓冲与 DOM 增量更新。保留未变化的段落、代码区、复制按钮、正文选区、焦点及横向滚动，复制读取当前代码文字。文本和内容尺寸变化只在用户原本跟随末尾时继续跟随；独立思考区也保留上翻位置。卸载清理逐帧更新、计时器、可见性与偏好监听；刷新历史立即呈现。约 450ms 的快照轮询仍存在，缓冲不消除供应商首字延迟，也没有新增 SSE、数学公式或聊天代码高亮。
- **输入区**：两种模式共享原生 textarea、自动增高与就地展开，保留同一编辑节点、撤销／重做、文本粘贴、选区和焦点，再次点击展开入口或 Escape 收起；没有手动拖拽缩放。空输入按 ↑ 找回最近一轮文字到草稿，不自动发送或重附图片。字数达到 7200 时显示计数；此前宽屏显示当前快捷键提示，窄屏不显示该提示；脚注始终可读。输入区不参与对话记录滚动。用户向上阅读时保持位置，新消息由“回到最新”操作返回；空会话始终从欢迎标题开始。
- **发送与输入设置**：本站显式采用 Enter 发送、Shift + Enter 换行，原生设置面板可切换 Ctrl / ⌘ + Enter；通用 SDK 缺省仍为后一种。中文组合输入期间与结束后 80ms 不触发快捷发送，按钮发送需组合输入已结束。Escape 关闭设置并返回入口焦点，点击外部收起。选择器、设置入口和语音说明使用 SDK focus 色 2px 轮廓与 2px 外偏移；编辑器可见焦点画在完整输入色面上，沿用 3px 轮廓。快捷键偏好不跨页面保存。
- **模型、Skill 与语音**：模型目录来自本站实际配置的本地 Profile，标记依据真实思考／图片配置；选择作用于下一轮，刷新恢复最近一轮模型，未发送选择不跨页面保存。共享 SDK 在有声明 Skill 时显示含“自动技能”的选择器，本站无 Skill 时隐藏。当前 Run 期间可编辑下一条与选择模型，已提交请求等待受理确认或结果未明时冻结；图片能力随模型检查，有图片草稿时拒绝切到纯文本模型并保留内容。麦克风置灰，外层说明可聚焦并解释“未接入语音识别服务”，不申请麦克风权限或调用隐式识别服务。
- **图片与 Markdown**：两种模式共用 SDK 图片输入与消息展示。待发送缩略图放在输入框上方，可水平滚动，保留文件名、上传状态、移除和失败重试；可通过选择、粘贴或拖拽添加图片。发送动作等待上传就绪；服务端配置决定图片能力与限制（当前单张 5 MiB、每条 8 张）。历史图片经独立鉴权接口读取，失败保留说明和重新读取入口。助手正文支持段落、列表、强调、引用、表格与代码复制，以受限 DOM 呈现，原始 HTML 与远程 Markdown 图片不执行／加载。用户文字保留纯文本换行。具体尺寸和状态见共享 SDK 的 [DESIGN.md](../../packages/chat-ui/DESIGN.md)。
- **传统页助手**：使用 mountChatWidget，宿主主题配置 panelWidth: 440、panelHeight: 720、breakpoint: 1000。1000px 以上通过公开 ::part(panel) 在顶栏下方停靠右侧，正文布局让出 440px；右侧目录隐藏，1360px 以下同时收起章节侧栏并显示目录按钮。1000px 及以下用原生模态全屏。SDK 通用默认窗口仍为 420×680px、窗口断点 600px。440px 助手内部的会话列表按需展开，当前会话和工具入口始终可见。
- **回答资料**：六个只读工具保持原有能力；两种模式均将白名单核对的资料放在所属回答下方，由通用 SDK 以纯文本标签及 HTTP(S) 链接展示。最多八项，拒绝脚本协议和带凭据的 URL，解析回调失败不影响消息展示。
- **源码阅读**：展示启动时已提交快照的版本与带行号源码。行号可定位，目标行使用选中背景；源码区域自行横向滚动，不能把未提交工作区误标为当前可核对来源。
- **未连接状态**：AI 页用独立说明区提供“阅读文档”和“查看启动方法”两个入口；标题使用 offline-title。连接失败时，已挂载的对话框提供重试提示，并保留传统阅读入口。

**The One Motion Rule.** 文章切换使用 140ms 的短交叉淡化，搜索框与 SDK 浮层用 160ms 入场；尊重 prefers-reduced-motion，内容默认可见。AI 页面布局不添加入场动画。

共享 SDK 过程内层箭头使用 140ms 展开旋转，外层箭头直接切换方向。支持 `interpolate-size: allow-keywords` 时，原生内外层 details 使用 180ms 高度／可见性与 120ms 透明度过渡；其余浏览器保留原生即时开合。当前阶段标题前的 6px 状态圆点仅在可见且文档前台时以 1.6s 脉动，离屏或后台暂停；减少动态效果时禁用脉动与开合过渡。流式末尾细条为静态接收状态标记。

**The Received Text Rule.** 仅平滑呈现已经收到的文字，单次活动更新在约（220ms）内按字素分帧追上，终态收尾缩短至最多（100ms）；历史、重试撤回、后台页面和减少动态效果偏好立即显示目标文本。保留未变化的节点、焦点、选区与用户阅读位置，不补造思考或回答，不重放历史打字。

本次事实合并依据 `style.css`、`ai.css`、`render.ts`、`content.ts`、`app.js`、`delivery.ts`、`chat-shared.js` 与共享 SDK 的样式、Markdown、图片输入及时间线组件。既有双模式设计不变，没有新增装饰位图；消息里的图片属于用户内容，合成演示图片属于验证素材。

2026-09-12 的本地 `scenario-finish-review.md` 结论为 `ship`，范围是五张供应截图及所列源码：`desktop.png`、`intro-320.png`、`desktop-article.png`、`chat-images-desktop.png`、`chat-images-mobile.png`。失败／重试、剪贴板和键盘路径在该终审中仅确认源码，不视为独立交互或安全测试；该结论不是设计稿复刻验收。较早的侧栏终审与测试数量保留为历史证据，以 [ACCEPTANCE.md](ACCEPTANCE.md) 的分轮记录为准。本次文档合并未重新运行浏览器、检测器或 Provider；截图和本地审查报告受 Git 忽略，移动视觉证据限于 Chromium 视口。

2026-09-12 处理过程追加合并依据共享 SDK 的过程、时间线、样式、SVG 原子组件与服务器公开投影，属于代码主导的细化，没有新增已批准的视觉稿。终审交接确认自定义品牌色状态／焦点和更新时详情焦点／滚动两项修复已解决，复核结论为 `ship`，范围限于这两项修复。供应截图为 `.impeccable/review/` 下 `process-running-desktop.png`、`process-running-mobile.png`、`process-completed-desktop.png`、`process-completed-mobile.png`、`process-expanded-desktop.png`、`process-waiting-mobile.png`、`process-custom-accent-desktop.png` 与 `process-detail-continuity-mobile.png`；详情连续性证据对应焦点及 150px 内部滚动穿过真实完成更新的交互断言。本次文档合并查看展开桌面与详情连续性手机截图并核对源码，没有重跑交互、检测器或 Provider；其余验证以 [ACCEPTANCE.md](ACCEPTANCE.md) 的分轮记录为准。

2026-09-12 输入区追加合并依据共享 SDK 的 composer、样式、页面组合与 [输入对齐说明](../../docs/composer-alignment.md)，保留既有双模式身份。供应截图为 `.impeccable/review/` 下 `composer-desktop.png`、`composer-dark.png`、`composer-mobile.png`、`composer-compact-settings.png`。新终审复核为 `ship`，仅确认 F1 手机选择器文字裁切已通过换行修复，不代表整个界面再次通过终审。机械扫描没有新增输入区发现，仅保留范围外既有 Markdown 中性引用边线提示。文档合并核对源码并查看手机与紧凑设置截图，未重跑浏览器或 Provider；功能与本地真实模型验证以 [ACCEPTANCE.md](ACCEPTANCE.md) 分轮记录为准，不宣称线上 WorkBuddy、iOS 真机软键盘或 ASR 已验证。

2026-09-12 回复展示追加合并依据共享 SDK 的 process、message、markdown、streaming、styles 与 page，以及 [回复展示说明](../../docs/reply-display-alignment.md)。这是现有白色／蓝灰开发工具界面的 Operate 细化，没有新视觉世界或视觉稿。新独立终审结论为 `ship`，范围是五张供应截图及抽查代码，未发现需要实质 UI 修复的问题。截图位于 `.impeccable/review/`：`reply-thinking-desktop.png`、`reply-thinking-mobile.png`、`reply-tool-dark.png`、`reply-completed-desktop.png`、`reply-completed-mobile.png`。本次文档合并已查看五图并核对实现；交接的确定性 Engine／HTTP／Chromium 验证通过有界逐帧与字素、代码节点／复制／焦点连续性、滚动跟随、减少动态效果、刷新与卸载检查。本次文档工作未重跑交互或真实供应商，终审不等于真实供应商行为、线上 WorkBuddy 或 iOS 真机认证；新增真实供应商证据仅以 [ACCEPTANCE.md](ACCEPTANCE.md) 分轮记录为准。私有报告与截图继续保持 Git 忽略。

## Do's and Don'ts

### Do:

- **Do** 每个接入步骤说明代码位置、前置配置与成功标志。
- **Do** 让表格和代码在自己的区域滚动。
- **Do** 保留清楚的焦点样式和可访问名称。
- **Do** 使用现有 SDK 的公开入口和主题配置。
- **Do** 平等呈现三条场景入口，按真实交付状态提供链接，并把图片状态与恢复操作留在输入区。
- **Do** 保持模式入口可见，让欢迎内容与长建议自然换行，并把输入区留在对话容器底部。
- **Do** 只为已核对的文档或源码路径生成资料链接，显示源码快照与行号。
- **Do** 保留左栏当前项、具名详情滚动区及关闭后的焦点返回，在主题切换时保留文档浮窗尺寸。
- **Do** 保持处理过程的真实顺序、主动展开和阅读位置，让最终回答、用量与待处理问题在过程收起后仍可见。
- **Do** 保留原生编辑节点、中文输入法保护、输入焦点和选区，让窄屏模型／Skill 选择器以可读字号换行。

- **Do** 保留公开思考、供应商摘要、工具和最终回答的独立层级；短缓冲更新保持代码、复制、焦点、选区及上翻阅读位置。

### Don't:

- **Don't** 不把本机配置、预设模型或开发状态写成面向所有用户的事实。
- **Don't** 不在正文中添加与任务无关的装饰标签或大面积背景效果。
- **Don't** 不把模型输出当作可执行 HTML。
- **Don't** 不把尚未执行的验证写成通过。
- **Don't** 不把未发布交付形式做成下载按钮，也不把未发送图片写入持久化草稿。
- **Don't** 不把传统页助手的默认折叠行为套用到 AI 页面主体。
- **Don't** 不用双重欢迎区内边距或初始滚动到底部挤掉空会话的标题和建议。
- **Don't** 不把未知工具清单显示为零，也不让公开工具说明暴露原始配置或覆盖本轮运行快照的事实。
- **Don't** 不补造未发生的能力、进度或费用，不把私有推理或原始工具载荷展示为公开过程，也不把等待说明画成本站已提供的审批表单。
- **Don't** 不用可点击占位动作暗示未接入的语音或附件能力，也不为容纳工具栏而裁切正常选择名称或缩小窄屏选择器字号。
- **Don't** 把未获授权的推理、原生签名或遮蔽块当作公开思考，也不补造未收到的文本、重放历史打字或持续播放离屏状态动画。
