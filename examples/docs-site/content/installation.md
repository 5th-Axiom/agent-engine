当前是 **0.1.0-dev 源码开发版，尚未发布到公共 npm**。接入业务项目时先从本仓库生成安装包，再安装到你的项目。不要直接运行 pnpm add @agent-runtime/sdk 并期待公共仓库里已有该包。

## 按接入路线选包

| 使用位置                       | 安装包                                                                   | 用途                                |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------- |
| 前端现成界面                   | @agent-runtime/chat-ui、@agent-runtime/chat-core                         | 聊天图标、聊天页、主题及对话状态    |
| 为前端提供聊天接口的 Node 后端 | @agent-runtime/chat-server、@agent-runtime/chat-core、@agent-runtime/sdk | 接入已有登录，调用 Engine           |
| 只调用后端 SDK                 | @agent-runtime/sdk                                                       | 创建 Agent 会话和运行，不需要前端包 |
| 自定义 UI、复用聊天协议        | @agent-runtime/chat-core                                                 | 自己绘制界面，复用控制器和传输层    |

服务端需要 Node.js ≥ 22.19 和一个 PostgreSQL 数据库。下文使用 pnpm 10.17.1。前端 SDK 面向现代浏览器；SSR 项目在浏览器挂载阶段创建界面。

## 1. 生成安装包

在 **Agent Engine 源码仓库**中执行一次，路径按实际位置替换：

```sh
cd /path/to/agent-engine
pnpm install --frozen-lockfile
pnpm pack:chat
```

完成后，.local/chat-packages/ 内应有 sdk、chat-core、chat-ui、chat-server 四个 .tgz 文件。pack:chat 会先构建，不需要启动数据库或调用模型。

## 2. 安装到你的项目

下面的命令在**你的业务项目**中执行。将 /path/to/agent-engine 换成保存安装包的实际路径。

只用后端 SDK：

```sh
pnpm add /path/to/agent-engine/.local/chat-packages/agent-runtime-sdk-0.1.0-dev.tgz
```

使用前端界面时，先在接入项目根目录的 pnpm-workspace.yaml 中合并覆盖配置，保留原有字段：

```yaml
overrides:
  "@agent-runtime/chat-core": "file:/path/to/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz"
```

然后安装：

```sh
pnpm add /path/to/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz /path/to/agent-engine/.local/chat-packages/agent-runtime-chat-ui-0.1.0-dev.tgz
```

为前端提供聊天接口的 Node 后端，需要在自己的 pnpm-workspace.yaml 中合并两条覆盖：

```yaml
overrides:
  "@agent-runtime/chat-core": "file:/path/to/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz"
  "@agent-runtime/sdk": "file:/path/to/agent-engine/.local/chat-packages/agent-runtime-sdk-0.1.0-dev.tgz"
```

再安装后端的三个包：

```sh
pnpm add /path/to/agent-engine/.local/chat-packages/agent-runtime-chat-core-0.1.0-dev.tgz /path/to/agent-engine/.local/chat-packages/agent-runtime-sdk-0.1.0-dev.tgz /path/to/agent-engine/.local/chat-packages/agent-runtime-chat-server-0.1.0-dev.tgz
```

这些覆盖让尚未发布的内部依赖也从本地安装。纯后端 sdk 本身不依赖其他 @agent-runtime 包，不需要这些覆盖。前后端同属一个全栈工作区时，覆盖放在工作区根目录即可。

## 3. 确认下一步

前端项目能够导入 mountChatWidget，后端项目能够导入 createAgentEngine，即可继续[前端教程](/docs/frontend/)或[后端教程](/docs/sdk/)。

安装包路径需要在安装时可访问。升级时从同一份新源码重新打包，前后端一起升级到匹配版本；当前开发版不承诺不同提交之间的协议兼容性。
