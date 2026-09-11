# WorkBuddy Agent Runtime 使用说明

> 适用基线：WorkBuddy AI 5.4.2 / CodeBuddy CLI 2.132.0 恢复源码<br>
> 文档性质：WorkBuddy 现有内部 Runtime 的使用手册，不是腾讯发布的公共 SDK 文档<br>
> 置信边界：示例根据恢复源码整理；原始 TypeScript 类型、包发布方式和部分服务端协议不可恢复

## 1. 先说它要解决什么问题

WorkBuddy 的 Agent Runtime 不是一个单独的“模型调用函数”，而是给所有 Agent 场景共用的执行底座。它主要解决四类问题：

1. **把 Agent 跑稳**：Session、Agent Loop、Tool、Skill、知识库、长期记忆、权限、取消、恢复和历史回放走同一条主链；
2. **把能力配清楚**：统一解析模型来源和凭证、模型能力、Mode、Tool、Skill、Connector/MCP、知识库、记忆、权限与 Sandbox；
3. **把问题查明白**：一次调用能从 Renderer 追到 Daemon、Sidecar、模型和 Tool，并看到事件、耗时、Token、Credit 和失败位置；
4. **把后台任务管起来**：Automation 负责调度，普通 Agent Loop 负责执行，Inbox/Outbox 负责结果与通知交付。

它的核心设计理念是“**模型驱动任务，工程守住边界**”：需要理解语义、选择工具、修正可恢复参数时，让模型决定；工程层负责 Schema/协议校验、权限、超时、幂等、安全隔离和副作用控制。格式错了可以把明确错误作为 Observation 返回给模型修正，但协议错误、权限拒绝和结果未知的副作用不能靠盲目重试解决。

### 1.1 白话概念

| 概念 | 白话解释 | 生命周期 |
| --- | --- | --- |
| Session | 一段可以继续聊、继续执行的任务上下文 | 跨多次调用，可持久化 |
| Agent Run | Session 中的一次 `prompt()` 执行 | 从一次输入到结束、取消或失败 |
| Agent Loop | 模型回答、调用工具、读取结果、继续回答的循环 | 属于一次 Agent Run |
| Runtime | 真正承载模型与工具循环的执行环境 | 可以重启或回收，不等于 Session |
| Tool | 模型可调用的一个确定性能力，例如读文件、Shell、MCP 接口 | 在 Runtime 启动时组装 |
| Skill | 教模型如何完成某类任务的说明、流程和资源 | 先发现，调用时按需加载 |
| 知识库 | 可被检索或附加到本轮的外部材料 | 通常通过 Connector/MCP 接入 |
| 长期记忆 | 跨轮、跨 Session 或跨项目保留的信息 | 分云端、用户级、项目级 |
| Automation | 定时或一次性触发一个普通 Agent Run | 由 Scheduler 持久化调度 |
| 监控告警 | Automation 定时取数，模型判断，Tool 或 Outbox 发送结果 | 建立在 Automation 之上 |

### 1.2 文档导航

| 你现在想做什么 | 直接看 |
| --- | --- |
| 先跑通一个新会话或继续旧会话 | 第 2 章 |
| 理解 Session、Runtime 和一次调用的关系 | 第 3～4 章 |
| 新建、注册、执行、校验 Tool | 第 5 章 |
| 新建、安装、启用、调用、校验 Skill | 第 6 章 |
| 上传、接入、检索、校验知识库 | 第 7 章 |
| 使用项目、用户、云端和 Automation 记忆 | 第 8 章 |
| 建监控告警和通知 | 第 9 章 |
| 配模型、Thinking、Retry 和格式约束 | 第 10 章 |
| 消费流式事件、权限和中断 | 第 11 章 |
| 看懂 Token、上下文占用和 Credit | 第 12 章 |
| 调试一次完整 Agent Run | 第 13 章 |
| 查通用配置和内部分层 | 第 14～16 章 |

WorkBuddy 的主调用链为：

```text
WorkBuddy Renderer
  → WorkbuddyAgentAdapterNext
  → WorkbuddyDaemonClient
  → Daemon SessionManager
  → CodeBuddyCodeSessionBackend
  → CodeBuddy CLI Sidecar / ACP
  → AgentService / Runner / Model / Tool
```

核心使用模型只有一句话：**围绕持久 Session，订阅事件，然后一次次调用 `prompt()`；能力在 Session/Runtime 层装配，而不是每轮重新拼一个 Agent。**

## 2. 最短使用：按场景看

以下代码假设调用方运行在 WorkBuddy Desktop 内部，并已经取得初始化完成的 Daemon Client：

```ts
const api = internalDaemonClient;
```

它由 Electron Main、Preload/MessagePort 和 Daemon Transport 建立，浏览器页面不能自行构造。

### 2.1 新建一个 Session

```ts
const created = await api.createSession({
  cwd: "/absolute/path/to/project",
  title: "分析项目",
  config: {
    mode: "craft",
    model: "model-id",
    permissionMode: "default",
    useSandboxCLI: true,
  },
});

const sessionId = created.sessionId;

const off = api.$on(`session:event:${sessionId}`, event => {
  handleSessionEvent(event);
});

await api.notifyListenerReady(sessionId);

const result = await api.prompt(sessionId, [
  { type: "text", text: "分析当前项目并给出三个改进建议" },
]);

console.log(result.stopReason);

// 仅在页面离开或 Session UI 销毁时 off()；Usage/Trace 可能在终态后迟到。
```

调用顺序不能颠倒：先监听，再 `notifyListenerReady()`，最后 `prompt()`。这样才能接到模型文本、Thinking、Tool、权限、Usage 和终态事件，也能补推监听器建立前已经产生的 Pending Event。

### 2.2 已有一个 Session，继续使用

```ts
const off = api.$on(`session:event:${sessionId}`, handleSessionEvent);

await api.loadSession(sessionId, {
  cwd: "/absolute/path/to/project",
  forceRendererHistoryReplay: true,
});

await api.notifyListenerReady(sessionId);

await api.prompt(sessionId, [
  { type: "text", text: "继续刚才的分析，把第二点落实到代码" },
]);
```

不需要把上一轮对话手工拼进 Prompt。History、Tool Result、Checkpoint 和 Compact 都由 Runtime 管理。

### 2.3 让模型调用 Tool

最简单的方式是通过 Mode 选择默认 Tool 集：

```ts
const { sessionId } = await api.createSession({
  cwd,
  config: { mode: "craft" },
});
```

业务只描述目标，模型在 Agent Loop 中自行决定何时调用 Tool：

```ts
await api.prompt(sessionId, [
  { type: "text", text: "检查测试失败原因并修复" },
]);
```

只给当前 Conversation 用的小能力可以注册 Client Tool；长期共享能力通过 MCP 或 Plugin 接入。不要在 Prompt 中伪造一个 Tool 名称。

### 2.4 指定一个 Skill

```ts
await api.prompt(sessionId, [
  {
    type: "resource_link",
    name: "repo-review",
    uri: "skill://repo-review",
    title: "Use skill repo-review.",
  },
  { type: "text", text: "检查当前代码改动并给出结论" },
]);
```

Skill 已安装且当前 Tool 集包含 `Skill` 时，也可以不显式附加，让模型根据 Skill 的 Name/Description 自动选择。

### 2.5 使用知识库

知识库以 Resource Link 指定，真正检索由对应 Connector/MCP 完成：

```ts
await api.prompt(sessionId, [
  {
    type: "resource_link",
    uri: "lexiang://kb-123?type=kb&teamId=team-1",
    name: "研发规范知识库",
    title: "研发规范知识库",
    _meta: {
      mentionType: "tencent-lexiang",
      entityType: "kb",
      kbId: "kb-123",
      teamId: "team-1",
    },
  },
  { type: "text", text: "根据知识库检查当前实现是否符合规范" },
]);
```

WorkBuddy Adapter 会识别 `tdoc://`、`lexiang://`、`ima://`，启用匹配的 Connector，并把引用元数据变成模型可理解的 Context。模型随后调用知识库 MCP 搜索或读取正文。

### 2.6 使用长期记忆

项目长期记忆默认位于：

```text
<cwd>/.workbuddy/memory/MEMORY.md
```

日常工作记录位于：

```text
<cwd>/.workbuddy/memory/YYYY-MM-DD.md
```

它们会在后续 Session 的 Context 组装阶段按需读取。业务不需要在每次 Prompt 中重复传入。

### 2.7 建立监控告警

对话内可以让模型调用 `automation_update` 创建；产品代码也可以使用 Adapter：

```ts
const result = await adapter.updateAutomation({
  mode: "create",
  name: "API 错误率监控",
  prompt: [
    "查询最近 10 分钟 API 指标。",
    "错误率超过 2% 时给出告警、受影响接口和证据。",
    "数据源不可用时明确报告监控失败，不得当作正常。",
  ].join("\n"),
  scheduleType: "recurring",
  rrule: "FREQ=HOURLY;INTERVAL=1",
  cwds: ["/absolute/path/to/monitor-workspace"],
  status: "ACTIVE",
  modelId: "model-id",
  modelIsThinking: true,
  skills: ["sre-monitor"],
  connectorIds: ["metrics-connector"],
  pushToWecomBot: true,
  permissionMode: "default",
});
```

