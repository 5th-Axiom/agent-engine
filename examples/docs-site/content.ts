import { readFile } from "node:fs/promises";

export interface Article {
  id: string;
  title: string;
  group: string;
  description: string;
  keywords: string;
  markdown: string;
  source?: string;
}
const article = (
  id: string,
  title: string,
  group: string,
  description: string,
  keywords: string,
  markdown: string,
): Article => ({ id, title, group, description, keywords, markdown });
export const siteArticles: Article[] = [
  article(
    "welcome",
    "从第一句「你好」开始",
    "开始使用",
    "先体验一段对话，再把 AI 助手接到你的产品里。",
    "首页 介绍 什么是 能力 入门",
    `
Agent Engine 帮你的应用管理 AI 对话：调用模型、使用获准的工具、保存历史，并留下可查询的执行记录。你可以先用现成页面体验，也可以把聊天图标嵌入自己的管理后台。

## 一条适合新手的路线

1. **准备本地环境** · 安装运行工具，启动数据库。不需要先理解全部技术名词。
2. **发出第一个问题** · 配好模型，在测试页看到一次完整回答。
3. **学会看执行记录** · 分清聊天界面与 Debug，知道失败时去哪里找原因。
4. **接入自己的产品** · 挂上 IM 图标，再按需要换颜色、换皮肤。

## 你现在想做什么

- [第一次在电脑上运行](/docs/quickstart/)：按步骤操作，每一步都有成功标志。
- [已经启动，想试试功能](/docs/playground/)：普通对话、工具调用、停止与续聊。
- [把聊天图标放进后台](/docs/frontend/)：安装、前后端接入、React / Vue 与主题。
- [用代码调用 Agent](/docs/sdk/)：先用预设模型运行第一段代码。

## 随时可以问文档助手

点击右下角的聊天图标，可以问「我第一次该怎么运行？」或者「API Key 放在哪里？」。阅读文章时点“询问本文”，会替你填入关于当前文章的问题；你可以修改后再发送。

助手优先查阅本站资料，也支持普通聊天。它不能查看你的终端、修改你的项目或代替你完成配置。遇到配置问题，描述错误码即可，不要粘贴真实密钥。

## 先了解使用边界

项目当前提供本地测试页、可嵌入的聊天 SDK，以及会话、工具、技能、知识库、记忆和只读调试能力。真实模型由你配置的供应商提供，发送消息会产生相应模型用量。

这是源码交付的开发版本，包还没有发布到公共 npm。分布式调度、模型或工具的真实重放、完整监控平台不属于首版。详见[能力与使用规则](/docs/rules/)。
`,
  ),
  article(
    "quickstart",
    "完成第一次对话",
    "开始使用",
    "跟着做：准备工具 → 启动数据库 → 配好模型 → 发消息。",
    "安装 启动 本地 新手 node pnpm docker postgres 数据库 4318",
    `
你需要已经拿到项目源码。以下操作适用于 macOS / Unix 环境；本地凭据加载器会检查文件权限。所有项目命令都在 agent-engine 文件夹中执行。

## 1. 进入项目文件夹

打开终端，输入 cd 和一个空格，把 agent-engine 文件夹拖入终端，按回车。接着检查：

~~~sh
pwd
ls package.json
~~~

**成功标志：** 显示你的项目路径，以及 package.json。后文出现的 /path/to/agent-engine 都需要替换成你自己的实际路径。

## 2. 检查运行工具

~~~sh
node --version
pnpm --version
docker version
~~~

| 工具 | 本项目要求 | 用途 |
| --- | --- | --- |
| Node.js | 至少 22.19 | 运行服务端程序 |
| pnpm | 10.17.1 | 安装依赖、运行命令 |
| Docker Desktop | Docker 服务可运行 | 在本机运行数据库 |

缺少工具时，按 [Node.js 安装说明](https://nodejs.org/en/download)、[Docker Desktop 安装说明](https://docs.docker.com/desktop/setup/install/mac-install/)准备环境。已经安装 Node.js 后，可运行 npm install -g pnpm@10.17.1 安装项目固定版本的 pnpm。

**成功标志：** 三条命令均可执行，docker version 同时显示 Client 和 Server。只有 Client 时，先打开 Docker Desktop。

## 3. 安装依赖

~~~sh
pnpm install --frozen-lockfile
pnpm build
~~~

**成功标志：** 命令结束后没有失败信息，终端重新出现输入提示符。首次安装需要联网。

## 4. 启动数据库

先检查以前是否创建过容器：

~~~sh
docker ps -a --filter name=agent-engine-test-pg
~~~

已经存在时，只需启动它：

~~~sh
docker start agent-engine-test-pg
~~~

还没有时，首次执行：

~~~sh
docker run --name agent-engine-test-pg \\
  -e POSTGRES_HOST_AUTH_METHOD=trust \\
  -e POSTGRES_DB=agent_engine_test \\
  -p 127.0.0.1:55439:5432 \\
  -d postgres:17-alpine
~~~

这是一套仅用于本机开发的免密码配置，不能直接用于生产部署。再检查是否已就绪：

~~~sh
docker exec agent-engine-test-pg pg_isready -U postgres -d agent_engine_test
~~~

**成功标志：** 出现 accepting connections。

## 5. 选择你的体验方式

**先不接真实模型：** 运行下面的示例，确认执行流程正常。

~~~sh
pnpm example basic
~~~

**成功标志：** 出现 Synthetic first answer 和 Synthetic follow-up。这是预设回答，不消耗真实模型额度，也不能自由问答。

**准备自由问答：** 按[模型与密钥](/docs/models/)配置 .local/models.json 和 .secrets/credentials.json。已经配置过的电脑保留原文件，不需要覆盖。

## 6. 打开聊天测试页

~~~sh
pnpm playground
~~~

保持终端运行，打开 [本地测试页](http://127.0.0.1:4318/)，选择“自由对话”，发送「请用三句话解释 Agent 的工作流程」。

**成功标志：** 页面显示回答，运行状态变成“已完成”。还可以打开 [IM 嵌入示例](http://127.0.0.1:4318/embed/)体验右下角图标。

## 下次怎么启动和停止

打开 Docker Desktop → 进入项目 → docker start agent-engine-test-pg → pnpm playground。已经运行时不用再启动一份。

回到终端按 Ctrl + C 停止页面服务。关闭网页不会停止服务；要取消正在生成的回答，请先点聊天里的“停止”。保留数据库和协议保护 Key，才能继续使用原有历史。

打不开页面时，继续阅读[常见问题](/docs/troubleshooting/)。
`,
  ),
  article(
    "concepts",
    "几个词，一次弄明白",
    "开始使用",
    "先认识模型、会话和工具；其他名词用到时再查。",
    "术语 概念 token session run step attempt engine skill memory",
    `
## 从一次对话理解

你发出「查一下库存」→ 引擎把问题交给模型 → 模型请求库存工具 → 工具返回数据 → 模型整理回答。

| 名称 | 可以这样理解 |
| --- | --- |
| Model · 模型 | 理解问题、生成回答的 AI 服务 |
| Engine · 引擎 | 负责安排、约束和记录整个执行过程 |
| Session · 会话 | 一段连续的对话，可包含多次提问 |
| Run · 一次运行 | 发送一条消息后，到完成、失败或取消的过程 |
| Step · 步骤 | 运行中的一次模型决策阶段 |
| Attempt · 尝试 | 一次实际模型请求；重试会增加尝试次数 |
| Tool · 工具 | 确定的功能，例如查询库存。必须显式提供和授权 |

## 三种 Token 不要混淆

- **模型 Token**：处理文本的计量单位，不直接等于字数或金额。
- **认证 Token / API Key**：调用服务所需的凭据，只放在服务端。
- **设计 Token**：前端颜色、字号、圆角等变量，可以用于换肤。

## 工具、技能、知识库、记忆

工具是“可以做什么”；Skill 是“按什么方法做”；知识库是“去哪里查资料”；Memory 是“在授权范围内记住什么”。它们都要在会话配置中明确声明，不会因为写一句提示词就自动获得。

会话历史与跨会话 Memory 是不同概念。引擎会保存会话记录，但不会自动把所有对话变成跨用户、跨会话记忆。

## 聊天页面与 Debug

聊天页面用来提问、看回答、继续对话。Debug 用来查看配置、步骤、工具执行和用量，适合排查问题。Debug 是只读的，没有“重跑工具”按钮。
`,
  ),
  article(
    "models",
    "模型与密钥",
    "配置与使用",
    "地址和模型名称放一处，真实密钥单独保管。",
    "配置 密钥 api key token secretRef deepseek thinking 权限 600 700 env",
    `
## 两个文件，各管一件事

| 文件 | 保存什么 |
| --- | --- |
| .local/models.json | 模型地址、名称、输出上限，以及密钥的引用名称 |
| .secrets/credentials.json | 真实供应商 API Key 和稳定的 PROTOCOL_KEY |

这两个目录被 Git 忽略。换一台电脑需要单独准备，网页里不需要填写 API Key。不要把真实密钥填进公共模板或发给聊天助手。

## 第一次配置

在项目目录执行；cp -n 会保留已存在的文件：

~~~sh
mkdir -p .local .secrets
chmod 700 .local .secrets
(umask 077; cp -n examples/local-models.example.json .local/models.json)
(umask 077; cp -n examples/local-credentials.example.json .secrets/credentials.json)
chmod 600 .local/models.json .secrets/credentials.json
~~~

在编辑器中打开 .secrets/credentials.json，把 MODEL_API_KEY 的占位值替换成你有权使用的 Key。接着生成首次使用的协议保护 Key：

~~~sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const path = '.secrets/credentials.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
if (config.values.PROTOCOL_KEY === 'REPLACE_WITH_A_STABLE_RANDOM_PROTECTION_KEY') {
  config.values.PROTOCOL_KEY = randomBytes(32).toString('hex');
  writeFileSync(path, JSON.stringify(config, null, 2) + '\\n', { mode: 0o600 });
  console.log('协议保护 Key 已保存，未打印密钥。');
} else {
  console.log('保留已有协议保护 Key。');
}
JS
~~~

PROTOCOL_KEY 用于保护原生协议续接信息。正常重启或更换供应商 Key 时，保留原值；更换它可能让历史会话无法继续。

## 填好模型连接信息

下面是填写结构，地址和模型名称都是占位值，必须改成供应商实际提供的值：

~~~json
{
  "version": 1,
  "default": "primary",
  "protocolKey": { "secretRef": "PROTOCOL_KEY" },
  "profiles": {
    "primary": {
      "model": {
        "provider": "openai-compatible",
        "baseURL": "https://your-model.example/v1",
        "apiKey": { "secretRef": "MODEL_API_KEY" },
        "model": "your-model",
        "limits": { "contextWindowTokens": 32000, "maxOutputTokens": 1024 }
      },
      "allowPrivateNetwork": false
    }
  }
}
~~~

内置协议为 openai-compatible 和 anthropic-compatible。baseURL 是 API 地址，不是聊天网站地址；secretRef 是凭据文件中键的名称。模型窗口、输出限制及 Thinking 必须与服务能力匹配。

## 保存后如何生效

重启对应服务，再新建对话。更换 Key 只编辑凭据文件，更换模型只编辑模型配置。当前加载器不会自动读取 .env，也不会从其他项目自动同步。

数据库准备好后，可运行 pnpm smoke:provider 检查基本响应、工具和配置中明确启用的 Thinking。这会调用真实模型并产生用量。

## 常见错误

LOCAL_CONFIG_PERMISSIONS：检查目录 700、文件 600。LOCAL_SECRET_NOT_FOUND：核对 secretRef 和凭据键名，清除模板占位值。MODEL_AUTH_FAILED：核对供应商 Key、模型与 API 地址。

网络失败时先核对域名、代理和网络。不要把 allowPrivateNetwork 当成通用修复开关；只对明确授权的目标配置例外。
`,
  ),
  article(
    "playground",
    "本地测试页怎么用",
    "配置与使用",
    "先试普通聊天，再试工具与历史，最后查看调试记录。",
    "测试 页面 4318 库存 工具 停止 历史 续聊",
    `
## 三个入口分别做什么

先在项目目录运行 pnpm playground，再打开下面的地址。它们是本机入口，服务没有启动时无法访问。

| 页面 | 作用 |
| --- | --- |
| [聊天测试页](http://127.0.0.1:4318/) | 选择模型，体验普通聊天与工具调用 |
| [IM SDK 示例](http://127.0.0.1:4318/embed/) | 点击图标，体验换肤、换色和嵌入布局 |
| [Debug 调试页](http://127.0.0.1:4318/debug/) | 查看会话、运行时间线、错误和用量 |

## 先完成普通对话

选择自由对话，发送「用三句话介绍你能做什么」。看到回答和“已完成”后，在同一个会话继续问「再简单一点」。

**成功标志：** 第二次回答出现在同一段对话里。保留数据库及本地浏览器身份后，刷新可继续查看历史。

## 试一次工具调用

选择带库存工具的场景，询问「DEMO-1 还有多少库存？」。这是合成演示库存：DEMO-1 为 24 件，不代表真实商品。

**成功标志：** 执行记录中出现 demo.inventory 的真实本地执行，模型根据结果回答。只有一段声称查过库存的文字，不能证明工具被调用。

## 停止与继续

生成中可以点“停止”。取消会阻止后续派发，但不能撤销已经发生的外部动作。收起聊天或关闭浏览器不会自动取消服务端运行。

新问题使用新的请求 ID；网络结果未确认时，SDK 的重试会复用原请求编号，避免误当成一条新消息。

## 这份文档站也接了相同 SDK

右下角文档助手使用独立会话分类与数据库，查阅本站公开资料，不提供演示库存工具。它与 Playground 的聊天记录分别保存。
`,
  ),
  article(
    "debug",
    "看懂 Debug 调试记录",
    "配置与使用",
    "从错误码和运行记录开始，不用读懂所有事件。",
    "debug 调试 错误 排查 日志 token 费用 attempt trace",
    `
## 从哪里打开

启动 pnpm playground，在聊天测试页选择一段会话，通过 Debug 入口查看；也可以打开 [Debug 首页](http://127.0.0.1:4318/debug/)。这是本地测试宿主的调试页，文档站本身不公开其他人的调试数据。

## 按这个顺序看

1. **Session**：确认是你要检查的对话。
2. **Run**：找到刚刚发送的那条消息，先看最终状态和错误码。
3. **Step / Attempt**：确认模型调用到了哪一步，有没有重试。
4. **工具执行**：检查是否调用、是否成功、结果是否通过格式校验。
5. **Usage**：看已知用量及完整性，不把“未知”当成 0。

## 常见状态的含义

| 状态 | 含义与下一步 |
| --- | --- |
| completed | 本次运行完成 |
| failed | 查看错误码，按排错手册处理 |
| cancelled | 已停止；不表示外部动作被撤销 |
| awaiting_input | 等待宿主处理审批或问题，不需要重新发原消息 |
| awaiting_tool_resolution | 外部操作结果未知，需宿主核验，不能盲目重跑 |

## 用量不等于账单

重试、输出修复和摘要都可能产生模型用量。已知用量与估算金额都有完整性标记；币种不能直接相加，Thinking 是输出的一部分，不能重复计入。

## Debug 是只读的

查看时间线或补拉历史不会调用模型，也不会重新执行工具。首版没有真实 replay。接入自己的后台时，Debug 必须通过宿主鉴权，不应直接公开。
`,
  ),
  article(
    "rules",
    "能力与使用规则",
    "参考与排错",
    "哪些能力已经具备，哪些事情仍需你的应用负责。",
    "规则 范围 能力 npm 发布 生产 多租户 分布式 replay 安全 身份 普通聊天",
    `
## 当前可以做什么

支持持久会话、模型与工具循环、显式 Skill / 知识库 / Memory、有限重试与修复、用量、只读 Debug 和遥测接入。前端 SDK 支持悬浮图标、嵌入页面、主题、皮肤、品牌色以及桌面和移动布局。

## 需要宿主提供什么

你的后端负责可信用户身份、工具授权、真实业务数据和凭据管理。浏览器只提交受限的聊天请求。把 tenantId 放进请求体不等于通过认证，模型提示词也不能代替权限检查。

同一 PostgreSQL 数据库只运行一个 Engine 管理实例。文档站、Playground、自动测试使用各自的数据库；不要让两个服务争用同一库。

## 什么还没有交付

包尚未发布到公共 npm，接入其他项目先按前端 SDK 教程生成本地安装包。首版不包括多 Worker 分布式调度、真实模型/工具重放、知识库管理平台或完整监控产品。

浏览器自动验证主要覆盖 Chromium 的电脑和手机视口；真实 iOS / Android 设备需要接入方继续验收。

## 文档助手怎么回答

项目问题优先检索本站资料，提供文档路径。普通聊天可以正常进行。没有依据时说明不确定，不宣称已经检查过用户环境或替用户执行命令。

文档助手只有只读文档搜索能力，不会修改配置、执行终端命令或查看本地密钥。提问和检索资料会发送给服务端配置的模型供应商；真实回答可能有误，请核对文档及实际运行结果。

## 文档站的运行方式

本站默认在本机运行，匿名浏览器通过独立 Cookie 区分会话。它不是已部署的公共客服服务。面向公网发布前，需要接入正式身份或访客管理、HTTPS、持久限流、预算与数据保留运维策略。
`,
  ),
  article(
    "troubleshooting",
    "遇到问题，先看这里",
    "参考与排错",
    "按你看到的现象排查，每一项都给出下一步。",
    "错误 打不开 连接 失败 配置 secret port 地址 busy permissions",
    `
## 页面打不开

检查终端服务是否仍在运行。聊天测试页使用 4318，本站默认使用 4320。地址里的 127.0.0.1 表示“你当前这台电脑”；把这个地址发给别人，别人不会访问到你的服务。

端口已被占用时先确认是否已经启动过，直接打开已有页面。需要另一份文档站可设置 AGENT_DOCS_PORT，但必须使用独立数据库，不能共用运行中的 Engine 库。

## 数据库无法连接

先打开 Docker Desktop，再运行 docker start agent-engine-test-pg。使用 pg_isready 确认 accepting connections。不要通过删除容器或数据库解决普通连接问题，以免丢失历史。

## 密钥或权限检查失败

| 错误码 | 检查什么 |
| --- | --- |
| LOCAL_CONFIG_UNAVAILABLE | 两个私有配置文件是否存在 |
| LOCAL_CONFIG_PERMISSIONS | 目录 700、文件 600，且属于当前用户 |
| LOCAL_SECRET_NOT_FOUND | secretRef 是否对应有效凭据，是否仍是占位值 |
| MODEL_AUTH_FAILED | 供应商 Key、模型和 API 地址是否正确 |

按[模型与密钥](/docs/models/)处理后，重启对应服务并新建对话。

## 模型没有完成回答

MODEL_RATE_LIMITED 表示供应商限流，稍后再试。MODEL_TIMEOUT 表示超时，先缩短问题并核对网络。MODEL_OUTPUT_LIMIT 表示达到输出上限，可以要求简短回答；确需长回答时，在服务端按供应商能力提高配置上限。

## 会话或引擎忙碌

SESSION_BUSY：同一会话还有未结束运行，先等待或停止。ENGINE_BUSY：达到引擎受理限额，等待已有运行结束。等待人工输入或结果核验也可能占用名额。

## 网络中断后该不该重新发送

先让 SDK 重新连接、检查原请求结果。对于结果未知的写入工具，不要通过新建一条相同消息来“再执行一遍”；由有权限的宿主核验操作结果。

## 文档助手暂时无法使用

你仍然可以阅读文档和使用站内搜索。点击聊天中的“重新连接”再次尝试；服务刚重启后可以刷新页面。若本站以仅阅读模式启动，按[运行文档站](/docs/docs-site/)补齐模型和数据库后重新启动。

## 如何描述问题更容易定位

提供你正在做的步骤、错误码、运行状态和预期结果。可附经过脱敏的少量错误信息，不要发送完整凭据文件、认证 Header 或真实个人数据。
`,
  ),
  article(
    "docs-site",
    "运行和维护文档站",
    "参考与排错",
    "启动本站、更新内容，以及把文档助手接入流程带到你的项目。",
    "文档站 4320 启动 docs site 部署 搜索 助手 维护",
    `
## 在项目根目录启动

先完成项目依赖、模型和数据库配置，然后依次运行：

~~~sh
pnpm install --frozen-lockfile
pnpm run docs
~~~

打开 [文档站](http://127.0.0.1:4320/)。默认读取原有模型与集中凭据配置，首次创建独立的 agent_engine_docs 数据库，不占用 Playground 的数据库。按 Ctrl + C 停止本站。

## 还没配置模型，也能阅读

~~~sh
pnpm run docs --read-only
~~~

此模式不连接数据库或模型。文档、导航和搜索可正常使用；页面明确提示助手未连接，不会伪装成真实 AI 回答。完成配置后，退出并按默认命令重启。

## 文档与搜索如何更新

入门文章在 examples/docs-site/content.ts。前端 SDK、服务端 SDK 入门和接口约定直接读取当前 docs 目录的对应 Markdown，不额外复制一份正文。修改后重启文档站，页面与助手检索一起更新。

站内搜索在浏览器本地完成，不调用模型。助手的 docs.search 工具只检索本站白名单文章，返回标题、路径和正文片段。来源用于查证，不代表自动证明回答每句话正确。

## 可调整的启动设置

AGENT_DOCS_PORT 指定本站端口，默认 4320。AGENT_DOCS_MODEL_PROFILE 选择已有模型 Profile。AGENT_DOCS_DATABASE_URL 可指向已经创建好的独立数据库，不能使用另一运行中的 Engine 数据库。

本站沿用所选 Profile 的模型、地址和密钥引用，为文档回答将单次输出上限单独设置为 1536 Token，不改写原配置文件。AGENT_DOCS_MAX_OUTPUT_TOKENS 可在 256–4096 之间调整；须小于模型上下文窗口，并符合供应商实际能力。

## 发布到公网前

当前启动器只绑定 127.0.0.1。它提供完整的本地体验，但没有自动发布或域名配置。正式上线需接入 HTTPS、生产身份与访客策略、跨重启限流和日级预算，以及数据库备份、数据保留和运维。模型密钥仍只留在服务器。
`,
  ),
];

