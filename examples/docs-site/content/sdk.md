**目标：** 在你自己的 Node 项目中创建一个 Agent，发送消息，拿到回答并继续对话。只需后端 SDK，不必安装前端 SDK；你可以把结果返回给自己的页面，也可以用于服务端任务。

直接运行完整目录可先[导出 backend 示例](/docs/integration/)。下面展示相同文件的接入方式。

本例调用你配置的真实模型。它不是测试模型或 Playground 脚本。先[安装 @agent-runtime/sdk](/docs/installation/)，准备一个独立 PostgreSQL 数据库和模型访问凭据。

## 1. 准备项目与服务端配置

下面采用 TypeScript + ESM。业务项目的 package.json 需要包含 "type": "module"；与已有配置合并，不要覆盖其他字段。若还没有 TypeScript 运行工具，在自己的项目中安装：

```sh
pnpm add -D typescript tsx @types/node
```

按下列模板准备 .env，再保存 settings.ts，与 backend.ts 放在同一目录。

```dotenv .env
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/YOUR_DATABASE
MODEL_BASE_URL=https://your-model.example/v1
MODEL_NAME=your-model
MODEL_API_KEY=REPLACE_WITH_YOUR_PROVIDER_KEY
PROTOCOL_KEY=REPLACE_WITH_A_STABLE_RANDOM_KEY
```

{{code:settings.ts}}

settings.ts 只在后端读取环境变量并创建会话配置；不会把真实 API Key 放入 Session。

数据库连接使用你已经创建好的库。SDK 会迁移表结构，不会自动创建业务数据库。没有本地数据库时，可参考[本地示例附录](/docs/quickstart/)，为自己的服务另建数据库。

## 2. 创建 Engine

保存为 backend.ts。Engine 是长期存在的运行管理实例，通常在服务启动时创建一次。本文的 Agent 是产品能力的称呼；助手配置用于新建 Session，Session 保存自己的配置和历史，每次 run 冻结本轮配置，见[对象与生命周期](/docs/concepts/#助手-引擎与会话)：

{{code:backend.ts}}

policy.allowedOrigins 限制模型请求可访问的目标；它与聊天接口允许哪个网页调用的 allowedOrigins 是两处不同配置。这里从 MODEL_BASE_URL 取出模型 origin。私网模型或开发代理如果需要网络例外，可按[模型配置](/docs/models/)设置 MODEL_ALLOW_PRIVATE_ORIGIN；本例只对 MODEL_BASE_URL 对应的 origin 开放。

principal 是这份 Engine 的可信身份。下面的脚本用固定服务身份；如果处理多个用户，创建 Engine 时提供 authorize，再通过 engine.forPrincipal(已验证身份) 取得用户作用域，见[连接后端与登录](/docs/frontend-server/)。

## 3. 创建会话并发消息

保存为同目录的 run.ts：

{{code:run.ts}}

createSession 只创建会话，**run 才会调用模型**。第一次回答由 first.outputText 取得。第二次通过 loadSession 加载同一会话，不需要把之前的消息数组重新传一遍。

设置 SESSION_ID 时示例会加载已有会话；未设置时新建会话。要跨进程继续旧会话，由你的业务保存 session.id，下次直接 loadSession。数据库、身份与 PROTOCOL_KEY 需要保持一致。

## 4. 执行并检查结果

在这三个 TypeScript 文件和 .env 所在的业务目录执行：

```sh
node --env-file=.env --import tsx run.ts
```

你应该看到两段模型回答及一个 sessionId。模型会产生实际用量，回答内容不固定。遇到错误时先核对环境变量和数据库，继续看[接入常见问题](/docs/troubleshooting/)。

## 接到自己的业务接口

HTTP 服务可复用同一个 engine，在验证登录后加载用户的 session，再调用 session.run({ input, requestId })，将 outputText 放进你自己的响应结构。请求身份、会话所属关系和 requestId 必须由宿主正确处理。

run 会等待最终结果；要立即拿到 runId 并显示进度，改用 startRun 和[事件接口](/docs/events/)。如果选择现成的前端 SDK，则用[chat-server 接入桥](/docs/frontend-server/)组织协议，无需自己再设计聊天 API。

下一步：[会话与配置更新](/docs/sessions/) → [业务工具](/docs/tools/) → [技能、知识库与记忆](/docs/capabilities/)。