这是内部 Payload 示例。UI、`automation_update` Tool 和底层 Facade 的字段形态略有差异，接入时以当前调用层类型为准。

### 2.8 看本轮 Token、费用和报错链路

```ts
const off = api.$on(`session:event:${sessionId}`, event => {
  if (event.update?.sessionUpdate === "usage_update") {
    renderUsage(event.update);
  }
  appendDebugTimeline(event);
});

const result = await api.prompt(sessionId, contentBlocks);

const usage = await api.getPersistedUsage(sessionId);
console.log(result.stopReason, usage);
```

`usage_update.used/size` 看上下文占用，`_meta.usage` 看 Provider Token，`cost.amount` 看 Credit。出错时用 `sessionId + requestId + toolCallId + traceId` 串起本轮，不要只看最终一句错误。完整口径见第 12、13 章。

## 3. Session 与 Runtime 的关系

Session 是业务事实，Runtime 是执行资源：

| 情况 | Session ID | 历史 | Sidecar Runtime |
| --- | --- | --- | --- |
| 连续 `prompt()` | 不变 | 继续累积 | 通常复用 |
| 只切换 Model | 不变 | 保留 | 通常热更新 |
| 修改 Tool/Prompt 身份 | 不变 | 保留 | 可能替换 |
| Runtime Lease 回收 | 不变 | 保留 | 下次重新获得 |
| `destroySession` | 通常保留记录 | 保留 | 销毁 |
| `archiveSession` | 不变并归档 | 保留 | 可释放 |
| `deleteSession` | 删除 | 删除 | 销毁 |

因此不能把 Sidecar 进程当 Session，也不能因为 Runtime 重启就创建一个新会话。

Session 控制面确认包含：

| 类别 | 内部方法 |
| --- | --- |
| 创建和恢复 | `createSession`、`loadSession`、`getSession`、`listSessions` |
| 执行 | `prompt`、`cancel`、`requestYield` |
| 配置 | `updateSessionConfig`、`setSessionMode`、`setSessionModel`、`setSessionConfigOption` |
| 人机交互 | `respondToPermission`、`rejectPermission`、`resolveInterruption`、`answerQuestion`、`cancelQuestion` |
| 队列 | `getMessageQueue`、`enqueueMessage`、`removeQueueItem`、`reorderQueue`、`sendQueueItemNow`、`pauseQueue`、`resumeQueue`、`cancelQueue` |
| 历史 | `sessionRollback` |
| 用量 | `getPersistedUsage`、`getLastUsageEvent` |
| 生命周期 | `destroySession`、`archiveSession`、`renameSession`、`moveSession`、`deleteSession` |

## 4. 一次调用的横向链路

```text
产品/UI
  │ prompt + content blocks
  ▼
WorkbuddyAgentAdapterNext
  │ 补齐 model/mode/meta，生成 addonSelection
  ▼
Daemon SessionManager
  │ 找到 Session，处理 pending input / queue / runtime config
  ▼
Runtime Config Resolver
  │ 合并 Mode、Expert、Plugin、Tools、Permission、Sandbox、MCP
  ▼
Context Pipeline
  │ 注入 History、Memory、Skill 索引、知识库引用、项目规则
  ▼
CodeBuddy CLI Sidecar / Runner
  │ 调用模型
  ▼
Model ──文本/Thinking──→ Session Event ──→ UI
  │
  ├─ Tool Call ─→ Permission/Sandbox ─→ Tool/MCP ─→ Tool Result ─┐
  ├─ Skill Call ─→ 读取 SKILL.md/资源 ────────────────────────────┤
  └─ Knowledge ─→ Connector/MCP 检索 ────────────────────────────┤
                                                               │
                    下一次模型调用 ← Observation/Result ───────┘
                              │
                              ▼
                    Final / Cancel / Error / Limit
                              │
                              ▼
               History + Usage + Checkpoint + Trace 持久化
```

各模块的职责边界：

- Adapter 负责产品语义和内容块转换；
- SessionManager 负责会话、并发、恢复和 Runtime 生命周期；
- Config Resolver 负责把配置解析成实际能力；
- Context Pipeline 负责“这一轮模型看到什么”；
- Runner 负责 Agent Loop；
- Tool/Skill/Connector 负责外部能力；
- Event、Usage 和 Trace 负责 UI 与可观测性。

## 5. Tool：如何配置和调用

### 5.1 先看完整生命周期

| 阶段 | WorkBuddy 怎么做 | 失败时怎么处理 |
| --- | --- | --- |
| 新建 | 内置 Tool 由 CLI 提供；业务 Tool 写成 Client Tool、MCP Server 或 Plugin Tool | 定义不完整就不注册 |
| 注册/发现 | Mode/Plugin/MCP 进入 Runtime；Client Tool 注册到当前 Conversation | 重名、空 Schema、MCP 握手失败直接报错 |
| Session 装配 | Config Resolver 计算本 Session 真正可见的 Tool 集 | Tool 名存在但没有实现时不可调用 |
| 执行 | 模型生成 Tool Call，Runtime 做权限/Sandbox 检查后调用实现 | 超时和执行异常转成明确 Tool Result |
| 校验 | Schema 校验结构，Handler 校验业务参数与权限，结果再按协议校验 | 可修正参数错误返回模型；协议/安全错误终止该调用 |
| 更新/删除 | MCP 修改配置或开关；Client Tool 先注销再注册 | 不热改正在执行的 Tool Call |
| 调试 | 用 `sessionId/requestId/toolCallId` 串联事件、日志和 Trace | 见第 13 章 |

### 5.2 Tool 从哪里来

WorkBuddy 没有确认一个产品侧公共 `runtime.registerTool()`。Tool 主要来自：

1. CodeBuddy CLI 内置 Tool；
2. Mode/Expert 解析出的 Tool 集；
3. 已启用 Plugin；
4. MCP Server；
5. Connector 转换出的 MCP Tool；
6. Desktop Host 提供的受控能力。

### 5.3 用 Mode 选择默认 Tool 集

| Mode | Tool 倾向 | 默认 Permission 倾向 |
| --- | --- | --- |
| `craft` | 文件读写、Shell、Web、Skill、Agent、Automation 等 | `bypassPermissions` |
| `ask` | Read、Glob、Grep、Web 等只读能力；默认没有 `Skill` | `default` |
| `plan` | Craft 集合加 Plan Tool | `plan` |
| `expert` | 接近 Plan/Craft，并加载专家配置 | `bypassPermissions` |

Mode 不只是 UI 标签。它会一起影响 System Prompt、Tool、Permission、Prompt Variables 和 Runtime Restart Fingerprint。

### 5.4 显式覆盖 Tool 集

内部 Session Config 支持：

```ts
await api.updateSessionConfig(sessionId, {
  tools: "Read,Glob,Grep,Skill,AskUserQuestion",
});
```

注意：

- `tools` 是逗号分隔的 CLI Tool 名称，不是 Tool Schema；
- 只有名称而没有 Provider/MCP/Plugin 实现，模型仍无法调用；
- 如果需要模型自动使用具体 Skill，Tool 集必须保留 `Skill`；
- 改变 `tools` 会触发 `restart_required`，Session ID 不变，空闲后替换 Sidecar；
- 产品主链更推荐配置 Mode 和能力来源，让 Daemon 自动解析 Tool 集。

### 5.5 当前 Conversation 临时注册 Client Tool

较新的 WorkBuddy Core 有一个 **Session/Conversation 级 Client Tool Registry**。它适合把 Renderer 或宿主进程已有的小能力临时交给当前会话，例如选择 UI 元素、读取当前页面状态或调用宿主提供的受控服务。它不是已发布的公共 `runtime.registerTool()` SDK。

```ts
await conversation.registerClientTools("order-panel", [
  {
    id: "lookup_order",
    name: "查询订单",
    description: "按订单号查询当前用户有权查看的订单",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", minLength: 1 },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
    requiresApproval: false,
    async execute(input, context) {
      // Schema 是给模型和 Runtime 的契约；业务 Handler 仍要重新校验。
      if (typeof input.orderId !== "string" || !input.orderId.trim()) {
        return {
          status: "error",
          error: { code: "INVALID_INPUT", message: "orderId is required" },
        };
      }

      const order = await orderService.getVisibleOrder(input.orderId);
      return {
        status: "success",
        content: [{ type: "text", text: JSON.stringify(order) }],
      };
    },
  },
]);

// 更新时先注销旧定义，再注册新定义。
await conversation.unregisterClientTools("order-panel", ["lookup_order"]);
```

Registry 会先检查 `providerId`、Tool 的 `id/name/description` 和 `inputSchema`，并拒绝同一 Provider 重复注册。它把 Conversation、Provider、Tool 三者编码成隔离的 Wire ID，避免多会话同名 Tool 相互覆盖。真正执行时还会传入 `conversationId`、`toolCallId` 和可选 `timeout`；找不到、超时、执行异常分别返回 `CLIENT_TOOL_NOT_FOUND`、`CLIENT_TOOL_TIMEOUT`、`CLIENT_TOOL_EXECUTION_FAILED`。

