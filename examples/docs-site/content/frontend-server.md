**目标：** 前端请求 /api/agent-chat 时，使用你已有的登录身份调用 Agent。代码放在 Node 后端，浏览器不安装后端 SDK，也不接收模型密钥。

如果公司已经提供了兼容聊天接口，前端只需配置它的 baseURL 和登录方式。本页面向负责提供该接口的开发者。

## 接入前需要三样东西

1. 一个常驻的 Engine 实例和 Session 配置，按[后端 SDK 接入](/docs/sdk/)中的 settings.ts、backend.ts 创建。
2. 已有的登录验证函数，成功返回可信的 tenantId 和 subjectId，失败返回 null。
3. 已有的业务授权函数，作为 createBackend 的 authorize 参数，判断该用户是否可访问指定会话、模型、凭据和能力。

登录验证解决“是谁”，authorize 解决“能访问什么”。不要直接信任请求体中的 tenantId，也不要用固定用户身份处理所有人的请求。

## 1. 创建聊天接入桥

安装 chat-server、chat-core、sdk 后，将下面的代码保存为 chat-server.ts：

{{code:chat-server.ts}}

verifyLogin 需要连接你的现有 Cookie 会话或业务 Token 校验。上例只演示一个对授权用户开放的助手；需要不同用户看到不同助手时，在 resolveContext 内按身份筛选 assistants，模型配置仍由服务器提供。

## 2. 接入现有服务启动代码

下面是宿主集成片段，verifyExistingLogin 和 authorizeAgentRequest 来自**你自己的登录与权限模块**，需替换为实际实现；它们不是 SDK 内置方法。

```ts
import { createServer } from "node:http";
import { createBackend } from "./backend.js";
import { connectChat } from "./chat-server.js";
import { verifyExistingLogin, authorizeAgentRequest } from "./auth.js";

const { engine, config } = await createBackend({
  principal: { tenantId: "my-app", subjectId: "chat-service" },
  authorize: authorizeAgentRequest,
});
const chatHandler = connectChat({
  engine,
  config,
  frontendOrigin: "http://localhost:5173", // 浏览器地址栏里的 origin
  verifyLogin: verifyExistingLogin,
});

const server = createServer(async (req, res) => {
  try {
    if (await chatHandler(req, res)) return;
    res.writeHead(404).end("Not found");
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(3000, "127.0.0.1");
// 在你的应用退出流程中关闭 server，再 await engine.close()。
```

已经有 HTTP 服务时，只需把 chatHandler 放进现有路由，不必再建一个 server。Express 中应挂在会消费正文的中间件之前。不要每来一个聊天请求就创建 Engine；同一数据库只允许一个管理实例。

## 3. 对齐 URL 与登录方式

最短路径是同源 Cookie 登录：前端访问 /api/agent-chat，网站代理把该前缀转给 Node 后端。开发前端在 localhost:5173、后端在 3000 时，可在前端开发服务中配置这个代理；allowedOrigins 仍填写浏览器 origin。

业务系统使用短期访问令牌时：

```ts
const transport = createHttpChatTransport({
  baseURL: "/api/agent-chat",
  headers: async () => ({
    Authorization: "Bearer " + (await getBusinessAccessToken()),
  }),
});
```

getBusinessAccessToken 由你的登录模块提供。它返回业务令牌，不是模型 API Key。每次请求取最新值，避免刷新令牌后仍发送旧值。

确需跨域时，前端设置 allowCrossOrigin: true；后端 allowedOrigins 精确允许前端 origin。跨域 Cookie 还需前端 credentials: "include"、后端 allowCredentials: true，并由宿主正确设置 Cookie。仅修改 baseURL 不足以完成跨域接入。

## 接入完成后检查什么

- 前后端的接口前缀一致，浏览器能取得助手列表并完成一次回答。
- 未登录请求被拒绝；切换账号后不能看到上一账号的会话。
- 浏览器只提交助手 ID 和文本，不能修改模型、工具或用户身份。
- 重启后保持 namespace、数据库及 PROTOCOL_KEY 稳定，以便恢复原有会话。

模型、工具及系统说明在后端的 config 中配置。前端 SDK 自动展示聊天状态和常见错误，更多界面行为见[主题、组件与对话管理](/docs/frontend-customize/)。
