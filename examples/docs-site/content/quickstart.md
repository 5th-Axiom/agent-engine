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
docker run --name agent-engine-test-pg \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=agent_engine_test \
  -p 127.0.0.1:55439:5432 \
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
