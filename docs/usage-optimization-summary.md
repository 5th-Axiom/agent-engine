# 场景接入与图片能力优化总结

完成日期：2026-09-12。用户授权调整文档、界面和公开 API；本轮未提交 Git、发布包或部署公网服务。

## 改动的出发点

先让接入者围绕一个具体任务，从准备环境一直走到结果验证。难以写成完整示例的地方同步改善 API，不用隐含初始化、未定义业务函数或模型一定会选择某个能力的假设填补接入步骤。

传统模式整理为 25 篇文章，主线按场景编排：环境准备、创建和恢复会话、发送图片、调用工具、调用 Skill、检索知识、读取记忆、进度与取消、Debug、嵌入界面、登录和自定义。类型、默认值、授权动作和错误放在独立 [API 参考](../examples/docs-site/content/api.md)。旧能力聚合页保留为索引，已有入口继续可访问。

## 三条可以独立运行的接入路径

首页并列提供“创建对话”“嵌入界面”“完整示例”。运行 `pnpm example:export` 后，得到 `.local/integration-examples/` 下三个目录：

| 目录 | 接入目标 | 随目录提供的内容 |
| --- | --- | --- |
| backend | 后端调用 Agent 能力 | 初始化、模型配置、对话和七个场景脚本、环境模板、本地 SDK/Debug 包 |
| frontend | 前端连接已有聊天服务 | 页面挂载、静态服务、接口地址配置、本地聊天包；支持显式跨域和登录凭据 |
| fullstack | 从页面到后端完整接入 | 已验证身份的聊天桥、页面构建、回环本地 Basic 登录示例与所有依赖包 |

每个目录包含 package.json、TypeScript 配置、README、环境模板和相对路径依赖覆盖，可以移出仓库安装。需要使用者自己的数据库、模型配置和稳定的 PROTOCOL_KEY。示例业务库存、知识和记忆明确使用合成数据；接入生产业务时替换相应实现。

交付形式由 [delivery.ts](../examples/docs-site/delivery.ts) 独立维护。目前源码和本地 SDK 开发包可用；公共 npm、CLI、压缩包、安装包标记为待确定，不提供无效下载按钮。导出示例是当前接入辅助工具，不预先决定正式产品形态。

## API 改动与迁移

| API / 契约 | 改动 | 对现有接入的影响 |
| --- | --- | --- |
| `defineSessionConfig` 等作者接口 | 导出 SessionConfigInput、ToolInput、SkillInput、KnowledgeBaseInput、OutputInput，保留 Zod / JSON Schema 输入；配置错误包含字段路径和类别 | 能在编写时发现以前被 unknown 遮蔽的问题；外部未知配置先走 parseConfig |
| `defineBoundTool` | 一处定义输入/输出 Schema、版本、副作用和 execute，返回 definition 与 bindings；参数类型由 Zod 推导 | 新增便捷入口；原 defineTool + 手工 Binding 仍可用，Session 仍须显式启用工具 |
| `RunInput.skill` | 显式选择已声明 Skill，在首个模型请求前应用指令和工具子集 | 可直接写“调用 Skill”的确定路径；原模型自行选择/退出保留。Skill 选择参与请求幂等 |
| `uploadImage / readImage / deleteImage` | 用可信主体导入、读取和撤销图片；ImageAttachment 只含类型与不透明 ID | 新增接口，需要稳定 protocolKey；业务历史图片先经过宿主授权再导入 |
| `RunInput.attachments` | 支持文本或 JSON 搭配多图；工具结果中的嵌套 ImageAttachment 也可进入模型上下文 | 已有纯文本 Run 无需迁移；图片摘要和引用参与冻结与幂等 |
| `ImageStorage` | 可选的带 version 的 put/get/remove，用于宿主持久对象存储；接收加密 JSON | 缺省继续使用 EngineStore；存储版本改变明确拒绝恢复，需要主动迁移 |
| 模型视觉契约 | 模型 capabilities.images、适配器 images 能力和 limits.maxImageInputTokens | 三项满足后才发送图片；每图预算采用宿主提供的保守上限，真实 Usage 单独记账 |
| Chat 服务与 Transport | createChatHandler 的 images 开关；上传/读取路由；配置和会话公开视觉能力；可选 uploadImage/readImage 方法 | 标准 HTTP Transport 已实现；旧自定义 Transport 仍可只支持文本 |
| Chat 控制器与时间线 | addImages、retryImage、removeImage、clearImages、snapshot.images；低层时间线可传 readImage 并 destroy | 现成页面/浮窗自动接好；直接使用低层组件时按生命周期清理 |

图片接入顺序：配置真实视觉模型与每图预算 → 提供稳定 protocolKey → 后端开启 images → 使用现成聊天挂载组件，或上传后将引用交给 Run。详见[完整图片场景](../examples/docs-site/content/images.md)。

## 图片能力和可靠性

- 前端支持选择、粘贴、拖拽、预览、移除、上传失败重试，以及纯图片消息；支持 PNG/JPEG/WebP/GIF，单张 5 MiB，每条 8 张。上传完成后才能发送。
- 普通 Run/Step、事件和聊天快照保存图片引用、类型、字节数、摘要和到期时间。实际内容加密存储，只在鉴权读取和模型派发时解密。浏览器预览使用临时 object URL。
- 图片内容不可变；受理后的重试沿用同一引用和摘要。模型派发前重新检查权限、到期状态和内容摘要，撤权不能通过重试绕过。
- 工具可以返回历史会话中的图片，原始角色、时间、消息顺序保留在业务 JSON 中。OpenAI 兼容协议在完整工具响应批次后附加带来源标记的图片块；Anthropic 兼容协议将图片放进 tool_result.content。
- PostgreSQL 重启恢复受理后的图文 Run，并在同一会话继续追问。保持数据库、身份、密钥和存储版本稳定。
- 默认保留 30 天，可指定最多 365 天。过期清理移除加密正文并保留到期元数据；外部上传先记录到期信息，上传中断后对象仍可清理。上传未发送的图片也受相同保留规则约束。
- 内容缺失或损坏报 IMAGE_UNAVAILABLE，到期报 IMAGE_EXPIRED，模型不支持报 MODEL_CAPABILITY_MISMATCH。含失效图片来源的历史读取/继续发送会明确失败；需要重新导入合法图片并使用新的有效输入。

