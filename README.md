# Agent Engine

Agent Engine 帮你把 AI 模型接进自己的程序：模型负责理解和回答，引擎负责调用工具、保存对话、记录用量，并处理失败、取消和恢复。

项目提供一个可以直接操作的**本地测试页面**，也提供供开发者调用的 **TypeScript SDK**。第一次使用，不需要先读技术设计或写代码。

## 第一次来，从这里开始

**[打开《新手上手指南》](docs/getting-started.md)**：从打开终端、准备环境开始，一步步运行页面并完成第一次测试。每一步都有成功标志。

| 你想做什么                     | 看这份文档                                          |
| ------------------------------ | --------------------------------------------------- |
| 浏览带聊天助手的官方文档站     | [文档站启动与维护](examples/docs-site/README.md)      |
| 把 IM 图标接进自己的管理后台   | [前端 SDK 接入教程](docs/frontend-sdk.md)           |
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

在模型与数据库已配置的项目目录运行 `pnpm install --frozen-lockfile`，再运行 `pnpm run docs`。打开 <http://127.0.0.1:4320/>，即可搜索文档、按步骤上手，或点击右下角图标询问文档助手。尚未配置模型时，可用 `pnpm run docs --read-only` 阅读和搜索。详细说明见 [文档站使用说明](examples/docs-site/README.md)。

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

管理后台接入、React / Vue / HTML 示例、皮肤与品牌色设置见[前端 SDK 教程](docs/frontend-sdk.md)。`pnpm pack:chat` 生成可安装的本地包，安装时按教程设置内部依赖覆盖。

`pnpm example basic` 可运行不消耗真实模型额度的示例；`pnpm check` 执行类型检查、构建和自动测试。两者需要专用 PostgreSQL 测试库。全部命令及运行条件见[上手指南的命令表](docs/getting-started.md#常用命令)。

首版已实现会话持久化、工具与 Skill、知识检索、Memory、审批、恢复及用量记录；这些能力并非都提供网页操作入口。分布式调度、真实重放和监控产品不在当前范围。实现与验收证据见[首版验收报告](docs/release-acceptance.md)。
