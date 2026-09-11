# 常见问题与排查

[返回文档导航](README.md) · [启动步骤](getting-started.md)

先看问题出在哪一层：命令无法运行，检查环境；页面无法打开，检查本地服务；页面能打开但回答失败，检查模型配置及 Debug。一次处理一个错误，再重试。

所有项目命令都在项目目录执行：

```sh
cd /Users/circle/git/agent-engine
```

## 命令或服务启动失败

| 现象                                          | 下一步                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `command not found: node` / `pnpm` / `docker` | 按[上手指南](getting-started.md)安装对应工具；安装后重新打开终端                                     |
| 找不到 `package.json`                         | 先执行上面的 `cd`，再用 `pwd` 确认目录                                                               |
| `Cannot connect to the Docker daemon`         | 打开 Docker Desktop，等它启动后运行 `docker version`                                                 |
| `No such container: agent-engine-test-pg`     | 按上手指南首次创建容器；`docker start` 只能启动已经存在的容器                                        |
| 容器名称已被占用                              | 已经创建过容器，改用 `docker start agent-engine-test-pg`                                             |
| 数据库连接被拒绝、`ECONNREFUSED`              | 启动容器，再运行下面的数据库就绪检查                                                                 |
| 安装时报锁文件不匹配                          | 确认代码、`package.json` 和 `pnpm-lock.yaml` 来自同一版本，使用 pnpm 10.17.1；保留原错误供维护者检查 |
| `PLAYGROUND_START_FAILED`                     | 依次检查配置文件、数据库和端口；此代码是启动失败的通用提示，不只代表端口冲突                         |

数据库就绪检查：

```sh
docker exec agent-engine-test-pg pg_isready -U postgres -d agent_engine_test
```

看到 `accepting connections` 后再启动页面。仍有问题时，用 `docker ps -a --filter name=agent-engine-test-pg` 查看容器状态。

出现 `ENGINE_BUSY` 表示数据库已有运行中的 Engine。

同一数据库只允许一个 Engine 管理实例。不要同时启动两个 `pnpm playground`；使用测试库的示例、smoke 和测试命令请依次运行。遇到 `STORE_LOCK_LOST` 时，先确认数据库可用、其他使用同一库的宿主已停止，再重启目标服务。

## 页面打不开或提示连接中断