这里的 `inputSchema` 在 Registry 层只确认“是对象”，不能替代 Handler 内的类型、权限、租户和资源归属校验。Renderer 销毁后执行函数也会消失，因此长期、共享、无人值守或服务端能力优先做成 MCP。

### 5.6 自定义业务 Tool：使用 MCP

通用 `AgentClient` 包装层支持在创建 Session 时传 MCP Server：

```ts
const session = await client.sessions.create({
  cwd,
  options: {
    mcpServers: [
      {
        name: "company-data",
        command: "node",
        args: ["/absolute/path/to/server.js"],
      },
    ],
  },
});
```

具体字段取决于当前 ACP/Provider 类型，上例只说明接入位置。WorkBuddy 产品主链会把项目 MCP、Connector MCP 和 Session MCP 统一转换成严格 MCP Config，再交给 Sidecar。

已配置 MCP 可以通过 WorkBuddy Provider 管理：

```ts
const servers = await provider.getMcpServers();

await provider.toggleMcpServer("company-data", true);
await provider.reconnectMcpServer("company-data");
await provider.toggleToolStatus("company-data", "search");

// 编辑底层 MCP 配置时使用：
const content = await provider.getMcpConfigContent();
await provider.saveMcpConfigContent(content);
```

删除、关闭或修改 MCP 会影响后续 Agent Run 的能力视图。运行中的 Tool Call 不应被业务层当作安全可重放请求。

MCP Tool 的接入闭环是：实现 Server 的 Tool 列表和调用协议 → 把 Server 写入 Session/项目 MCP 配置 → 用 `getMcpServers()` 检查发现结果 → 启用 Server 和具体 Tool → 在 Agent Run 中通过 Tool Call 执行。输入 Schema 和输出协议由 MCP Server 校验；业务鉴权、幂等键和审计仍由 Server 自己负责。连接失败先 `reconnectMcpServer()`，不要靠重发用户 Prompt 修连接。

### 5.7 Tool 的校验、权限与安全

Tool 最终同时受到以下约束：

```text
期望 Tool 集
  ∩ Host allowedTools
  - 企业/安全策略 disallowedTools
  - 被禁用的 MCP Tool
  + Permission 审批
  + Sandbox 文件/命令隔离
```

`config.tools` 不能绕过安全策略。当前可确认的 Host Allowlist 包括：

```text
present_files
read_me
show_widget
connect_cloud_service
connect_open_platform
WebFetch
Bash(mcporter:*)
```

这不是完整 Tool 清单，也不表示所有 Session 都能无条件执行。

## 6. Skill：如何安装、挂载和调用

### 6.1 Skill 和 Tool 的区别

`Skill` 是模型可调用的一个 Tool；`repo-review`、`sre-monitor` 等是这个 Tool 后面的具体 Skill。

```text
Tool 集包含 Skill
       │
       ▼
模型看到可用 Skill 的 Name + Description
       │
       ▼
模型调用 Skill(name="repo-review")
       │
       ▼
Loader 读取 SKILL.md 和所需资源
```

Skill 不应作为普通 Tool Schema 直接塞进每次模型请求。

### 6.2 从新建到执行的完整生命周期

| 阶段 | 怎么做 | 怎么确认成功 |
| --- | --- | --- |
| 新建 | 建目录和 `SKILL.md`，写清名称、触发场景、步骤和边界 | Frontmatter 可解析，说明可独立执行 |
| 安装 | 从本地目录/Zip、URL、Marketplace、SkillHub 或 Plugin 安装 | 安装结果 `success: true` |
| 注册/发现 | `skillList` 扫描项目、用户、Connector、Builtin、Plugin 五类来源 | 列表里能看到 Name、Source、File Path |
| 启用 | 保持默认状态，或用 `skillToggle`/批量开关调整模型可见性 | `disableModelInvocation` 符合预期 |
| Session 装配 | 项目资源挂载、Plugin 启用，当前 Tool 集保留 `Skill` | Runtime 的 Skill 索引里可见 |
| 执行 | 模型自动选择，或本轮附加 `skill://<name>` | 出现 Skill Tool Call，并加载所需文件 |
| 校验 | 安装前安全扫描；执行时受 `allowed-tools`、Permission、Sandbox 约束 | 风险结论、Tool Call 和结果可追踪 |
| 更新/删除 | 覆盖安装或 `skillDelete`；刷新后续 Session 能力 | 重新 `skillList` 核对 |

一个最小可用的 `SKILL.md`：

```markdown
---
name: repo-review
description: 审查当前仓库改动，输出按严重度排序的问题和证据。
allowed-tools:
  - Read
  - Glob
  - Grep
---

# Repo review

1. 读取变更和相关代码。
2. 只报告可复现的问题，并附文件位置。
3. 不直接修改代码，除非用户明确要求。
```

名称和描述决定模型能否正确选中 Skill；正文描述执行流程；`allowed-tools` 只缩小权限，不会扩大 Session 原本没有的 Tool。

### 6.3 Skill 来源与管理入口

| 来源 | 如何进入 Session |
| --- | --- |
| 个人 Skill | CLI 从用户配置目录扫描 |
| Plugin Skill | `sessionSettings.enabledPlugins` 启用 Plugin 后扫描 |
| 项目 Skill | `projectResources.projectSkills` 下载并挂载 |
| Connector Skill | `projectResources.connectorSkills` 下载并挂载 |
| Automation Skill | Automation Definition 的 `skills`，运行时转成 `skill://...` |

最小 Skill 目录：

```text
repo-review/
└── SKILL.md
```

Marketplace Skill 的产品入口确认包括：

```ts
const skills = await provider.getMarketplaceSkills();
const detail = await provider.getMarketplaceSkillContent(params);
await provider.installMarketplaceSkill(params);
```

安装参数依赖当前 Marketplace 协议；安装完成后仍需满足 Plugin/Skill 启用状态和当前 Session Tool 集，才能被模型自动调用。

本地 Skill 可以用内部 Provider 完成安装、发现、开关和删除：

```ts
const installed = await provider.importSkill({
  source: "userSettings",
  folderPath: "/absolute/path/to/repo-review",
  securityCheck: true,
  overwrite: false,
});

if (installed.error === "security_check_blocked") {
  // 把 installed.preCheck 的命中、风险和诊断展示给用户；由用户/策略决定是否继续。
  showSkillSecurityReview(installed.preCheck);
  throw new Error("skill installation requires security approval");
}
if (!installed.success) throw new Error(installed.error);

const { results } = await provider.getSkillList({ cwd });
const skill = results.find(item => item.name === "repo-review");

await provider.toggleSkill({ filePath: skill.filePath, disable: false });

// 不再需要时：
// await provider.deleteSkill({ filePath: skill.filePath });
```

`importSkill()` 会经过安装策略、包大小和可选安全预检；命中扫描结果时先返回 `security_check_blocked + preCheck` 交给 UI 决策，批准后的实际安装再走受策略约束的安装通道。`installSkillByPath()` 是偏内部的直接安装入口，主链会关闭安全扫描，不应用来绕过正常导入。安全服务无结论、网络不可用和明确判恶必须在 UI 中区分，不能把“查不到结果”当作“安全”。

### 6.4 给某个 Session 挂载 Skill

```ts
const { sessionId } = await api.createSession({
  cwd,
  projectId: "project-123",
  config: {
    mode: "craft",
    sessionSettings: {
      enabledPlugins: {
        "code-review@company-marketplace": true,
      },
    },
  },
  projectResources: {
    connectorSkills: [
      {
        skillId: "jira-triage",
        downloadUrl: "https://example.internal/jira-triage.zip",
      },
    ],
    projectSkills: [
      {
        name: "repo-review",
        downloadUrl: "https://example.internal/repo-review.zip",
      },
    ],
    mcpServers: [],
  },
});
```

Daemon 会：

1. 将 Skill 下载到 `$CODEBUDDY_CONFIG_DIR/project-resources/<projectId>/...`；
2. 校验目录没有逃逸项目资源根目录；
3. 通过 `CODEBUDDY_SESSION_SKILL_DIRS` 注入对应 Sidecar；
4. 只让属于该项目的 Session 扫描这些 Skill；
5. 单个下载失败时记录错误，其他 Skill 继续安装。

`projectResources` 携带真实下载地址；`addonSelection.projectResources` 只记录 Skill/MCP 标识，用于编排、持久化和诊断。WorkBuddy Adapter 会从前者自动生成后者，业务通常不应手写两份。

### 6.5 自动选择与显式选择

自动选择需要同时满足：

- Skill 已安装并被扫描；
- Skill 允许模型调用；
- 当前 Tool 集包含 `Skill`；
- Name/Description 与任务匹配。

显式选择使用 `skill://<name>` Resource Link，见 2.4。它只影响本轮 Prompt，不修改整个 Session 的 Tool 集，也不要求重建 Session。

### 6.6 Skill 校验、可见性和隔离

恢复代码中可以确认以下控制语义：

| 设置 | 模型自动可见 | 用户可显式调用 |
| --- | --- | --- |
| `on` | 是 | 是 |
| `name-only` | 只暴露名称 | 是 |
| `user-invocable-only` | 否 | 是 |
| `off` | 否 | 否 |