## 文档与聊天体验

搜索结果展示真实命中片段并高亮关键词，点击直接进入命中章节。正文代码带文件名、语法高亮和复制按钮；场景代码来自参与类型检查的源文件，检查页面与源文件内容一致。

助手回答支持安全 Markdown、列表、表格、链接和可复制代码块。原始 HTML 不执行，Markdown 远程图片不自动加载；附件通过单独鉴权接口展示。文档正文代码有语法高亮，聊天代码目前提供排版和复制。已有白名单来源链接、主题、键盘导航、阅读位置和文字草稿衔接保留。

桌面与移动界面保持原有视觉风格，场景目录和三个入口更明确。独立终审 disposition 为 ship；设计记录已按实际实现同步。

## 验证证据

| 检查 | 实际结果与覆盖 |
| --- | --- |
| `pnpm check` | 类型检查、构建、31 个测试文件 / 146 项通过，包含真实 PostgreSQL 集成与恢复测试 |
| 文档站验证 | 25 篇文章、32 组检查通过；附加验证搜索章节锚点、命中高亮、文件名/语法高亮、未确定交付入口和代码与源文件一致 |
| 聊天浏览器回归 | 20 组检查通过，确定性模型，无浏览器错误 |
| 图片浏览器验证 | 上传失败/重试、纯图片发送、实际传入模型字节、安全 Markdown/复制、刷新历史、移除、粘贴/拖拽、移动布局与销毁 |
| 独立消费验证 | 三条路径在临时目录安装并类型检查；后端跨进程续聊及工具/Skill/知识/记忆/事件；全栈登录、发送、刷新；独立前端跨域认证发送 |
| 图片可靠性 | 内容加密、同租户跨主体隔离、缺失/损坏、存储版本变化、过期与上传中断清理、重试前撤权、受理崩溃后的 PostgreSQL 恢复 |
| 真实视觉模型 | 已授权 DeepSeek 视觉 Profile：两张合成图片随机编号与顺序识别、重启后颜色追问、工具返回历史图片，三阶段通过；无真实用户图片作为测试素材 |
| 标准视觉协议 | OpenAI / Anthropic 两种兼容协议均通过实际本地 HTTP 图片块验证；Anthropic 视觉未做真实供应商 smoke |
| 独立界面终审 | 五张桌面/手机截图与实现抽查，结论 ship；截图和详细审查位于忽略目录 |

可复验命令：`pnpm check`、`pnpm verify:docs`、`pnpm verify:chat-ui --functional-only`、`pnpm verify:images-ui`、`pnpm example:export` 后运行 `pnpm exec tsx scripts/verify-integration-examples.ts`。真实模型验证使用 `pnpm smoke:images 已授权视觉Profile`，会产生供应商用量；Profile 保存在忽略的本地文件，不把密钥传入命令行。

## 保留的边界

正式交付方式待确定。没有添加分布式调度、真实 replay 或监控产品，也没有通用文件、视频或语音输入。图片签名与类型检查不等于完整解码验证，具体模型的格式/尺寸约束仍需在宿主和供应商端校验。每图 Token 上限由宿主配置，无法用统一数值代替所有模型。

未发送的图片草稿不跨页面持久化。过期图片不会自动恢复或延长保留期，密钥更换和外部存储迁移也需要明确处理。工具授权、未知写副作用、冻结配置、单库管理锁和预算账本维持既有约定，扩展选择见 [ADR 0006](adr/0006-scenario-usage-and-images.md)。

文档助手的文章可在重启后读取本轮改动；公开源码检索仍固定在启动时 Git HEAD 的白名单快照，未提交源码不会进入该索引。真实文档回答仍可能遗漏步骤，原有准确性限制保留，完整接入以可执行场景示例和公开 API 参考为准。

## 后续追加：聊天处理过程

2026-09-12 按用户要求先评估架构，确认现有持久事件、聊天投影和组件分层足以支持 WorkBuddy 式过程展示。已补充真实活动信号、可选 process DTO、安全查询/结果摘要与共享过程组件；执行时展开，完成后可收起，详情和焦点在轮询中保持。公开 API 均为兼容的新增字段或组件。完整变化、数据边界及验证见[聊天过程架构与实现](chat-process-architecture.md)。本次没有启用文档助手的跨会话记忆，记忆步骤仅在宿主实际配置并调用时出现。

## 后续追加：输入编辑与模型选择

2026-09-12 延续 WorkBuddy 式使用体验，在现有 composer → controller → chat-server → Engine 分层上直接实现自动增高、展开编辑、发送快捷键设置、中文输入法保护和上一条文字找回。工具栏提供真实配置的模型及 Skill 选择，图片入口随所选模型能力变化；麦克风因尚无 ASR 服务而置灰。原生编辑、图片草稿、冻结请求和重试语义保留。

公开 API 兼容新增模型/Skill 目录、ChatTransport.sendMessage 的 modelId / skillId、ChatRun 选择字段、控制器选择方法，以及挂载 sendShortcut 和组件 destroy；无需更改 Engine 的 RunInput 接口。具体契约、宿主配置和未实现能力见[输入编辑与模型选择](composer-alignment.md)。