确认运行 `pnpm playground` 的终端还在，并使用它打印的完整地址。默认地址是 [http://127.0.0.1:4318](http://127.0.0.1:4318)，协议是 `http`。服务只在当前电脑监听，手机或其他电脑不能直接访问。

服务重启后出现 `LOCAL_SESSION_REQUIRED`：刷新页面或点击「重新连接」，让浏览器取得新的本地连接凭据；数据库里的历史对话仍然保留。

出现 `LOCAL_ORIGIN_REQUIRED`：从启动命令打印的地址重新打开，避免从其他站点嵌入或转发页面。

如果端口被其他应用占用，可以先查看占用者：

```sh
lsof -nP -iTCP:4318 -sTCP:LISTEN
```

确定原来的 Playground 已停止后，可临时更换页面端口：

```sh
AGENT_PLAYGROUND_PORT=4319 pnpm playground
```

此时测试页是 [4319 端口](http://127.0.0.1:4319)，Debug 是 [4319 的 Debug](http://127.0.0.1:4319/debug/)。更改端口不会允许两个 Engine 同时使用一个数据库。

## 本地配置错误

| 错误代码                   | 意思                         | 怎样处理                                                                                                           |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `LOCAL_CONFIG_UNAVAILABLE` | 配置文件不存在或无法读取     | 检查 `.local/models.json` 和 `.secrets/credentials.json`，新电脑先按[配置教程](local-model-configuration.md)初始化 |
| `LOCAL_CONFIG_PERMISSIONS` | 文件权限或所属用户不符合要求 | 执行下面的权限命令；文件需要属于当前运行用户，不能用符号链接代替                                                   |
| `LOCAL_CONFIG_INVALID`     | JSON 或配置字段不合法        | 检查双引号、逗号、字段名；JSON 不能写注释或多余的末尾逗号，模型地址不能夹带凭据或查询参数                          |
| `LOCAL_PROFILE_NOT_FOUND`  | 选择的配置名称不存在         | `default` 或命令参数必须与 `profiles` 中的名称一致                                                                 |
| `LOCAL_SECRET_NOT_FOUND`   | 密钥引用不存在或仍是占位符   | 检查 `secretRef` 与 `values` 中的键名一致，并填写真实值；网页会检查所有 Profile                                    |

修复权限：

```sh
chmod 700 .local .secrets
chmod 600 .local/models.json .secrets/credentials.json
```

保存后重新启动 `pnpm playground`。不要通过放宽权限或把密钥写进源代码来绕过错误。

## 页面能打开，但模型调用失败

| 错误代码或现象                                       | 怎样处理                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `MODEL_AUTH_FAILED`                                  | 在 `.secrets/credentials.json` 更新对应 API Key，确认它属于配置的供应商，再重启服务      |
| `MODEL_RATE_LIMITED`                                 | 稍后重试，并检查供应商的限额与账户状态                                                   |
| `MODEL_TIMEOUT`                                      | 检查网络，先用一个短问题重试；测试页每次运行还有 90 秒总时限                             |
| `MODEL_PROVIDER_ERROR`                               | 服务或网络可能暂时不可用；核对地址，稍后重试，查看 Debug 错误代码                        |
| `MODEL_PROTOCOL_ERROR` / `MODEL_CAPABILITY_MISMATCH` | 核对模型支持的协议和能力，尤其是 Tool 与 Thinking；不要只因地址能访问就认定兼容          |
| `MODEL_OUTPUT_LIMIT` / 回答较长时失败                | 先要求简短回答；确需长输出时调整模型的 `limits.maxOutputTokens`，重启后新建对话          |
| `BUDGET_EXCEEDED` / `CONTEXT_BUDGET_EXCEEDED`        | 缩短输入、减少任务规模或新建对话；继续开发时再按 SDK 约定调整预算                        |
| `SESSION_BUSY`                                       | 当前会话还在执行，等它结束，或点击「停止生成」并等到「已停止」                           |
| `MODEL_CONTINUATION_UNAVAILABLE`                     | 检查是否更换了 `PROTOCOL_KEY`；需要恢复原保护 Key 才能读取原加密记录，无法恢复时新建对话 |

供应商差异可能导致真实模型测试失败。`pnpm smoke:provider` 会顺序验证基础响应、只读工具，以及明确启用时的 Thinking；输出 `completed: false` 时，查看 `stage` 和 `code`，此前通过的阶段不代表整次验证已通过。

## 几个容易误解的页面现象

**模型下拉框不能改。** 当前会话已固定模型和场景，点「新对话」后再选择。

**看到了部分回答，最后却显示失败或已停止。** 生成中的文字是草稿，只有运行完成后才是最终回答。取消和失败后的草稿不会当作完整结果保留。取消前已经发生的模型用量仍可能被计费。

**工具区为空，但模型已经回答。** 自由对话没有配置库存工具；新建对话、选择「工具调用」，明确要求「调用工具查询 DEMO-1 的库存」。以工具记录为依据，不能只凭回答里出现数字认定工具被调用。

**Token 显示 `—` 或费用没有数字。** `—` 表示没有完整数据，不代表零用量。费用需要另行配置费率；供应商账单才是实际费用依据。

**Debug 没有输入、完整回答或思考过程。** 这些正文在 Debug 中保持隐藏。聊天内容看测试页，执行状态和错误看 Debug。Debug 是只读页面，查看新状态时手动刷新。

**自动验证结束后页面就关闭了。** `verify:playground` / `verify:debug` 会创建临时页面并在完成后退出；手动测试请运行 `pnpm playground`。

**Playwright 提示浏览器不存在。** 在项目目录运行 `pnpm exec playwright install chromium`，然后重试验证命令。手动访问 Playground 不需要这一步。

**历史对话不见了。** 先看左侧「最近对话」，并确认仍使用原数据库；页面只显示最近 50 个会话和当前会话最近 50 次运行。`DATA_RETENTION_EXPIRED` 表示正文超过保留期，应新建对话。`RUN_ORDER_UNAVAILABLE` 表示旧记录缺少顺序证据，可在 Debug 查看保留元数据并新建对话。

## 需要别人帮忙时，提供什么

记录你执行的命令、页面错误代码、发生时间、模型 Profile 名称及 Debug 中的 Session / Run ID。如果是安装问题，再附 `node --version` 和 `pnpm --version` 的结果。

这些信息通常足够开始定位。不要附完整凭据文件、API Key、协议保护 Key 或私密对话正文。
