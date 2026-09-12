## 先运行一个完整例子

完成[环境准备](/docs/installation/)并导出 [backend 示例](/docs/integration/)，本文件与 backend.ts、settings.ts 同目录。Debug 还需在 .env 设置至少 16 个字符的 DEBUG_TOKEN；完整导出目录已包含 Debug 包。

{{code:debug-run.ts}}

```sh
node --env-file=.env --import tsx debug-run.ts
```

后端 SDK 可搭配 @agent-runtime/debug 提供只读调试页面，查看会话、运行、模型尝试、工具执行和用量。它是开发者入口，不是聊天界面的一部分，也不是执行重放工具。

## 1. 安装 Debug 包

Debug 是可选包，当前也未发布公共 npm。完成源码构建后，在源码仓库打包：

```sh
pnpm build
pnpm --dir packages/debug pack --pack-destination ../../.local/chat-packages
```

在你的后端项目安装生成的 agent-runtime-debug-0.1.0-dev.tgz，并在 pnpm-workspace.yaml 中为其内部依赖 @agent-runtime/sdk 配置同版本本地覆盖。覆盖示例见[安装说明](/docs/installation/)。

```sh
pnpm add /path/to/agent-engine/.local/chat-packages/agent-runtime-debug-0.1.0-dev.tgz
```

## 2. 在已有 Engine 上启动

在你的服务端凭据源增加 DEBUG_TOKEN，并让 secrets.resolve 能解析它。本文的 token 是 Debug 专用凭据，至少 16 个字符；不要把它当成模型 API Key 或放进公开页面。

以下片段中的 engine 是已创建的可信管理作用域 Engine：

```ts
import { startDebugServer } from "@agent-runtime/debug";

const debug = await startDebugServer({
  engine,
  auth: { type: "token", secretRef: "DEBUG_TOKEN" },
  host: "127.0.0.1",
  port: 4319,
  basePath: "/debug",
  backLink: { href: "/", label: "返回服务首页" },
});
console.log(debug.url + "/debug/");
// 服务退出时先 await debug.close()，再关闭 Engine。
```

startDebugServer 启动独立 HTTP 服务；basePath 设置这个服务的路由前缀，不会自动把它挂进你的原 HTTP 服务。同域访问需要宿主路由或代理接入。

浏览器打开上述地址，会要求 Basic 登录：用户名可任填，密码使用配置的 Debug Token。受控内部调用也可以用 Authorization: Bearer 凭据。若通过已有后台代理，应由宿主在服务端验证管理员权限并注入凭据，不要把内部 Debug Token 发送到浏览器脚本。

## 3. 怎样排查一次失败

1. 找到对应 Session，然后选择出错的 Run。
2. 先看状态和错误码，再看 Step / Attempt，确定模型请求到了哪一步。
3. 检查工具是否实际执行、业务是否成功、输出是否通过格式校验。
4. 最后查看用量完整性，确认是否有重试、摘要或修复。

awaiting_input 需要宿主提供审批或补充信息；awaiting_tool_resolution 需要核验外部结果。Debug 只读，处置操作通过后端 SDK 完成。

## 已有本地测试页时

仓库 Playground 已在 http://127.0.0.1:4318/debug/ 配好只读入口，可以先用它熟悉界面；它是示例宿主，与业务服务是否接入 Debug 无关。

正式集成需限制可访问人群与数据作用域。首版没有模型/工具真实 replay，也不会提供“一键重跑写操作”。


## 调试正在使用的文档助手

打开[会话调试](/ai/capabilities/#debug)，选择当前浏览器身份下的会话。此入口在文档宿主中直接调用 SDK 的 `inspectSession`、`listEvents` 和 `getEffectiveConfig`，复用调试数据接口，不向浏览器发送管理员 Debug Token。

可查看配置版本、Run / Step / Attempt、工具操作和 Usage，以及最近 1000 条事件。事件超过窗口时快照标记截断。归档、取消归档和删除位于页面底部；有活动 Run 时需先在 IM 完成或停止。长期记忆独立管理，删除会话不会一并删除已确认保存的偏好。

[配置实验](/ai/capabilities/#experiments)中的「事件与可观测性」还会实际导出 Trace、日志和 Prometheus 指标，验证游标分页与订阅。实验与真实模型运行明确区分。
