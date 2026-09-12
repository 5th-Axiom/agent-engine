需要完整的登录、HTTP 与前端文件，可直接运行 [fullstack 接入示例](/docs/integration/)。该目录的 server.ts 实现了受限本地 Basic 登录，不包含待补充的函数。下文说明换接你的业务身份体系的位置；authorize 的动作、资源与调用时机见 [API 授权参考](/docs/api/#authorize)。

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

### 给工具面板补充名称与介绍

前端自带“工具”入口。chat-server 会从会话配置中提取工具名称、读写类型和权限状态；想让用户看到更容易理解的介绍，可在上面的助手对象（与 config 同级）增加：

```ts
toolDisplay: {
  "inventory.lookup": {
    label: "查询库存",
    description: "按商品编号查询库存数量。",
  },
},
```

将 inventory.lookup 换成 config.tools 中实际工具的 name。这个字段只提供公开文案，不会注册工具或扩大权限；未配置的工具不会因此出现在清单。label 最多 100 字符，description 最多 500 字符。原始模型工具说明、参数 Schema、执行器和密钥配置不会自动展示给用户。

### 开放会话配置

在助手对象（与 `config` 同级）增加 `settings: true`，再按[前端配置页接入](/docs/frontend-customize/#在独立网页配置当前会话)提供网页和入口。未声明时默认关闭。

网页通过 GET/POST `/api/agent-chat/sessions/:id/settings` 读取和保存。前端只提交 `ifVersion` 与能力选择，后端从助手配置构造下一份 Session 配置，再调用已有的 `replaceConfig`；仍需用户拥有该会话及更新配置权限。未声明能力、任意配置字段及权限提升被拒绝。

工具使用 `toolDisplay`；Skill、知识库、记忆存储可分别通过 `skillDisplay[id]`、`knowledgeDisplay[id]`、`memoryDisplay[id]` 提供公开 label/description。不要放入密钥、内部地址或模型指令。配置页不会注册新工具或安装 Skill。

如果你的宿主主动升级旧会话配置，在已有的版本比较更新之前调用 `restoreChatPreferences(nextHostConfig, previousSessionConfig)`（由 chat-server 导出），保留用户选择。新增能力默认不被自动启用，已撤销能力从选择中删除。

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
- 浏览器提交助手 ID、文本、可选的已授权图片引用和已声明模型/Skill ID。仅在开放配置时保存受限能力选择；不能修改模型地址、凭据、执行器或用户身份。
- 重启后保持 namespace、数据库及 PROTOCOL_KEY 稳定，以便恢复原有会话。

模型、工具及系统说明在后端的 config 中配置。前端 SDK 自动展示聊天状态和常见错误，更多界面行为见[主题、组件与对话管理](/docs/frontend-customize/)。