const sourcePages = [
  {
    id: "frontend",
    title: "把聊天图标接入你的后台",
    group: "接入自己的产品",
    description: "从本地安装到前后端接入，再到换肤、响应式与生命周期。",
    keywords: "sdk 前端 icon im react vue 颜色 皮肤 响应式 token 嵌入",
    file: "frontend-sdk.md",
  },
  {
    id: "sdk",
    title: "第一段 Agent 代码",
    group: "接入自己的产品",
    description: "用预设模型创建会话，再为模型加一个只读工具。",
    keywords: "sdk 后端 typescript node 工具 tool skill knowledge memory 代码",
    file: "sdk-quickstart.md",
  },
  {
    id: "api",
    title: "SDK 接口与执行约定",
    group: "参考与排错",
    description: "需要确认参数、权限、恢复和用量行为时，从这里查询。",
    keywords: "api 参考 接口 事件 参数 retry fallback memory 知识库 skill",
    file: "sdk-usage.md",
  },
];

export async function loadArticles(): Promise<Article[]> {
  const sources = await Promise.all(
    sourcePages.map(async (p) => ({
      id: p.id,
      title: p.title,
      group: p.group,
      description: p.description,
      keywords: p.keywords,
      source: `docs/${p.file}`,
      markdown: (
        await readFile(new URL(`../../docs/${p.file}`, import.meta.url), "utf8")
      )
        .replace(/^# .*\n/, "")
        .replace(/^\[返回文档导航\].*\n/m, "")
        .replaceAll("/Users/circle/git/agent-engine", "/path/to/agent-engine"),
    })),
  );
  return [
    ...siteArticles.slice(0, 6),
    ...sources.slice(0, 2),
    siteArticles[6]!,
    sources[2]!,
    ...siteArticles.slice(7),
  ];
}

export const articlePath = (id: string) => `/docs/${id}/`;
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*\x60>|]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Full words plus overlapping Chinese bigrams preserve useful matches without a remote index.
export function searchArticles(articles: Article[], query: string, limit = 5) {
  const normalized = query.trim().toLowerCase().slice(0, 240);
  if (!normalized) return [];
  const words = normalized.match(/[a-z0-9_.-]+|[\p{Script=Han}]+/gu) ?? [];
  const tokens = [
    ...new Set(
      words.flatMap((w) =>
        /\p{Script=Han}/u.test(w) && w.length > 2
          ? [
              w,
              ...Array.from({ length: w.length - 1 }, (_, i) =>
                w.slice(i, i + 2),
              ),
            ]
          : [w],
      ),
    ),
  ];
  return articles
    .map((a) => {
      const body = plainText(a.markdown),
        lower = body.toLowerCase(),
        title = (a.title + " " + a.keywords).toLowerCase();
      const score =
        tokens.reduce(
          (n, t) =>
            n + (title.includes(t) ? 7 : 0) + (lower.includes(t) ? 1 : 0),
          0,
        ) + (title.includes(normalized) ? 12 : 0);
      const matches = tokens.map((t) => lower.indexOf(t)).filter((n) => n >= 0);
      const offset = Math.max(0, Math.min(...matches, body.length) - 180);
      return {
        id: a.id,
        title: a.title,
        url: articlePath(a.id),
        description: a.description,
        excerpt: body.slice(offset, offset + 2200),
        score,
      };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