关闭“允许模型调用”时，WorkBuddy UI 会在用户级 `settings.json` 的 `skillOverrides` 写入 `user-invocable-only`；重新开启时删除 Override，恢复 `SKILL.md` 默认值。

Skill 还可以：

- 用 `allowed-tools` 缩小执行期间可用 Tool；
- 用 `context: fork` 在隔离 Subagent 中运行，再把结果交回主 Session；
- 携带脚本、资源和 Hook；
- 通过 `disable-model-invocation` 禁止模型自动选中。

Skill 和 Hook 都属于可执行内容，不可信 Skill 必须经过安全审查。

## 7. 知识库：如何接入和检索

### 7.1 选择正确的接入方式

| 知识类型 | 推荐方式 |
| --- | --- |
| 少量固定规则、SOP | Skill |
| 当前项目文件 | `file://` Resource Link 或文件 Tool |
| 单篇远程文档 | 对应产品的 Resource Link + Connector |
| 大型可搜索知识库 | Connector/MCP Search Tool |
| 项目自建向量库 | 自定义 MCP Server |
| 只用于本轮的一段材料 | Prompt Resource/Resource Link |

当前恢复代码没有确认统一的 `registerKnowledgeBase()` API。WorkBuddy 的统一方式是：**用 Resource Link 表达用户选中了什么，用 Connector/MCP 完成搜索与读取。**

### 7.2 从新建到检索的完整生命周期

| 阶段 | WorkBuddy 怎么做 | 校验重点 |
| --- | --- | --- |
| 新建知识内容 | 在腾讯文档/乐享/IMA 等来源系统创建；本地文件也可上传到产品知识空间 | 文件格式、大小、登录态、目标父节点 |
| 注册数据源 | 连接 Connector，或注册一个提供 Search/Get Tool 的 MCP Server | Connector 授权、MCP 握手、Tool 列表 |
| 绑定 Session/本轮 | Session 装配 MCP；本轮输入附加 `tdoc://`、`lexiang://`、`ima://` 等 Resource Link | URI 和 `_meta` 中的实体 ID 一致 |
| 执行检索 | 模型先调用 Search，再按文档/Chunk ID 读取正文 | Top-K、权限过滤、更新时间、引用来源 |
| 校验结果 | MCP 校验输入和访问权限；业务校验返回结构；模型答案保留引用 | 无结果、无权限、连接失败不能伪装成正常答案 |
| 更新/删除 | 内容源系统管理正文；WorkBuddy 更新 Connector/MCP/Resource Link | 旧 Session 里的历史引用可能仍存在 |

WorkBuddy 产品知识空间支持把本地文件上传并异步导入：

```ts
const result = await backendProvider.uploadToKnowledge(file, file.name, {
  parentId: "target-folder-id",
  supportShare: true,
  source: 1,
});

if (!result) {
  throw new Error("upload/import failed");
}
if (result.errorCode) {
  throw new Error(`knowledge import failed: ${result.errorCode}`);
}
```

底层流程是申请上传凭证 → 上传对象存储 → 创建异步导入任务 → 轮询导入结果。这个 API 是 WorkBuddy 产品后端能力，不是通用 Agent Runtime 的向量库注册接口；知识空间的建库、分组、标度和删除仍由来源产品负责。

### 7.3 已确认的知识资源 URI

| URI | 数据来源 | 运行时行为 |
| --- | --- | --- |
| `tdoc://<fileId>` | 腾讯文档 | 自动启用匹配 Connector，通过腾讯文档能力读取 |
| `lexiang://<entityId>?type=...` | 腾讯乐享 | 注入实体、知识库和团队 ID，通过 `lexiang-ol` MCP 检索 |
| `ima://...` | IMA 文件/知识库 | 注入文件 ID、知识库 ID，通过 `ima-mcp` 检索 |
| `file://...` | 本地文件 | 使用本地文件能力读取 |

远程知识库不能退化成 `Read/Glob/Grep/Bash`。Connector 不可用时，应明确提示启用或重新授权，而不是假装读到了内容。

Connector 的产品管理入口包括：

```ts
const configs = await provider.getConnectorConfigs();
const states = await provider.getConnectorStates();

await provider.connectConnector(configId);
await provider.disconnectConnector(configId);
```

把知识库 Resource Link 加入输入时，Renderer 还会尝试自动启用匹配 Connector；显式连接仍适合启动检查和无人值守 Automation。

### 7.4 自建知识库 MCP

推荐至少提供：

```text
search(query, filters, topK)
get_document(id)
get_chunk(id)
```

Tool Result 应包含文档 ID、标题、来源、更新时间和可追溯引用。让模型先检索、再按需读取正文，避免每轮把整个知识库灌入 Prompt。

项目 Connector/MCP 可以随 `projectResources.mcpServers` 一起创建：

```ts
projectResources: {
  connectorSkills: [],
  projectSkills: [],
  mcpServers: [
    {
      serverName: "company-kb",
      connectorName: "Company Knowledge",
      gatewayUrl: "https://example.internal/mcp",
      transport: "http",
    },
  ],
}
```

Daemon 在运行时注入用户、项目和鉴权 Header；落盘的 MCP 状态会移除 Token。

自建知识库至少做四层校验：Server 启动时校验配置与凭据；Search Tool 校验 Query/Filter/Top-K；数据层按用户、租户和文档 ACL 过滤；Tool Result 校验文档 ID、来源和可引用文本。模型只负责“搜什么、读什么、怎么总结”，不能负责鉴权。

## 8. 长期记忆：如何读取和写入

WorkBuddy 的记忆不是一个字段，而是多层系统：

| 层 | 范围 | 位置/来源 | 读写方式 |
| --- | --- | --- | --- |
| Session History | 当前 Session | Runtime History/Checkpoint | 自动读写 |
| Cloud Profile | 同一用户跨 Session | 服务端 `/api/memory/profile`，以 `<memory>` 注入 | 本地只读 |
| 用户本地记忆 | 同一用户跨项目 | `~/.workbuddy/MEMORY.md` | 明确要求记住时由 Agent 编辑 |
| 项目长期记忆 | 当前 Workspace | `<cwd>/.workbuddy/memory/MEMORY.md` | Agent 归纳更新 |
| 项目日记 | 当前 Workspace、按天 | `<cwd>/.workbuddy/memory/YYYY-MM-DD.md` | 只追加 |
| 历史对话检索 | 用户历史 Session | `conversation_search` Tool | 按需搜索 |
| Automation 记忆 | 单个自动化 | `<cwd>/.workbuddy/memory/automations/<id>/memory.md` | 每次运行前读、结束后写摘要 |

私有化版本可以通过 `WORKBUDDY_DATA_FOLDER_NAME` 改写 `.workbuddy` 目录名，通过 `WORKBUDDY_CONFIG_DIR` 改写用户配置目录。

### 8.1 从产生到复用的完整生命周期

| 阶段 | 怎么做 | 校验重点 |
| --- | --- | --- |
| 产生 | Session History 自动落；稳定事实由 Agent 写入用户/项目 Memory；Automation 写自己的摘要 | 只存长期有用内容，不存 Secret 和短期噪声 |
| 注册/发现 | History 由 Session ID 关联；本地 Memory 按约定路径发现；Cloud Profile 登录后加载 | 路径、归属范围和开关正确 |
| Context 装配 | Collector 在 Prompt 组装时注入；历史对话可按需调用 `conversation_search` | 字符上限、去重、避免把全部历史塞入 |
| 执行 | 模型把记忆当 Context 使用，需要时更新文件或查询历史 | 记忆不是事实源，重要结论仍需实时核验 |
| 校验/维护 | 截断超长内容，日记定期归纳，错误信息允许覆盖或删除 | 用户级与项目级不要串范围 |

WorkBuddy 没有一个统一 `registerMemoryProvider()` 入口。Session History、Cloud Profile、用户文件、项目文件和 Automation Memory 各自持久化，再由 Context Collector 统一装配到模型上下文。

### 8.2 项目记忆怎么用

当用户说“以后这个项目统一使用 pnpm”时，Agent 应把稳定规则写到：

```markdown
# Project conventions

- Package manager: pnpm.
- Run tests with `pnpm test` before delivery.
```

文件：

```text
<cwd>/.workbuddy/memory/MEMORY.md
```

完成有长期价值的开发、报告或架构决策后，将简短记录追加到当天日志。临时错误、一次性搜索结果和 Secret 不应写入。

### 8.3 用户级记忆怎么用

当用户明确要求“所有项目都记住：默认用中文回答”时，写入：

```text
~/.workbuddy/MEMORY.md
```

它适合跨项目偏好，不适合记录某个仓库的技术状态。用户本地记忆单次注入最多约 4,000 字符。

### 8.4 云端长期画像

登录且未关闭个性化记忆时，UserMemoryCollector 优先读本地云记忆归档，缺失时请求服务端，作为只读 `<memory>` 注入。远程请求超时约 5 秒，失败会降级为空，不阻断 Session。

云端画像由服务端管理，本地修改会被覆盖。需要精确、必须遵循的长期规则，应写用户本地或项目记忆。

### 8.5 容量和维护

