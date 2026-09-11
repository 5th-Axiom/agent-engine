# SDK 入门教程

[返回文档导航](README.md) · [精确接口与可靠性约定](sdk-usage.md)

这份教程适合准备写一点 TypeScript 的使用者。只想在网页提问，请看[测试页面操作手册](local-playground.md)。

SDK 就是程序可以调用的一组功能。这里先用预设模型跑通「创建会话 → 发消息 → 取回答」，再增加一个工具。下面两段代码都在本项目里运行，不需要 API Key 或 PostgreSQL，也不产生真实模型用量。

## 准备工作

先完成 Node.js 和 pnpm 安装，在项目目录运行：

```sh
pnpm install --frozen-lockfile
pnpm build
```

`@agent-runtime/sdk`、`@agent-runtime/testing`、`@agent-runtime/debug` 是当前仓库的工作区包，尚未发布到 npm。以下导入依靠本项目已经配置好的工作区依赖，不能直接当作公开 npm 包安装命令使用。新增的聊天前端与 Node 接入桥支持本地打包安装，见[前端 SDK 教程](frontend-sdk.md)。

## 第一段代码：创建会话并继续提问

在项目的 `examples` 文件夹中新建 `my-first-agent.ts`，复制全部代码：

```ts
import {
  createEngineTestHarness,
  scriptedModel,
  finalText,
} from "@agent-runtime/testing";

const harness = await createEngineTestHarness({
  model: scriptedModel([
    finalText("你好，我已经准备好了。"),
    finalText("这是同一会话中的第二次回答。"),
  ]),
});

try {
  const session = await harness.engine.createSession({
    config: harness.modelConfig,
  });

  const first = await session.run({
    requestId: "message-1",
    input: "你好",
  });
  console.log(first.outputText);

  const second = await session.run({
    requestId: "message-2",
    input: "请继续",
  });
  console.log(second.outputText);
} finally {
  await harness.close();
}
```

在项目根目录执行：

```sh
pnpm exec tsx examples/my-first-agent.ts
```

预期输出：

```text
你好，我已经准备好了。
这是同一会话中的第二次回答。
```

| 代码                          | 它做了什么                                   |
| ----------------------------- | -------------------------------------------- |
| `createEngineTestHarness`     | 创建带内存存储的测试引擎，并准备测试所需配置 |
| `scriptedModel` / `finalText` | 依次返回预先写好的内容，帮助检查流程         |
| `createSession`               | 新建一段对话；这一步本身不会调用模型         |
| `session.run`                 | 发起一次运行，等待结果                       |
| `requestId`                   | 这条请求的唯一标识，用于识别重复提交         |
| `outputText`                  | 这次运行的最终文本回答                       |
| `finally` / `close`           | 无论成功还是报错，都释放测试资源             |

预设模型有几条响应，就能消费几次模型请求。修改提问文字不会让它产生新的智能回答；内存数据在程序退出后丢失，这个示例也不能证明持久化或崩溃恢复。

## 第二段代码：接一个只读工具

工具需要两部分：告诉模型「工具叫什么、接收什么参数」，以及告诉引擎「实际执行哪个函数」。两者通过 `bindingKey` 对应。

新建 `examples/my-first-tool.ts`，复制全部代码：

```ts
import { defineTool } from "@agent-runtime/sdk";
import {
  createEngineTestHarness,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";

const inventory = defineTool({
  name: "inventory.read",
  description: "查询合成演示库存",
  inputSchema: {
    type: "object",
    properties: { sku: { type: "string", enum: ["DEMO-1"] } },
    required: ["sku"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { available: { type: "number" } },
    required: ["available"],
    additionalProperties: false,
  },
  execution: {
    type: "binding",
    bindingKey: "inventory.read.v1",
    sideEffect: "read",
  },
});

const harness = await createEngineTestHarness({
  model: scriptedModel([
    toolCall("inventory.read", { sku: "DEMO-1" }),
    finalText("DEMO-1 的演示库存为 24 件。"),
  ]),
  bindings: {
    "inventory.read.v1": {
      version: "1",
      sideEffect: "read",
      execute: async () => ({ available: 24 }),
    },
  },
});

try {
  const session = await harness.engine.createSession({
    config: { ...harness.modelConfig, tools: [inventory] },
  });
  const result = await session.run({
    requestId: "inventory-1",
    input: "请查询 DEMO-1 的库存",
  });
  console.log(result.outputText);
  console.log(
    "工具调用次数：",
    harness.calls.forBinding("inventory.read.v1").length,
  );
} finally {
  await harness.close();
}
```

运行：

