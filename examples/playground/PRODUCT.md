# Agent Engine 本地测试页

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

项目开发者在自己的电脑上手动验收 Agent Engine。用户已明确确认：选择模型、输入问题、查看流式回答与工具调用、查看用量、取消运行、继续对话，并打开已有 Debug 页面。

## Operating context

沿用 TypeScript/Node 宿主及现有 Debug 的 HTML/CSS 技术与视觉约定。只有回环监听，独立本地 PostgreSQL 数据库保存会话；模型来自已授权的本地 Profile，Token 由服务器解析 Secret 引用。

## Capabilities and constraints

自由对话和合成只读工具两种测试场景；每个会话固定模型和场景，切换模型开始新会话。Debug 保持只读，不从页面重放模型或业务操作。模型费用由调用产生，Usage 未知必须明确展示；不展示原生 Thinking 或 Token。

## Product principles

- 打开即能输入，不要求再次粘贴模型密钥。
- 运行结果、进行中的草稿、错误和取消状态明确区分。
- 调试信息与当前会话关联，刷新可继续读取真实持久记录。
- 延伸已有朴素开发工作台，不新增品牌或营销设计。