- 项目 `MEMORY.md` 建议控制在约 3,000 字符；读取保护上限为 8,000 字符，超过会截断并要求整理；
- 用户 `MEMORY.md` 单次注入上限约 4,000 字符；
- 云端 Profile 注入有约 10,000 字符保护上限；
- 每日记录只追加；30 天以上日志应按主题归纳到项目 `MEMORY.md`；
- `disableLocalSkillsMemory` 可以关闭本地 Skill/Memory 沉淀，但不影响云端画像和 `conversation_search`。

## 9. 监控、告警和 Automation

### 9.1 WorkBuddy 的监控告警模型

WorkBuddy 没有单独的指标规则引擎。监控告警由以下能力组合：

```text
Scheduler
  → 创建/加载后台 Session
  → 注入 Prompt + Skill + Connector + Automation Memory
  → Agent 调 MCP/Connector 获取指标
  → 模型判断是否异常
  → 生成结果或调用告警 Tool
  → Inbox
  → Delivery Outbox
  → 微信/企微等渠道
```

Automation 复用普通 Agent Loop，不会另起一套模型调用框架。

### 9.2 一个可执行的监控 Prompt 应包含什么

至少写清楚：

1. 数据源和查询时间窗口；
2. 告警条件和阈值；
3. 正常、异常、数据源失败分别如何处理；
4. 必须输出的证据；
5. 去重或冷却规则；
6. 是否允许执行外部动作；
7. 不允许 Ask User 时的默认策略。

示例：

```text
通过 metrics-connector 查询最近 10 分钟 checkout-api 的请求量和 5xx。
当请求量不少于 100 且 5xx 比例大于 2% 时判定异常。
异常时输出当前值、阈值、受影响接口、查询时间和证据链接。
如果数据源不可用，状态必须是“监控失败”，不能写“运行正常”。
不要修改线上配置；只允许发送告警。
```

### 9.3 创建、测试、暂停和删除

```ts
await adapter.updateAutomation(createPayload);

const snapshot = await adapter.getAutomationSnapshot();

await adapter.testAutomation(automationId);

await adapter.updateAutomation({
  mode: "update",
  id: automationId,
  status: "PAUSED",
});

await adapter.deleteAutomation(automationId);
```

对话内的 `automation_update` Tool 支持 `list`、`view`、`create`、`update`、`delete`；创建周期任务需要名称、Prompt、Schedule、状态，更新时只传需要修改的字段。

### 9.4 Skill、知识库和记忆如何进入自动化

- `skills` 会转为 `skill://<name>` Resource Link；
- `connectorIds` 在运行前确保对应 Connector 已连接；
- 全部声明的 Connector 都失败时，Automation 会 Fail Fast，避免“成功但没取到数据”；
- 每个 Automation 有独立 Memory，运行前读取，结束后只写简短摘要；
- 无人值守运行禁止 Ask User，应在 Prompt 中定义默认策略。

### 9.5 通知交付语义

`pushToWeChat` 或 `pushToWecomBot` 开启后，运行结果进入 Delivery Outbox。Outbox 使用 Dedupe Key、Claim 和有限重试；当前实现创建交付项时配置最多 5 次尝试，退避档位包括 3 秒、30 秒、10 分钟和 1 小时。

必须区分：

```text
Agent Run success ≠ 通知已送达
```

Run 状态和 Delivery 状态分别持久化。网络结果不明确时不能简单把整个 Agent Run 重跑，否则可能重复执行查询之外的副作用。

当前 Automation Payload 没有确认一个通用 `notifyOnlyOnChange` 或 `failed_runs_only` 字段。因此：

- 需要每轮报告时，可以直接开启 Outbox Push；
- 只想异常时通知，最好让 Agent 在异常时调用专门的告警 MCP Tool，并关闭每轮结果 Push；
- 若必须使用 Outbox，应在确定性业务层增加 `NO_ALERT`/状态变化过滤，不能只依赖自然语言保证静默。

### 9.6 Runtime 自身的监控

WorkBuddy 可以通过下列 ID 关联 Renderer、Daemon、Backend、CLI、Model 和 Tool：

```text
sessionId
conversationId
requestId / promptRequestId
traceId / traceparent
toolCallId
automationId / runId
```

恢复源码可以确认日志、Telemetry、OTel Trace、Usage、Session Event、Automation Run、Inbox 和 Delivery Outbox，但没有确认一个公开、统一展示全部 Model Attempt 和 Tool Call 的 Debug 平台。具体调试方法见第 13 章。

## 10. Model、Thinking、Retry 和格式约束

### 10.1 Model 配置

产品内置模型先从 Model Catalog 选择；Session 创建时传 `config.model`，已有 Session 再热更新：

```ts
await api.updateSessionConfig(sessionId, {
  model: "another-model-id",
});
```

Model-only Patch 有快速路径，一般不替换 Sidecar。模型列表、Token Limit、Thinking、图片和 Tool 能力来自 Product/Agent Model Catalog，不能只根据模型 ID 字符串猜测。

本地自定义模型走用户级 `models.json`，产品后端提供读取、保存、删除和连通性测试：

```ts
const model = {
  id: "company-model",
  name: "Company Model",
  vendor: "openai-compatible",
  url: "https://llm.example.com/v1",
  apiKey: "${COMPANY_LLM_API_KEY}",
  supportsToolCall: true,
  supportsReasoning: true,
  maxInputTokens: 128_000,
  maxOutputTokens: 8_192,
};

const probe = await api.configTestLocalCustomModel(model);
if (!probe.ok) throw new Error(`${probe.errorCode}: ${probe.errorMessage}`);

await backendProvider.saveLocalCustomModel({ model });
await api.updateSessionConfig(sessionId, { model: model.id });
```

默认按 OpenAI Chat Completions 兼容协议补齐 `/chat/completions`；`useCustomProtocol: true` 才原样使用 URL。连通性测试覆盖 URL、鉴权、404、429、超时和响应格式，只证明最小文本请求可用，不证明 Tool、图片、Thinking 与长 Context 都可用。`supportsToolCall/supportsReasoning` 等能力声明必须与服务真实能力一致。API Key 应使用环境变量占位或凭据保护，不能放进日志、Prompt、Memory 或 Trace。

### 10.2 Thinking

当前确认的 Thinking 信息有两层：

- Model Catalog 表示模型是否是 Thinking Model；
- Prompt/Session Metadata 可携带 `modelIsThinking` 和 `reasoningEffort`。

输入格式没有另起一套协议，仍然是同一个 Session 的 Prompt Content Blocks；输出也走同一个 Session Event 外壳，但内容类型不同：普通正文是 `agent_message_chunk`/`text`，Thinking 是 `agent_thought_chunk`/`reasoning`。消费者要分别合并，不能把 Thinking 当最终答案，也不能因为格式相似就混成一段文本。

普通 Retry 没有证据会自动关闭 Thinking；只有显式切换到不支持 Thinking 的模型，Thinking 才会随模型能力变化。

换句话说：Retry 重做的是模型 Attempt，不会因为“这是重试”就把 Thinking 关掉；每次 Attempt 仍使用当前 Model、`modelIsThinking` 和 `reasoningEffort/Thought Level`。如果 Provider 因降级切换了模型，才需要按新模型能力重新判断。

### 10.3 Retry

WorkBuddy 没有确认一个整个项目统一的 `retryCount: x` 配置。Retry 分布在不同层：

| 失败位置 | 当前确认行为 |
| --- | --- |
| Sidecar 启动/连接 | Process/Sidecar Manager 负责超时、恢复和重连 |
| `loadSession()` 的本地 ACP Endpoint 不可用 | Soft Reset 后重试一次 |
| `prompt()` 可确认在发送前失败 | 可以 Soft Reset 后重试一次 |
| Prompt 可能已发送、结果未知 | 标记 Replay Unsafe，不盲目重发 |
| Provider 429/5xx/超时 | CLI Provider/Runner 内部策略处理 |
| Automation 交付失败 | Outbox 独立重试，不重跑 Agent |
| Tool 参数错误 | 错误作为 Observation 返回模型，由模型修正后再次调用 |

业务层不要在 `api.prompt()` 外无条件套三次循环。文件写入、消息发送、告警和其他外部动作都可能被重复执行。

### 10.4 格式约束

Tool 参数、Provider 响应和产品协议分别有 Validator：

- 模型能够修复的 Tool 参数错误：返回错误 Observation，模型重新生成参数；
- 确定性的 Session/RPC 协议错误：直接失败；
- 可能已产生副作用但响应丢失：不能自动重放；
- 当前没有确认公共 `runObject({ schema })` API。

需要结构化输出时，优先使用 Tool Schema 或 MCP Tool 作为输出边界，再由业务 Validator 校验。不要只依赖 Prompt 要求模型输出 JSON。

## 11. 流式事件、权限和中断

### 11.1 事件消费

```ts
const off = api.$on(`session:event:${sessionId}`, event => {
  const update = event.update;

  switch (update?.sessionUpdate) {
    case "agent_message_chunk":
      renderAssistantDelta(update.content);
      break;
    case "tool_call":
    case "tool_call_update":
      renderTool(update);
      break;
    case "usage_update":
      renderUsage(update);
      break;
  }

  if (event.type === "permissionRequest") {
    showPermissionDialog(event);
  }

  if (event.type === "questionRequest") {
    showQuestion(event);
  }
});
```

