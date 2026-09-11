# 新手上手指南

[返回文档导航](README.md)

这份指南带你完成一件事：在自己的电脑上打开 Agent Engine，发出一个问题，看到模型回答，再查看它的执行记录。先照步骤体验，代码接入可以放到后面。

命令以当前 macOS 终端为例；本地凭据加载器使用 Unix 文件权限检查，本文不提供原生 Windows 操作流程。

## 先认识项目

你发出问题后，Agent Engine 会把问题交给配置好的模型。需要工具时，它调用你允许的工具，再把结果交给模型整理。对话和执行记录保存在数据库里。

| 名称            | 可以这样理解                                              |
| --------------- | --------------------------------------------------------- |
| 模型            | 真正理解问题、生成回答的 AI 服务，例如当前配置的 DeepSeek |
| Engine，引擎    | 负责安排模型与工具执行的程序                              |
| Session，会话   | 一段连续对话，里面可以有多次提问                          |
| Run，一次运行   | 你发送一条消息后，引擎完成这次任务的过程                  |
| Tool，工具      | 模型可以请求执行的功能，例如查询演示库存                  |
| Token，用量单位 | 供应商统计文本处理量的单位，不直接等于字数或金额          |
| Debug，调试页   | 查看这次执行用了什么配置、走了哪些步骤、哪里出错          |

网页当前可以测试普通对话和只读库存工具。Skill、知识库、Memory 等能力通过 SDK 示例体验，网页暂时没有对应的配置面板。

## 已经在这台电脑上配置过

