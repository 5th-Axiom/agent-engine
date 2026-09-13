## 在项目根目录启动

先完成项目依赖、模型和数据库配置，然后依次运行：

```sh
pnpm install --frozen-lockfile
pnpm run docs
```

打开 [文档站](http://127.0.0.1:4320/)。默认读取原有模型与集中凭据配置，首次创建独立的 agent_engine_docs 数据库，不占用 Playground 的数据库。按 Ctrl + C 停止本站。

## AI 模式与传统模式

首页默认进入 AI 模式：一个由本项目前端 SDK 挂载的完整聊天页面。直接输入问题，例如“如何接入我的后台？”“mountChatWidget 的参数在哪里？”“帮我查续聊的示例”。

顶部点击“传统模式”，即可回到原有文档目录、搜索与文章。两种模式共享会话历史，同一标签页切换时保留正在编辑的问题；文章中的“询问本文”仍可打开悬浮助手。直接访问文章链接会打开对应文章。

AI 对话保留 SDK 自带的历史、新建、取消和重试操作。来源会出现在回答中，AI 页面下方的资料链接可打开文章或带行号的源码。

桌面聊天框左侧展示对话列表，点击条目即可切换。顶部“当前会话”可查看会话 ID、创建时间、轮数与配置版本；“工具”可查看名称、用途和权限类型。手机上点击左上角按钮展开对话列表；工具面板可滚动阅读全部内容。两种模式都提供这些入口。

## 还没配置模型，也能阅读

```sh
pnpm run docs --read-only
```

此模式不连接数据库或模型。文档、导航和搜索可正常使用；页面明确提示助手未连接，不会伪装成真实 AI 回答。完成配置后，退出并按默认命令重启。

## 文档与搜索如何更新

文章目录在 examples/docs-site/content.ts，接入教程在 content/ 下，受类型检查的主要示例代码在 snippets/ 下。接口约定和本地示例配置直接读取 docs/ 中对应的手册。修改后重启文档站，页面与助手检索一起更新。

站内搜索在浏览器本地完成，不调用模型。助手提供六个公开资料 Binding：docs.search 搜索文档，docs.read 分页读原文，api.lookup 定位公开 API 声明，examples.find 查示例，code.search 搜代码，code.read 读源码；docs.httpCatalog 和 docs.mcpSearch 通过真实本地 HTTP 与 Streamable HTTP MCP 服务读取公开资料。此外，sessions.search 与 sessions.read 可搜索并分页读取自己的其他聊天，详情见[跨会话读取](/docs/memory/)。标准目录共 10 个工具，由模型按问题选择，不会每轮全部调用。

源码限六个 SDK 包的 src、本站 snippets 及契约／集成／恢复测试，使用启动时 Git HEAD 的已提交版本，不读取未提交改动、密钥或外部参考仓库。修改源码后需提交并重启站点；源码页会显示提交版本和行号。文档正文修改只需重启。

回答支持安全 Markdown 和代码复制，原始 HTML 不执行。视觉模型配置完整时可发送图片。资料链接只校验是否在允许的文档／源码索引内，便于你核对；不能自动证明答案语义正确。助手不能执行命令或修改文件。

## 可调整的启动设置

AGENT_DOCS_PORT 指定本站端口，默认 4320。AGENT_DOCS_MODEL_PROFILE 选择已有模型 Profile。AGENT_DOCS_DATABASE_URL 可指向已经创建好的独立数据库，不能使用另一运行中的 Engine 数据库。

本站沿用所选 Profile 的模型、地址和密钥引用，为文档回答将单次输出上限单独设置为 1536 Token，不改写原配置文件。AGENT_DOCS_MAX_OUTPUT_TOKENS 可在 256–4096 之间调整；须小于模型上下文窗口，并符合供应商实际能力。

## 发布到公网前

当前启动器只绑定 127.0.0.1。它提供完整的本地体验，但没有自动发布或域名配置。正式上线需接入 HTTPS、生产身份与访客策略、跨重启限流和日级预算，以及数据库备份、数据保留和运维。模型密钥仍只留在服务器。


## 能力、长期记忆和配置实验

从 AI 页上方「能力与记忆」，或配置页顶部链接，打开[能力工作台](/ai/capabilities/)。

- **已接入能力：** 查看实际工具、两个 Skill、知识库与记忆目录，跳转对应场景文档。
- **长期记忆：** 查看当前浏览器身份确认保存的偏好、版本与到期时间，并支持删除。读取和写入开关在 IM 会话配置中分别管理。
- **配置实验：** 13 个场景，包括结构化输出／修复、引用核验、模型重试／备用模型、工具参数修复／只读重试、未知写入结果核验、预算、上下文整理、配置版本冻结、事件可观测性和会话生命周期。选择开关并运行，查看实际检查、事件、配置和 Debug 快照。
- **会话调试：** 查看自己的真实文档对话，也可归档或删除空闲会话。

实验使用 Testing 包提供的确定性模型和合成数据，每次创建隔离的真实 Engine + MemoryStore，不请求供应商，不改写文档会话或偏好；报告保存在文档宿主的 Store，保留当前身份最近 20 条。服务重启时未结束的实验标记为未确认，不伪装成成功。

主助手使用 PostgreSQL 持久化。`AGENT_DOCS_CAPABILITY_PORT` 指定本地 HTTP/MCP 公共资料服务端口，默认 4321；请在重启时保持端口稳定，尤其是还有待恢复运行时。它不是外部供应商 MCP，也不提供任意网络访问。

## 追问、表单和写入确认如何接入

服务端助手定义中设置 `interaction: true`，再在 Session `config.interaction.questions`／`structuredInputs` 中声明允许的回答 Schema。审批继续由工具／记忆写入策略产生。SDK 聊天页面自动展示原生输入控件和提交动作；没有开放 interaction 的旧宿主仍只展示等待提示。

自定义界面通过 `transport.resolveInput(sessionId, input)` 继续同一个 Run：

```ts
// transport 来自 createHttpChatTransport；pending 来自当前 Run 的 process.pending。
await transport.resolveInput!(sessionId, {
  id: pending.id,
  kind: "question",
  answer: "先接后端 SDK",
});
```

`question` 与 `structured_input` 提交 `answer`；`permission` 提交 `decision: "allow_once" | "deny"`。服务端重新检查身份、pending ID、Schema、到期和幂等性。不要另发一条普通消息代替 resolveInput。

如需展示写入预览，在宿主 `describePending` 中返回安全的 `question`、`details`；只有显式返回的字段进入浏览器，原始工具参数不会自动外泄。工作实现见 `capabilities.ts` 与聊天包 `pending-input.ts`。

## 验证当前接入

```sh
pnpm typecheck
pnpm test
pnpm verify:docs-capabilities
```

浏览器专项使用合成模型验证真实 Engine/HTTP 与控件闭环；全量测试包含 PostgreSQL、审批重启、SIGKILL 写入故障与恢复。供应商 Smoke 单独执行，不以实验检查替代。部署、运维和 M4/M5 的分布式调度、真实 replay 不在本站运行验证范围中。