事件消费者必须容忍历史回放、重连补推和重复事件，并使用 Session ID、Request ID、Tool Call ID 去重。

### 11.2 权限请求

```ts
await api.respondToPermission(sessionId, requestId, optionId);

// 或拒绝：
await api.rejectPermission(sessionId, requestId, "User rejected");
```

Permission 是 Pending 状态，不是失败，不能因此重新发送 Prompt。

### 11.3 模型提问

```ts
await api.answerQuestion(sessionId, toolCallId, answers);

// 或取消：
await api.cancelQuestion(sessionId, toolCallId, "User cancelled");
```

### 11.4 取消、排队和回退

```ts
await api.cancel(sessionId);

await api.enqueueMessage(sessionId, [
  { type: "text", text: "当前任务结束后再执行这一步" },
]);

await api.pauseQueue(sessionId);
await api.resumeQueue(sessionId);

await api.sessionRollback(sessionId, {
  forkFromRequestId,
  reason: "resend_edit",
});
```

Cancel 和 Rollback 都不能撤销已经发生的文件写入、网络请求或外部系统副作用。

## 12. Token、Usage 和费用

### 12.1 先把五个容易混淆的数分开

| 数值 | 来源 | 表示什么 | 能不能直接算钱 |
| --- | --- | --- | --- |
| `used / size` | `usage_update` 顶层 | 当前上下文已占 Token / Context Window；是快照，不是累计调用量 | 不能 |
| `promptTokens / completionTokens` | `_meta.usage` | Provider 报告的本次模型输入/输出 Token | 可作为计费依据之一 |
| Cache Tokens | `_meta.usage` | Prompt Cache 命中、未命中或写入 Token | 要按 Provider 价格规则计算 |
| `cost.amount / currency` | `usage_update.cost` | 服务端或 Provider 已算出的 Credit/费用 | 应优先使用 |
| `usageByCategory` | `_meta["codebuddy.ai/usageByCategory"]` | System Prompt、Conversation、Tools、MCP、Skills 各占多少上下文 | 不能；它是上下文构成 |

Core 为兼容统一 `Usage` 类型，会把 `used` 投影到 `inputTokens/totalTokens`。这里的名字容易误导：要看“实际模型输入”优先读 `details.promptTokens`，要看“上下文还有多少空间”看 `used/size`。

### 12.2 实时读取和恢复持久值

实时 Usage 通过 Session Event 到达：

```ts
if (event.update?.sessionUpdate === "usage_update") {
  const update = event.update;
  const details = update._meta?.usage;
  const byCategory = update._meta?.["codebuddy.ai/usageByCategory"];

  console.log({
    contextUsed: update.used,
    contextWindow: update.size,
    promptTokens: details?.prompt_tokens ?? details?.input_tokens,
    completionTokens: details?.completion_tokens ?? details?.output_tokens,
    cacheHitTokens:
      details?.prompt_cache_hit_tokens ?? details?.cache_read_input_tokens,
    credit: update.cost?.amount,
    currency: update.cost?.currency ?? "credit",
    byCategory,
  });
}
```

加载 Session 后可以读取持久值：

```ts
const persisted = await api.getPersistedUsage(sessionId);
const latest = await api.getLastUsageEvent(sessionId);
```

`usage_update` 可能在 Turn 已结束后迟到，尤其是 Resume/Load 后补推的分类明细。因此不能在收到 Final Text 时立刻销毁监听器；要让 Session Event 通道继续接收并按事件 ID/阶段 ID 去重。

### 12.3 一次 Agent Run 到底怎么算 Token

一次用户调用可能触发多轮“模型 → Tool → 模型”。正确口径是：

```text
Agent Run 实际输入 Token = Σ 去重后 Usage Stage 的 promptTokens
Agent Run 实际输出 Token = Σ 去重后 Usage Stage 的 completionTokens
Session 累计 Credit        = Σ 去重后的各阶段 cost.amount
当前上下文占用率           = 最新 used / 最新 size
```

同一模型阶段可能推送多帧 `usage_update`。当前 Adapter 按最新 Assistant Message 的位置记录 Stage，同一个位置的新快照会覆盖旧快照，而不是重复相加；只有新的、已结算 Stage 才进入累计。若某 Provider 返回的是累计值而不是阶段值，还要按 Provider Contract 取差量，不能直接求和。

不要把最新 `used` 累加，也不要把 `usageByCategory` 再加到 `promptTokens`；它们描述的是上下文快照。Retry 会创建新的模型尝试，通常会产生额外 Token/Credit。Tool 自己不消耗模型 Token，但 Tool Schema、参数和 Result 进入下一次模型 Context 后会占 Token。Thinking 的内部 Token 是否单列取决于 Provider；当前 WorkBuddy 统一结构没有确认独立 `reasoningTokens` 字段，不能自行从文本长度估算。

缓存后的真实价格也不能只用 `promptTokens - cacheHitTokens` 猜。不同 Provider 对缓存读取、缓存写入、Thinking 和长上下文定价不同；若有 `cost.amount`，以它为准。

### 12.4 聚合、去重和费用落账

WorkBuddy 维护 Session Usage、分类用量和请求级 Credit 聚合。统计时至少保留下列维度：

```text
sessionId
requestId
modelId
inputTokens / outputTokens
promptCacheHitTokens / promptCacheMissTokens / promptCacheWriteTokens（若 Provider 提供）
tool/skill/mcp 分类
credit
startedAt/finishedAt
stopReason
```

历史投影会用 Stage/Message/Call/Tool Call ID 避免同一份 Credit 被重复相加；Daemon Cache 则按 Conversation Request ID 保存 Credit。自己的报表至少使用 `sessionId + requestId + stageId` 作为幂等键，才能抵抗重连、历史回放和迟到事件。

WorkBuddy 还有一个 Credit Prediction：首轮已经拿到真实 Credit、输入/输出 Token，且发生过 Tool Call 时，可请求后续 Credit 区间预测。它只用于体验提示，不是最终账单。本地 Usage 用于 UI、调试和内部聚合；最终价格、折扣、额度和账单以产品服务端或模型 Provider 为准。

## 13. Debug：怎么定位一次调用的问题

### 13.1 最小调试闭环

调试不要只看最终报错，按下面顺序定位：

1. 用 `sessionId` 找到 Session 和实际 Runtime Config；
2. 用 `requestId/promptRequestId` 找到本轮输入、模型调用和终态；
3. 用 `toolCallId` 找 Tool 参数、权限决策、执行结果和耗时；
4. 用 `traceId/traceparent` 串 Renderer → Main/Daemon → Backend → CLI → Model/Tool；
5. 同时核对最后一条 `usage_update`，判断是否在模型请求、Tool 循环或上下文阶段异常；
6. Automation 再追加 `automationId/runId`，通知问题继续查 Inbox/Delivery Outbox。

推荐每条结构化调试记录至少带：

```text
timestamp, sessionId, requestId, traceId, phase,
modelId, mode, toolCallId, toolName,
status, durationMs, errorCode, retryAttempt,
contextUsed, contextWindow, promptTokens, completionTokens, credit
```

Prompt、Tool 参数、Tool Result、环境变量、认证 Header 和 Memory 可能包含敏感信息。默认只记录长度、Hash、类型和截断后的错误前缀；恢复源码里的 Conversation 诊断日志也明确不记录 Env Value、System Prompt 和 Token 内容。

### 13.2 打开本地 Provider 调试日志

通用 Local Agent Provider 支持 Debug 开关：

```ts
const provider = new LocalAgentProvider({
  channel,
  debug: true,
  acpConfig: { timeoutMs: 30_000 },
});
```

它会打开 Provider、ACP Connection 和本地 Filesystem 的诊断日志。这是内部 Provider 配置，不等于产品级 Debug 平台。Memory Archive 另有 `WORKBUDDY_MEMORY_ARCHIVE_DEBUG=1`，只用于该子系统，不应作为全局 Debug 开关。

### 13.3 订阅一条可关联的事件时间线

```ts
const off = api.$on(`session:event:${sessionId}`, event => {
  const update = event.update ?? {};
  const cb = update._meta?.["codebuddy.ai"] ?? event._meta?.["codebuddy.ai"] ?? {};

  debugSink.write({
    at: Date.now(),
    sessionId,
    eventType: event.type ?? update.sessionUpdate,
    requestId: cb.requestId ?? cb.promptRequestId,
    traceId: cb.traceId,
    toolCallId: update.toolCallId,
    status: update.status,
    // 只记参数/结果大小，不默认记正文。
    payloadBytes: JSON.stringify(update).length,
  });
});
```

先订阅，再 `notifyListenerReady()`，否则首段事件可能落在监听器建立之前。事件会因历史回放或重连重复，Debug Store 和 UI 都必须幂等。

### 13.4 Trace 如何贯穿各模块

Renderer/Main 会生成或继承 W3C `traceparent`，并通过 Prompt Metadata 的 `"codebuddy.ai".traceparent` 向 Daemon 和 CLI 传递。已确认的 Span 类型包括：