```sh
pnpm exec tsx examples/my-first-tool.ts
```

预期输出包含「DEMO-1 的演示库存为 24 件。」和「工具调用次数： 1」。这次真实执行的是本地 `execute` 函数，模型选择工具的行为及最终措辞仍由测试脚本预设。

`inputSchema` 和 `outputSchema` 分别约束参数和结果的格式；`sideEffect: 'read'` 表示工具只读取数据。接入写入业务时，需要额外实现授权、业务幂等和未知结果核验，不能只把这里的 `read` 改成 `write`。

## 换成真实模型，从现成脚本开始

先完成[模型配置](local-model-configuration.md)和数据库启动，然后运行 `pnpm smoke:provider`。这个脚本已经使用真实模型和 PostgreSQL，适合作为本地代码接入的起点。

打开 [`scripts/provider-smoke.ts`](../scripts/provider-smoke.ts)，按这个顺序理解：

| 位置                                             | 接入时负责的事情                                       |
| ------------------------------------------------ | ------------------------------------------------------ |
| `loadLocalModel`                                 | 读取所选 Profile 及受限的 Secret 解析器                |
| `PostgresStore.fromConnectionString` / `migrate` | 连接专用数据库并准备表结构                             |
| `createAgentEngine`                              | 把数据库、身份、凭据、网络许可及工具执行函数交给引擎   |
| `principal`                                      | 由你的程序确认的租户和用户身份，不能信任客户端随意填写 |
| `policy`                                         | 明确允许访问的模型目标及能力边界                       |
| `createSession({ config })`                      | 为会话选择模型、能力和执行限制                         |
| `session.run`                                    | 调用真实模型并取得结果                                 |
| `engine.usage.getRun`                            | 读取这次运行的 Token 与费用估算完整性                  |
| `engine.close`                                   | 关闭宿主资源                                           |

这个脚本每次创建新的测试身份和会话。希望像聊天页面一样重启后继续使用，需要保存会话 ID、保持可信身份和协议保护 Key，并通过 `engine.loadSession(sessionId)` 加载原会话。完整的本地宿主组合见 [`scripts/playground.ts`](../scripts/playground.ts)，HTTP 操作见 [`examples/playground/server.ts`](../examples/playground/server.ts)。

SDK 用在 Node.js 服务端。浏览器通过你的服务调用它，模型凭据和业务执行函数保留在服务端。当前本地页面的 HTTP 路由属于示例宿主，不是已经对外发布的通用服务 API。

## 再体验其他能力

以下命令使用真实 PostgreSQL 测试库，模型和业务数据为预设内容。依次运行，源码统一在 [`examples/scenarios.ts`](../examples/scenarios.ts)。

| 命令                      | 能看到什么                         | 接入自己业务时还需要什么                         |
| ------------------------- | ---------------------------------- | ------------------------------------------------ |
| `pnpm example basic`      | 提问、续聊、配置版本、用量         | 真实模型及持久身份                               |
| `pnpm example tool`       | 模型请求一个只读工具               | 自己的工具执行函数                               |
| `pnpm example skill`      | 选择技能、使用允许的工具、退出技能 | 技能说明及工具范围                               |
| `pnpm example knowledge`  | 检索资料并生成来源引用             | 实际的资料检索器和引用契约                       |
| `pnpm example memory`     | 写入偏好、版本校验与确认回执       | 实际的 Memory 存储与授权实现；示例内存变量不持久 |
| `pnpm example monitoring` | 一次检查及指标输出                 | 外部调度和监控接收端                             |

Skill 可以理解为可选的一组任务指令与工具范围；知识库负责提供可引用资料；Memory 负责在明确的身份和权限范围内读写信息。引擎提供这些能力的执行约定，真实业务数据源由宿主实现。

## 编码时先记住的规则

- 同一条消息因网络问题重试，沿用同一个 `requestId`；新的消息用新 ID。同一 ID 换了输入会返回 `RUN_REQUEST_CONFLICT`。
- 想先拿到运行句柄再等待结果，使用 `session.startRun()`，从返回值的 `result` 等待完成。审批或工具结果未知时，等待可能持续到宿主处理相应请求。
- 想显示生成进度，可用事件或快照；最终回答以运行结果为准。需要断线补拉时按 [SDK 事件约定](sdk-usage.md#事件和用量)保存序号。
- 同一数据库保持一个 Engine 管理实例；内存测试不能代替持久化恢复验证。
- 用量未知不补零，估算费用不等于供应商账单。

开始修改配置、审批或恢复逻辑前，继续阅读 [SDK 使用约定](sdk-usage.md)。