如果你用的就是此前已配置好的 `/Users/circle/git/agent-engine`，先打开 [测试页面](http://127.0.0.1:4318)。能打开并显示「本地已连接」，就可以直接阅读[页面操作手册](local-playground.md)。

打不开时，打开 Docker Desktop，然后在终端运行：

```sh
cd /Users/circle/git/agent-engine
docker start agent-engine-test-pg
pnpm playground
```

看到终端打印「本地测试」和「Debug 调试」两个地址，就是启动成功。保持终端运行，再打开页面。首次在新电脑准备环境，请继续下面的步骤。

## 第一步：打开终端，进入项目

macOS 上按 ⌘ + 空格，搜索「终端」并打开。复制下面这行命令，粘贴后按回车：

```sh
cd /Users/circle/git/agent-engine
```

`cd` 的意思是进入文件夹。换了项目位置，就把路径换成自己的项目文件夹。本文假设你已经拿到了本项目源码。

再运行：

```sh
pwd
ls package.json
```

成功标志：第一条显示项目目录，第二条显示 `package.json`。后续项目命令都在这个目录执行。代码框里的命令可以复制；说明文字和命令输出不用复制。

## 第二步：准备运行工具

先检查已有环境：

```sh
node --version
pnpm --version
docker version
```

| 工具           | 本项目要求                           | 它负责什么                     |
| -------------- | ------------------------------------ | ------------------------------ |
| Node.js        | 至少 22.19；已验证 22.23.2 和 26.3.0 | 运行项目程序                   |
| pnpm           | 项目固定 10.17.1                     | 下载依赖、执行项目命令         |
| Docker Desktop | 能正常启动 Docker 服务               | 在容器中运行 PostgreSQL 数据库 |

缺少 Node.js 时，从 [Node.js 官方下载页](https://nodejs.org/en/download)安装；可以选择本项目已验证的 22.23.2。缺少 Docker Desktop 时，按 [Docker 官方 Mac 安装说明](https://docs.docker.com/desktop/setup/install/mac-install/)安装并打开应用。

安装好 Node.js 后，如果还没有 pnpm，运行下面的命令安装本项目固定版本。npm 安装方式见 [pnpm 10 官方说明](https://pnpm.io/10.x/installation#using-npm)。

```sh
npm install -g pnpm@10.17.1
```

安装完成后重新打开终端，再检查版本。`docker version` 应同时出现 Client 和 Server 信息；只有客户端信息或提示无法连接时，先确认 Docker Desktop 已经启动。

## 第三步：下载项目依赖

在项目目录运行：

```sh
pnpm install --frozen-lockfile
```

这一步需要网络，用来下载项目依赖。`--frozen-lockfile` 表示按项目已经记录的依赖版本安装。

成功标志：命令正常结束，没有红色失败信息，并重新出现可以输入命令的提示符。

## 第四步：启动数据库

先查看是否已经创建过项目容器：

```sh
docker ps -a --filter name=agent-engine-test-pg
```

如果列表中有 `agent-engine-test-pg`，启动已有容器：

```sh
docker start agent-engine-test-pg
```

如果列表中没有这个容器，只在首次运行时执行：

```sh
docker run --name agent-engine-test-pg \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=agent_engine_test \
  -p 127.0.0.1:55439:5432 \
  -d postgres:17-alpine
```

这个容器使用仅供本机开发的免密码配置，端口绑定在 `127.0.0.1`；不要把这套配置用于生产环境。

等待几秒，再检查数据库是否就绪：

```sh
docker exec agent-engine-test-pg pg_isready -U postgres -d agent_engine_test
```

成功标志：出现 `accepting connections`。还没准备好时，稍等后再执行检查。

同一容器里会用到两个不同的数据库：`agent_engine_test` 供自动测试和命令行示例使用；`agent_engine_playground` 供网页保存历史，网页首次启动时会自动创建后者。

## 第五步：选择是否先接真实模型

**想先确认代码能运行，而且不消耗模型额度：** 运行下面的示例。

```sh
pnpm example basic
```

成功标志：输出中出现 `Synthetic first answer` 和 `Synthetic follow-up`。这是预设回答，用于检查执行流程，不代表已经连上真实 AI 服务。

**想在网页里自由提问：** 先按[模型与凭据配置](local-model-configuration.md)准备两个本地文件：

- `.local/models.json`：选择模型、连接地址及密钥名称。
- `.secrets/credentials.json`：保存真实 API Key 和稳定的协议保护 Key。

当前这台电脑已有授权的 DeepSeek 配置，不需要重新覆盖。新电脑上的源码不包含这些私有文件，需要自行配置。测试页启动前会检查所有已配置模型所引用的凭据。

## 第六步：打开测试页面

```sh
pnpm playground
```

成功时终端会打印：

```text
本地测试：http://127.0.0.1:4318
Debug 调试：http://127.0.0.1:4318/debug/
```

命令会一直运行，这正是页面服务在工作的表现。保持这个终端打开；需要执行其他命令时另开一个终端窗口。

打开 [本地测试页面](http://127.0.0.1:4318)，选择「自由对话」，输入「请用三句话解释 Agent 的工作流程」，点击「发送消息」。看到回答和右侧「已完成」，第一次真实调用就成功了。真实模型调用会产生供应商用量。

还可以打开 [IM SDK 管理后台示例](http://127.0.0.1:4318/embed/)，点击右下角图标体验聊天、切换皮肤。接入自己的后台请看[前端 SDK 教程](frontend-sdk.md)。

接下来按[测试页面操作手册](local-playground.md)测试工具、停止生成、续聊和 Debug。

## 以后怎样启动、停止和更新

日常启动：打开 Docker Desktop → 进入项目目录 → `docker start agent-engine-test-pg` → `pnpm playground`。

停止页面服务：回到运行 `pnpm playground` 的终端，按 **Ctrl + C**。关闭浏览器标签不会停止服务，也不会取消正在执行的请求。要停止某次生成，先在网页点「停止生成」。

不再使用数据库时，可以在页面服务及其他测试命令停止后运行：

```sh
docker stop agent-engine-test-pg
```

正常停止、重新启动服务或容器会保留数据库记录。历史仍受数据保留规则约束；删除数据库或容器所用数据卷会丢失数据。日常重启只需 `start` / `stop`。

代码或依赖更新后，停止页面服务，重新运行 `pnpm install --frozen-lockfile` 和 `pnpm playground`。模型或凭据文件更新后也要重启页面服务；切换模型请新建对话。

## 常用命令

以下命令都在项目目录运行。浏览器自动验证额外需要安装 Chromium：`pnpm exec playwright install chromium`。

| 命令                        | 做什么                                     | 需要数据库     | 调用真实模型 |
| --------------------------- | ------------------------------------------ | -------------- | ------------ |
| `pnpm playground`           | 启动可操作的页面和 Debug，持续运行         | 是，网页专用库 | 发消息时会   |
| `pnpm example basic`        | 运行基本流程与续聊示例，完成后退出         | 是，测试库     | 否           |
| `pnpm example tool`         | 演示只读工具调用                           | 是，测试库     | 否           |
| `pnpm example skill`        | 演示按技能指令使用工具                     | 是，测试库     | 否           |
| `pnpm example knowledge`    | 演示知识检索及来源引用                     | 是，测试库     | 否           |
| `pnpm example memory`       | 演示偏好写入与版本校验                     | 是，测试库     | 否           |
| `pnpm example monitoring`   | 演示一次检查及指标输出                     | 是，测试库     | 否           |
| `pnpm check`                | 类型检查、构建及全部自动测试               | 是，测试库     | 否           |
| `pnpm test:integration`     | 集成及恢复测试                             | 是，测试库     | 否           |
| `pnpm verify:playground`    | 自动验证测试页面交互和布局，完成后关闭     | 否，使用内存   | 否           |
| `pnpm verify:chat-ui`       | 验证悬浮/嵌入 IM、主题、交互和响应式       | 否，使用内存   | 否           |
| `pnpm pack:chat`            | 生成可供其他项目安装的聊天相关包           | 否             | 否           |
| `pnpm verify:chat-packages` | 打包并验证其他项目的安装、声明和浏览器构建 | 否             | 否           |
| `pnpm verify:debug`         | 自动验证 Debug 布局，完成后关闭            | 否，使用内存   | 否           |
| `pnpm verify:monitoring`    | 自动验证本地 HTTP 指标和日志接入           | 是，测试库     | 否           |
| `pnpm smoke:provider`       | 验证默认真实模型、工具和启用的 Thinking    | 是，测试库     | 是           |
| `pnpm build`                | 生成六个包的代码、声明及浏览器独立脚本     | 否             | 否           |
| `pnpm typecheck`            | 检查 TypeScript 类型                       | 否             | 否           |

使用同一测试库的命令请依次运行。默认网页专用库与测试库分开，网页可以保持运行。`pnpm check` 通过只能说明自动测试通过，真实模型连通性需要页面调用或 `smoke:provider` 单独确认。

已经自行准备 PostgreSQL 时，`AGENT_TEST_DATABASE_URL` 可指定自动测试、命令行示例、供应商 smoke 和监控验证使用的专用测试库；`AGENT_PLAYGROUND_DATABASE_URL` 单独指定网页开发库。两者不会互相覆盖。自定义数据库需要提前创建，测试地址不得指向生产数据。使用默认容器流程时不用设置这些变量。

出现问题时看[常见问题与排查](troubleshooting.md)；准备写代码时看 [SDK 入门教程](sdk-quickstart.md)。