| Span | 看什么 |
| --- | --- |
| `daemon.prompt.resolve_backend` | 找 Session Backend/Runtime 花了多久 |
| `daemon.prompt.compose` | Memory、Skill、知识库和项目规则组装耗时 |
| `daemon.prompt.dispatch` | Prompt 发给 Backend 的耗时/失败 |
| `model_request` / `model_stream` | 模型请求、首 Token、流式输出和 Usage |
| `tool` / `mcp_call` | Tool/MCP 名称、参数、结果、耗时和错误 |
| `context_compact` | Context 压缩发生位置和代价 |
| `session_replay` | Session 恢复与历史回放 |
| `subagent` / `user_input_wait` | 子 Agent 与人工等待 |

业务自带 Trace 时可以传入有效的 W3C `traceparent`；格式无效会被忽略。不要把 Access Token 或完整 Prompt 放进 Trace Attribute。

### 13.5 按症状排查

| 症状 | 优先检查 |
| --- | --- |
| 模型完全没响应 | `prompt` 是否真正 Dispatch、Backend/Sidecar 是否连接、Model/Auth 是否有效 |
| 有 Thinking 没正文 | Model Stream 终态、内容过滤、Cancel/Limit、是否仍在 Tool Loop |
| Tool 不出现 | Mode/`config.tools`、Plugin/MCP 是否启用、Skill Tool 是否被移除 |
| Tool 参数反复失败 | Schema 是否明确、错误 Observation 是否可修正、Handler 是否返回稳定 Error Code |
| Client Tool 找不到 | Renderer 是否仍存活、Provider 是否重复/已注销、Wire Conversation 是否一致 |
| Skill 找不到 | `skillList({cwd})`、开关、Plugin、项目挂载目录、Tool 集中的 `Skill` |
| 知识库无结果 | Resource Link 元数据、Connector 授权、MCP Server/Tool 状态、ACL/Top-K |
| Token 暴涨 | `usageByCategory`、Tool Result 大小、History、重试次数、是否触发 Compact |
| Automation 成功但没通知 | Run 与 Delivery 分开查，检查 Outbox Attempt 和 Dedupe Key |

当前恢复源码能确认日志、Telemetry、OTel Trace、Usage、Session Event、Automation Run、Inbox 和 Delivery Outbox，但没有确认一个公开、统一展示所有 Model Attempt 和 Tool Call 的 Debug 平台。它具备搭建 Debug Console 的数据面，还不是一个可直接依赖的公开控制台 API。

## 14. 常用配置放在哪里

| 需求 | 配置入口 | 生效方式 |
| --- | --- | --- |
| 默认 Tool/权限语义 | `config.mode` | 解析 Runtime，必要时重启 |
| 模型 | `config.model` / `updateSessionConfig` | 通常热更新 |
| Thinking | Model Catalog + Prompt/Automation Metadata | 按模型和本轮生效 |
| Tool 名称覆盖 | `config.tools` | 需要替换 Sidecar |
| Plugin | `sessionSettings.enabledPlugins` | 重新组合能力，必要时重启 |
| 项目 Skill | `projectResources.projectSkills` | 下载并挂载到 Session |
| Connector Skill | `projectResources.connectorSkills` | 下载并挂载到 Session |
| MCP/知识库 | Connector 或 `projectResources.mcpServers` | 生成严格 MCP Config |
| 本地记忆开关 | App Config `disableLocalSkillsMemory` | 后续 Context 组装生效 |
| 权限 | `permissionMode` | 可热更新；具体 Tool 仍可能请求批准 |
| Sandbox | `useSandboxCLI` | Backend 同步 Sandbox 状态 |
| 自动化 | Automation Definition | Scheduler 后续触发 |
| 全局 Agent Loop 重试次数 | 未确认统一配置 | 各层分别治理 |

`addonSelection` 是 WorkBuddy 的内部能力清单和来源记录，包括 Welcome Mode、Interaction Mode、Plugin、Micro Scene、Project Skill 和 MCP 名称。它适合 Adapter/Daemon 编排和诊断，不应成为外部业务的首选配置 API。

### 14.1 重要目录一眼看懂

```text
<cwd>/
└── .workbuddy/
    ├── skills/<skill-name>/SKILL.md       # 项目 Skill
    └── memory/
        ├── MEMORY.md                      # 项目长期记忆
        ├── YYYY-MM-DD.md                  # 项目日记
        └── automations/<id>/memory.md     # 单个 Automation 的记忆

<WORKBUDDY_CONFIG_DIR>/
├── models.json                            # 用户自定义模型
├── settings.json                          # Skill Override 等用户设置
├── skills/<skill-name>/SKILL.md           # 用户 Skill
├── connectors/skills/                     # Connector 带来的 Skill
├── plugins/                               # Plugin/Marketplace 状态
└── project-resources/<projectId>/
    ├── ...                                # 下载后的项目/Connector Skill
    └── mcp.json                           # 项目 MCP 状态，不落 Token
```

这是逻辑结构；实际根目录会受产品配置、平台和环境变量影响。`WORKBUDDY_DATA_FOLDER_NAME` 改项目/用户数据目录名，`WORKBUDDY_CONFIG_DIR` 改用户 Runtime 配置根。Session History、Usage Cache、Automation Definition/Run/Outbox 由 Daemon Storage 管理，不要让业务代码直接改数据库文件。

### 14.2 配置合并和生效顺序

可以把配置理解成从大到小逐层覆盖：

```text
Product/Enterprise Policy
  → 用户设置与本地 Model/MCP/Skill
  → 项目资源与 Plugin
  → Session Desired Config（model/mode/tools/permission...）
  → 本轮 Prompt Metadata / Resource Link
  → Runtime Effective Config
```

安全策略是上限，不是普通覆盖项。后层不能通过设置更宽的 Tool 或 Permission 绕过企业策略、Host Allowlist 或 Sandbox。Session 保存的是 Desired Config，Runtime 使用的是解析后的 Effective Config；因此排查问题时两份都要看。

配置变更分两类：Model、Permission 等有热更新路径；Tools、Prompt 身份、Plugin/部分 MCP 组合改变了 Runtime Fingerprint，需要在空闲点替换 Sidecar。替换 Runtime 不会更换 Session ID，也不会丢 Session History。

### 14.3 “整个项目统一重试 x 次”怎么配

当前 WorkBuddy 没有确认一个能覆盖所有层的 `agentLoop.retryCount = x`。原因不是少一个字段，而是这些“重试”语义不同：

| 层 | 能否安全重试 | 应配置什么 |
| --- | --- | --- |
| 模型 429/5xx/超时 | 通常可以，但每次都计 Token/Credit | Provider/Runner 的 Attempt、退避和 Retry-After |
| Tool 参数格式错误 | 让模型修参数再调用，不是原样重放 | 最大纠错轮数/总 Agent Loop 上限 |
| 只读 Tool 网络失败 | 通常可有限重试 | Tool 自己的 Timeout、Attempt、Backoff |
| 有副作用 Tool | 只有带幂等键且可确认未完成时才重试 | 幂等策略与人工确认 |
| Sidecar/ACP 连接失败 | 发送前可恢复；发送后结果未知不可盲重放 | Reconnect/Soft Reset 策略 |
| Automation 通知失败 | 只重试 Delivery，不重跑 Agent | Outbox Attempt 与 Backoff |

如果要在这个项目上新增统一配置，建议把 `x` 当作默认策略，再拆到各层，而不是所有地方机械执行 `x` 次：

```ts
const retryPolicy = {
  model: { maxAttempts: x, backoff: "exponential" },
  toolCorrection: { maxRounds: x },
  readonlyTool: { maxAttempts: x },
  sidecarReconnect: { maxAttempts: x },
  delivery: { maxAttempts: x },
};
```

这段是建议新增的公开配置形态，不是 WorkBuddy 5.4.2 已有 API。真正接入时应由 Config Resolver 分发，并在 Trace/Usage 中记录 `retryAttempt` 和失败层；否则无法解释重试为什么增加费用或为什么某次没有重放。

### 14.4 配置上线前的检查

- Model ID 必须来自 Catalog 或通过 Custom Model 校验、连通性测试；
- Tool 名称、MCP Server/Tool、Skill Name 都要在实际 Runtime 中可发现；
- Automation 用到的 Connector 要在无人值守环境中可授权；
- Permission/Sandbox 取交集后仍要满足场景需要；
- 修改 Runtime Fingerprint 后，等待当前 Run 结束再检查新 Sidecar；
- 用一个只读 Smoke Test 验证 Event、Thinking、Tool、Usage 和 Trace，再开放副作用 Tool。

## 15. 两种内部使用层级

### 15.1 WorkBuddy 产品主路径

```text
WorkbuddyAgentAdapterNext
  + AgentClient
  + WorkbuddyProvider
  + WorkbuddyDaemonClient
```

它负责 Session 切换、Model/Mode/Expert、内容块、历史投影、权限 UI、Tool Card、Usage、Artifact 和 Daemon 重连。这是 WorkBuddy 内新增产品场景的推荐入口。

### 15.2 通用 AgentClient 包装

