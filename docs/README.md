# 使用文档导航

准备接入自己的产品，请从 **[官方文档站的前后端 SDK 接入手册](../examples/docs-site/README.md)** 开始，选择前端界面接入或后端能力调用。只想先体验源码演示时，再看[本地上手指南](getting-started.md)。

也可以使用带搜索和聊天助手的 **[官方文档站](../examples/docs-site/README.md)**；启动后打开 <http://127.0.0.1:4320/>。

## 使用项目

| 文档                                           | 解决的问题                                             |
| ---------------------------------------------- | ------------------------------------------------------ |
| [新手上手指南](getting-started.md)             | 项目是什么、环境怎么准备、第一次怎么运行、以后怎么启动 |
| [测试页面操作手册](local-playground.md)        | 怎么聊天、调用工具、继续对话、查看 Token 和 Debug      |
| [模型与凭据配置](local-model-configuration.md) | 模型地址和 API Key 分别填在哪里、如何初始化或更新      |
| [常见问题与排查](troubleshooting.md)           | 根据页面现象或错误代码找到下一步操作                   |
| [前端 SDK 接入教程](frontend-sdk.md)           | 在管理后台放聊天图标、换肤、移动适配、连接登录系统     |
| [SDK 入门教程](sdk-quickstart.md)              | 跑通第一段代码，再接工具、真实模型与更多能力           |
| [SDK 使用约定](sdk-usage.md)                   | 查询配置、幂等、授权、恢复、事件和用量的精确规则       |

只想体验页面：上手指南 → 测试页面操作手册。

准备直接调用后端：文档站“后端 SDK” → 模型配置 → 会话、工具和事件；SDK 使用约定用于查询精确接口。

准备接入管理后台：文档站“前端 SDK” → 后端接口与登录 → 主题和对话管理。无需先运行本地 Playground。

## 了解实现与支持范围

| 文档                                                                      | 用途                                       |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| [首版验收报告](release-acceptance.md)                                     | 哪些行为已验证、用了什么证据、还有哪些边界 |
| [技术设计](technical-design.md)                                           | 架构与可靠性契约，适合修改框架前阅读       |
| [实施计划](implementation-plan.md) / [实施记录](implementation-status.md) | 交付进度和历史验证记录                     |
| [行为卡片](workbuddy-behavior-baseline.md)                                | 参考行为与本项目独立实现的证据对应         |
| [事务 Store 决策](adr/0001-transaction-store.md)                          | 为什么这样处理事务与持久化                 |
| [上下文与宿主约定](adr/0002-context-and-host-contracts.md)                | 上下文、审批和宿主协作边界                 |
| [保留与维护决策](adr/0003-retention-and-maintenance.md)                   | 数据保留、到期清理与维护规则               |
| [前端聊天 SDK 决策](adr/0005-embeddable-chat-sdk.md)                      | 分层、登录隔离与浏览器数据边界             |
| [聊天空间与操作反馈](chat-ui-experience.md)                             | 容器高度、菜单、过程、侧窗与动效的行为验收 |
| [历史会话工具](session-history-tools.md)                                | 文档助手搜索和读取其他聊天、权限与分页     |
| [本地测试页决策](adr/0004-local-playground.md)                            | 页面范围、Debug 挂载与运行排序             |

[参考 Runtime 说明](workbuddy-agent-runtime-usage.md)记录的是参考项目行为；[原始实施任务](implementation-task.md)记录的是建设要求。两者用于追溯背景，当前项目怎么使用请以上面的使用文档和公开接口为准。

本次使用文档按 2026-09-11 的实现整理，命令来自根目录 `package.json`，配置和页面说明已对照本项目源码。
