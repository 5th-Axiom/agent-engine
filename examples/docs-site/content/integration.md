**目标：** 从一个干净目录开始，完成安装、配置、启动、第一次对话和续聊。示例文件与本文一同维护，可独立于源码仓库运行。

## 选择路线

| 路线 | 得到什么 | 前置条件 |
| --- | --- | --- |
| backend | 发送消息和续聊的 Node 脚本；工具、Skill、记忆等完整场景脚本 | Node、PostgreSQL、模型凭据 |
| frontend | 浏览器页面、聊天控件和静态启动服务 | 可用的 ChatTransport v1 后端；同源代理或明确允许跨域 |
| fullstack | 浏览器 + Node 服务 + 本地登录校验 + 持久会话 | Node、PostgreSQL、模型凭据 |

## 导出完整示例

在源码仓库执行：

```sh
pnpm example:export
```

输出在 .local/integration-examples/。三个目录都包含 package.json、所需安装包和 README，可以将任意一个目录整体复制到其他位置。此命令是开发版示例导出工具，后续产品 CLI 仍待确定。

在选定目录执行：

```sh
pnpm install
cp .env.example .env
```

backend / fullstack：在 .env 填入已有数据库、模型地址、模型名称与凭据；PROTOCOL_KEY 是你保存的稳定随机密钥。fullstack 还需设置至少 16 个字符的 DEMO_LOGIN_PASSWORD。不要更改示例绑定的 127.0.0.1 后直接对公网开放。

frontend：页面里填写后端地址。它只需业务登录凭据，不需要模型 API Key 或数据库。后端允许对应 Origin；认证 Headers 接入点见 client.ts。

## 启动并检查

```sh
pnpm start
```

- backend：看到两段模型回答和 sessionId。保存 ID 后执行 SESSION_ID=你的ID pnpm start，可跨进程续聊。
- fullstack：打开终端显示的本地地址，用 demo 和 DEMO_LOGIN_PASSWORD 登录。发送消息，刷新页面、恢复会话后继续提问。
- frontend：打开本地页面，连接你提供的后端。浏览器网络请求只包含业务认证与聊天输入。

关闭服务后重新启动，数据库、登录身份和 PROTOCOL_KEY 保持一致即可恢复历史。示例在 SIGINT / SIGTERM 中关闭 HTTP 与 Engine；后端单次脚本在 finally 中关闭 Engine。

## 接到业务里

fullstack 的服务入口把本地登录校验、Chat Handler 和静态资源放在同一个文件，所有函数都有实现。用于你的产品时，将本地 Basic 登录替换为你已有的已验证登录态，保留每次请求认证、用户作用域、Origin 和权限检查。详见[登录与权限](/docs/frontend-server/)。

## 出问题时

无法启动先检查 README 所列环境；数据库不存在需先创建，SDK 只迁移表。401 检查业务登录，403 检查来源与主体权限；模型报错继续查[模型配置](/docs/models/)。长时间等待可打开[进度与用量](/docs/events/)或 [Debug](/docs/debug/)。