```ts
const provider = new WorkbuddyProvider(internalDaemonClient);

const client = new AgentClient({
  provider,
  logger,
  environmentType: "local",
});

const session = await client.sessions.create({ cwd });

session.on("sessionUpdate", renderUpdate);
session.on("permissionRequest", showPermission);
session.on("questionRequest", showQuestion);

await session.prompts.send({
  content: [{ type: "text", text: "分析当前项目" }],
});
```

它更接近 SDK，但 WorkBuddy 产品仍需外层 Adapter 处理产品状态、重连、Usage 和 UI 投影。

## 16. 接入建议和限制

### 16.1 在 WorkBuddy 内新增能力

| 需求 | 推荐接入点 |
| --- | --- |
| 新工作流 | Skill / Expert / Prompt Fragment |
| 新外部数据 | Connector 或 MCP Tool |
| 新确定性动作 | 受控 Tool + Permission + Sandbox |
| 固定项目规则 | Project Skill / Workspace Memory |
| 可搜索知识库 | MCP Search Tool / Connector |
| 跨 Session 偏好 | User/Cloud Memory |
| 定时任务 | Automation Service |
| 只在异常时通知 | 告警 MCP Tool 或确定性通知过滤层 |
| UI 展示 | 订阅 Session Event 并投影到 Store |

不要绕过 SessionManager 直接调用 CLI Provider，也不要为新业务另写一套 `while (model → tool)`。

### 16.2 不能直接当公共 SDK 的原因

- Daemon Client 依赖 WorkBuddy Desktop 的 Electron Main、Preload 和 MessagePort；
- Sidecar 依赖安装包中的 CodeBuddy CLI、Sandbox、Plugin 和私有资源；
- Model Catalog、认证、Credit 和部分 Connector 依赖腾讯服务端；
- 恢复仓库缺少原始 TypeScript 类型、构建发布配置和兼容承诺；
- 内部 RPC Channel 和 Payload 可能随版本变化。

若要在新项目中使用，应参考这些行为设计公开 Runtime Contract，而不是直接依赖恢复文件。对应方案见 `reports/agent-runtime-technical-design.md`。

## 17. 关键源码依据

| 能力 | 恢复源码 |
| --- | --- |
| 产品 Session 创建 | `recovered-source/packages/workbuddy-app/src/adapter/workbuddy-agent-adapter-next.ts.recovered.js:7498` |
| Addon Selection | `recovered-source/packages/workbuddy-app/src/adapter/addons/addon-selection.ts.recovered.js:32` |
| Session Client Channel | `recovered-source/packages/workbuddy-server/src/session/client.ts.recovered.js:10` |
| Session Handler | `recovered-source/packages/workbuddy-server/src/session/handlers.ts.recovered.js:988` |
| SessionManager 配置更新 | `recovered-source/packages/workbuddy-server/src/session/session-manager.ts.recovered.js:4098` |
| Desired/Runtime Config | `recovered-source/packages/workbuddy-server/src/session/runtime-config.ts.recovered.js:144` |
| Runtime Config Resolver | `recovered-source/packages/workbuddy-server/src/session/session-runtime-config-resolver.ts.recovered.js:69` |
| Mode Tool 集 | `recovered-source/packages/workbuddy-server/src/mode/mode-tools-config.ts.recovered.js:9` |
| CLI 参数组装 | `recovered-source/packages/workbuddy-server/src/agent/cli-runtime-args.ts.recovered.js:36` |
| Backend 重配置 | `recovered-source/packages/workbuddy-server/src/agent/codebuddy-code-backend.ts.recovered.js:658` |
| Conversation Client Tool Registry | `recovered-source/packages/workbuddy-core/src/conversations/common/core/model/interaction/client-tools/client-tool-registry.ts.recovered.js:13` |
| Client Tool 注册/注销 | `recovered-source/packages/workbuddy-core/src/conversations/common/core/model/conversation-impl.ts.recovered.js:1273` |
| Renderer Client Tool 回调 | `recovered-source/packages/workbuddy-core/src/conversations/wb/client-tool-rehydrate.ts.recovered.js:11` |
| Skill 管理 RPC | `recovered-source/packages/workbuddy-server/src/skill/handlers.ts.recovered.js:39` |
| Skill 五类扫描源 | `recovered-source/packages/workbuddy-server/src/skill/personal/handlers.ts.recovered.js:186` |
| Skill 解析和元数据 | `recovered-source/packages/workbuddy-server/src/skill/service-shared.ts.recovered.js:256` |
| Skill 安全预检 | `recovered-source/packages/workbuddy-server/src/skill/security/skill-scan-helpers.ts.recovered.js:12` |
| 项目 Skill 下载 | `recovered-source/apps/workbuddy-desktop/src/main/skills/project-resource-loader.ts.recovered.js:47` |
| 项目资源挂载/MCP | `recovered-source/apps/workbuddy-desktop/src/main/skills/project-resource-manager.ts.recovered.js:62` |
| Skill Override | `recovered-source/packages/workbuddy-server/src/skill/skill-overrides.ts.recovered.js:16` |
| 知识文件上传入口 | `recovered-source/packages/workbuddy-app/src/provider/workbuddy-backend-provider.ts.recovered.js:292` |
| 知识文件异步导入 | `recovered-source/packages/workbuddy-server/src/share/facade.ts.recovered.js:138` |
| 知识库 Connector 自动启用 | `recovered-source/packages/agent-ui/src/modules/connector/knowledge-attachment-auto-enable.ts.recovered.js:46` |
| 知识库 Prompt Context | `recovered-source/packages/workbuddy-server/src/prompts/user/sections/additional-data-section.ts.recovered.js:13` |
| Workspace/User Local Memory | `recovered-source/packages/workbuddy-server/src/mode/collectors/memory-collector.ts.recovered.js:42` |
| Cloud User Memory | `recovered-source/packages/workbuddy-server/src/mode/collectors/user-memory-collector.ts.recovered.js:33` |
| 自定义模型校验 | `recovered-source/packages/agent-provider/src/backend/local-custom-model-validation.ts.recovered.js:40` |
| 自定义模型连通性测试 | `recovered-source/packages/workbuddy-server/src/config/local-custom-model-connectivity.ts.recovered.js:19` |
| Usage 投影 | `recovered-source/packages/workbuddy-core/src/conversations/common/core/model/resource-machine/usage-effect-projector.ts.recovered.js:11` |
| Usage 严格校验/分类 | `recovered-source/packages/workbuddy-server/src/session/usage-cache-service.ts.recovered.js:11` |
| Credit 预测 | `recovered-source/packages/workbuddy-core/src/conversations/common/core/model/credit-prediction.ts.recovered.js:12` |
| Trace Span 类型 | `recovered-source/packages/telemetry/src/common/tracing/otel-span-schema.ts.recovered.js:11` |
| Daemon Prompt Span | `recovered-source/packages/workbuddy-server/src/session/session-manager.ts.recovered.js:2127` |
| Local Provider Debug | `recovered-source/packages/agent-provider/src/common/providers/local-agent-provider/local-provider.ts.recovered.js:16` |
| Automation Prompt/Skill/Memory | `recovered-source/packages/workbuddy-server/src/automation/automation-prompt-builder.ts.recovered.js:9` |
| Automation Tool Schema | `recovered-source/packages/workbuddy-server/src/automation/core-runtime/automation-update-tool.ts.recovered.js:140` |
| Automation Delivery Outbox | `recovered-source/packages/workbuddy-server/src/automation/automation-delivery-outbox-worker.ts.recovered.js:13` |
| AgentClient Session API | `recovered-source/packages/agent-provider/src/common/client/session.ts.recovered.js:25` |

## 18. 一页速查

| 我要做什么 | 使用方式 |
| --- | --- |
| 新建任务 | `createSession` → 监听事件 → `notifyListenerReady` → `prompt` |
| 继续历史任务 | 监听事件 → `loadSession` → `notifyListenerReady` → `prompt` |
| 让模型写代码/调用 Shell | 使用 `craft` Mode，配置 Permission/Sandbox |
| 给当前页面临时加 Tool | `conversation.registerClientTools()`；销毁前注销 |
| 接一个长期共享 API | 暴露为 MCP Tool 或 Plugin Tool |
| 给模型一套工作方法 | 新建 `SKILL.md` → 安全导入 → `skillList` 验证 |
| 本轮强制使用 Skill | Prompt 附加 `skill://<name>` |
| 上传知识文件 | `uploadToKnowledge()`，等待异步导入结果 |
| 接企业知识库 | 注册 Connector/MCP → Resource Link 绑定本轮 |
| 记住项目约定 | 更新 `<cwd>/.workbuddy/memory/MEMORY.md` |
| 记住跨项目偏好 | 更新 `~/.workbuddy/MEMORY.md` |
| 回忆历史对话 | 调用 `conversation_search` |
| 定时执行 | 创建 Automation |
| 异常时告警 | Automation + Metrics MCP + 告警 Tool/Outbox |
| 查看 Token/费用 | 消费 `usage_update`，分开读 `used/size`、`_meta.usage`、`cost` |
| 调试单次调用 | 用 Session/Request/Tool Call/Trace ID 串联事件、日志和 Span |
| 停止当前执行 | `cancel(sessionId)` |
| 释放 Runtime 但保留任务 | `destroySession` 或 `archiveSession` |
| 永久删除 | `deleteSession` |
