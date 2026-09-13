# Agent Engine

Agent Engine 帮你把 AI 模型接进自己的程序：模型负责理解和回答，引擎负责调用工具、保存对话、记录用量，并处理失败、取消和恢复。

项目提供一个可以直接操作的**本地测试页面**，也提供供开发者调用的 **TypeScript SDK**。第一次使用，不需要先读技术设计或写代码。

## 第一次来，从这里开始

**[打开《新手上手指南》](docs/getting-started.md)**：从打开终端、准备环境开始，一步步运行页面并完成第一次测试。每一步都有成功标志。

| 你想做什么                     | 看这份文档                                          |
| ------------------------------ | --------------------------------------------------- |
| 浏览带聊天助手的官方文档站     | [文档站启动与维护](examples/docs-site/README.md)    |
| 把 IM 图标接进自己的管理后台   | [前端 SDK 接入教程](docs/frontend-sdk.md)           |
| 在 IM 调整工具、Skill 和记忆开关 | [会话配置网页与 API](docs/chat-settings.md) |
| 给聊天传递可信页面范围 | [宿主上下文与范围冻结](docs/chat-context.md) |
| 从零安装、启动项目             | [新手上手指南](docs/getting-started.md)             |
| 聊天、测试工具、查看 Debug     | [测试页面操作手册](docs/local-playground.md)        |
| 配置模型、更换 API Key         | [模型与凭据配置](docs/local-model-configuration.md) |
| 启动失败、页面报错、回答不完整 | [常见问题与排查](docs/troubleshooting.md)           |
| 写第一段调用引擎的代码         | [SDK 入门教程](docs/sdk-quickstart.md)              |
| 查更多文档和技术约定           | [文档导航](docs/README.md)                          |

## 已经配置过，直接启动

先打开 Docker Desktop，再在终端运行。下面的路径是当前这台电脑上的项目位置；换电脑时改成自己的项目目录。

```sh
cd /Users/circle/git/agent-engine
docker start agent-engine-test-pg
pnpm playground
```

保持这个终端运行，然后打开：

- [IM SDK 管理后台示例](http://127.0.0.1:4318/embed/)：点右下角图标聊天，体验换肤和页面内嵌。
- [本地测试页面](http://127.0.0.1:4318)：选模型、发消息、看回答。
- [Debug 调试页面](http://127.0.0.1:4318/debug/)：查看会话的执行记录和错误。

在测试页选择「工具调用」，发送「请调用工具查询 DEMO-1 的库存」，就能测试一次完整的模型与工具协作。演示库存为 24 件。页面使用真实模型，会产生供应商用量；密钥由服务端读取，不需要填到网页里。

如果服务已经在运行，直接打开链接即可。第一次安装或遇到错误，请按[上手指南](docs/getting-started.md)操作。

## 打开官方文档站

在模型与数据库已配置的项目目录运行 `pnpm install --frozen-lockfile`，再运行 `pnpm run docs`。打开 <http://127.0.0.1:4320/>，默认进入使用本项目 SDK 的 AI 对话模式，可查询文档、API、示例和已提交的公开源码。顶部切换“阅读文档”，按环境、对话、图片、工具、Skill、记忆和 Debug 等场景阅读手册；两种模式共享会话。尚未配置模型时，可用 `pnpm run docs --read-only` 阅读和搜索。详细说明见 [文档站使用说明](examples/docs-site/README.md)。

## 开发者入口

当前六个包通过工作区使用，聊天接入相关包也可打成本地安装包，尚未发布到 npm：

| 包                           | 用途                                           |
| ---------------------------- | ---------------------------------------------- |
| `@agent-runtime/sdk`         | 创建引擎、管理会话、调用模型和能力             |
| `@agent-runtime/testing`     | 使用预设模型和工具编写确定性测试               |
| `@agent-runtime/debug`       | 提供需鉴权的只读调试页面                       |
| `@agent-runtime/chat-core`   | 通用聊天协议、HTTP transport、状态控制器       |
| `@agent-runtime/chat-ui`     | Token / 原子 / 业务 / 页面四层，悬浮和嵌入入口 |
| `@agent-runtime/chat-server` | 对接宿主身份与 Engine 的 Node HTTP 桥          |

管理后台接入、React / Vue / HTML 示例、皮肤与品牌色设置见[前端 SDK 教程](docs/frontend-sdk.md)。`pnpm example:export` 导出可在仓库外安装的后端、前端和全栈示例，包含本地依赖包与完整配置。产品交付形式仍待确定，公共 npm、CLI、压缩包与安装包保留入口。

场景文档、API 与图片能力的改动和迁移说明见[优化总结](docs/usage-optimization-summary.md)。

`pnpm example basic` 可运行不消耗真实模型额度的示例；`pnpm check` 执行类型检查、构建和自动测试。两者需要专用 PostgreSQL 测试库。全部命令及运行条件见[上手指南的命令表](docs/getting-started.md#常用命令)。

首版已实现会话持久化、工具与 Skill、知识检索、Memory、审批、恢复及用量记录；这些能力并非都提供网页操作入口。分布式调度、真实重放和监控产品不在当前范围。实现与验收证据见[首版验收报告](docs/release-acceptance.md)。

聊天界面支持有序处理过程：模型活动、Skill、工具、检索/记忆、重试和等待均按真实事件展示，支持安全摘要、耗时、用量与刷新恢复。[架构评估与 API 改动](docs/chat-process-architecture.md)说明实现及边界；运行 `pnpm verify:chat-process` 验证完整 HTTP/浏览器路径。

聊天输入区现支持长文本展开、快捷键设置、模型和 Skill 选择；服务端从已声明配置生成可用目录，选择按 Run 冻结。Skill、展开编辑和快捷键位于输入设置，未接入语音时隐藏入口。接入与兼容性说明见[输入编辑与模型选择](docs/composer-alignment.md)。

发送后立即显示问题与发送状态，切换已浏览会话时先显示缓存再更新；历史列表不会阻塞当前回复。慢请求、重试和连续输出可用 `pnpm verify:chat-responsiveness` 验证，证据与限制见[聊天体验验收](docs/chat-ui-experience.md)。

回复渲染、公开思考配置和 API 变更见[回复展示改进](docs/reply-display-alignment.md)。`pnpm verify:stream-cadence` 可复测小批次文字、长 Markdown 和桌面/窄屏出字节奏。元素顺序、局部收起与动效见[呈现行为](docs/reply-presentation-behaviors.md)，运行 `pnpm verify:reply-presentation` 验证完整状态序列。

文档助手现已接入 Skill、正式知识库、审批写入的跨会话记忆、HTTP/MCP 与问题表单；还可通过 [历史会话工具](docs/session-history-tools.md) 搜索和读取自己的其他对话，无需先保存为长期记忆。从「能力与记忆」打开配置实验及会话调试。接入范围、API 变化和验证证据见 [文档站能力覆盖](docs/docs-capability-coverage.md)。

Anthropic-compatible 的同批工具结果已按一条消息回传，协议和真实 Thinking 续聊验证见[兼容修复](docs/model-tool-batch-fix.md)。显式运行 `pnpm exec tsx scripts/smoke-anthropic-tools.ts <本地模型配置名>` 可做合成真实模型检查。
