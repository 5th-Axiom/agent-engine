# Agent Engine 文档站

面向初学者的中文文档站，默认接入本项目的 IM SDK 和文档助手。包含 12 篇文章、中文搜索、目录、代码复制、深浅主题和手机布局。

## 现在就打开

在项目根目录执行。需要 Node ≥ 22.19、pnpm 10.17.1；第一次准备模型和数据库请看根目录的新手文档。

```sh
pnpm install --frozen-lockfile
pnpm run docs
```

打开 <http://127.0.0.1:4320/>，保持终端运行。点击右下角图标提问，或在文章里点击“询问本文”，修改已经填好的问题后发送。按 Ctrl + C 停止本站。

首次默认启动会在现有本地 PostgreSQL 实例中创建 **agent_engine_docs**。它与 Playground 的 agent_engine_playground、测试的 agent_engine_test 分开，不争用同一个 Engine 管理锁。

还没配置模型和数据库时，可以只阅读：

```sh
pnpm run docs --read-only
```

仅阅读模式仍支持搜索与导航。聊天图标会明确说明未连接，并给出配置步骤，没有伪造的 AI 回复。

## 助手如何工作

- 使用 `mountChatWidget`、`createHttpChatTransport` 与 `createChatHandler`，复用现有三包聊天 SDK，没有重新实现 IM。
- 项目问题要求先调用 `docs.search`，仅返回本站公开文章白名单内的标题、路径与正文片段。普通聊天允许跳过检索。
- “询问本文”只填写可编辑草稿，不自动发送，也不覆盖已有草稿。切换文章保留当前聊天。
- 来源路径由模型在纯文本回复中展示；页面末尾将有效的站内路径转换为“助手提到的文档”链接。只接纳本站文章 ID，不把任意模型 URL 当成可信引用。来源不能自动证明答案语义正确。
- 不提供终端执行、文件修改、凭据读取、库存或其他业务工具。

## 模型与私有文件

沿用 `scripts/lib/local-model-config.ts`，从仓库根目录的 `.local/models.json` 和 `.secrets/credentials.json` 读取所选 Profile 的最小凭据集，不另复制密钥。真实调用产生供应商用量。

| 环境变量                     | 默认与含义                                                         |
| ---------------------------- | ------------------------------------------------------------------ |
| AGENT_DOCS_PORT              | 4320；仅监听 127.0.0.1                                             |
| AGENT_DOCS_MODEL_PROFILE     | 集中模型文件里的 default                                           |
| AGENT_DOCS_MAX_OUTPUT_TOKENS | 1536；仅本助手覆盖，允许 256–4096 且小于模型窗口，不改写原 Profile |
| AGENT_DOCS_DATABASE_URL      | 本地 agent_engine_docs；自定义库需预先创建，并与其他 Engine 分开   |

输出上限必须符合所选供应商与模型能力；本次实测只覆盖本机默认模型。正常重启保留原 PROTOCOL_KEY，它同时用于派生本站独立的 Cookie 签名 Key，原始密钥不会发到浏览器。

## 内容维护

`content.ts` 保存入门、配置、操作和排错文章。三份较长教程直接读取 `docs/frontend-sdk.md`、`docs/sdk-quickstart.md`、`docs/sdk-usage.md`；页面与助手共享同一份内容，重启后同步更新。

`render.ts` 通过 Marked 渲染服务端 HTML。外部链接仅允许 HTTP(S)，原始 HTML 作为文本显示，代码转义；静态资源使用精确白名单。没有公开目录遍历或源码下载接口。历史设计、参考项目说明和私有目录不进入检索。

前端通过同源 JSON 读取文章，保留聊天实例；直接打开文章路径仍有完整服务端 HTML。搜索在浏览器完成，不调用模型。不支持 JavaScript 时仍可阅读正文、使用普通导航链接。

## 验证

```sh
# 全项目类型检查
pnpm typecheck

# 确定性模型 + 独立内存 Engine + Chromium，不消耗模型额度
pnpm verify:docs

# 本站默认模式运行后：真实模型问答，会产生模型用量
pnpm smoke:docs
```

浏览器验证需要已经安装 Chromium：`pnpm exec playwright install chromium`。截图和真实问答记录在被 Git 忽略的 `.impeccable/review/` 中。结果与限制见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 本地与公网边界

这是完整的本地文档宿主，本次没有部署或发布。匿名访问使用签名、30 天有效的 HttpOnly / SameSite=Strict Cookie 区分浏览器；服务端通过可信主体加载会话，限制 Origin 和 Host。每个访客每小时最多 60 次新建或发送请求，取消不受此额度影响；计数仅保存在当前进程中。Cookie 隔离不等于真实用户登录，同一浏览器配置里的标签页会共享访客身份。

公网部署需要另行接入 HTTPS、正式身份或访客生命周期管理、持久限流/日级预算、数据库备份与数据保留策略。不能把本地匿名宿主直接当成已完成的生产客服网关。普通浏览不产生模型调用，发消息才会。
