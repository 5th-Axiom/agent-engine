工具让 Agent 调用业务功能；Skill 描述工作方法；知识库提供可检索资料；Memory 保存获准的跨会话信息。它们都在后端显式配置，不需要修改前端聊天界面。

本文示例是添加到现有 Engine / Session 的片段。业务检索和存储方法由接入方实现，SDK 不附带知识库管理后台或通用业务数据库。

## 简短规则：直接写 instructions

产品规则只有几段时，先放进会话配置：

```ts
const session = await engine.createSession({
  config: {
    ...config,
    instructions: {
      text: "你是产品助手。优先回答产品使用问题，也允许普通聊天。不了解的产品功能请说明无法确认。",
    },
  },
});
```

instructions 控制助手目标和表达方式，不负责权限验证，也不会自动读取你的网站。规则变化时更新后续 Session，已有会话按[配置更新](/docs/sessions/)处理。

## Skill：复用一套处理步骤

下面沿用[库存工具教程](/docs/tools/)的 inventoryTool 和已经注册的 Binding：

```ts
import { defineSkill } from "@agent-runtime/sdk";

const inventorySkill = defineSkill({
  id: "inventory-help",
  name: "库存答疑",
  description: "查询商品库存并解释结果。",
  instructions:
    "先确认商品编号，再查询库存。只根据查询结果回答，缺少编号时先询问用户。",
  allowedTools: ["inventory.read"],
});
const session = await engine.createSession({
  config: {
    ...config,
    tools: [inventoryTool],
    skills: [inventorySkill],
  },
});
```

allowedTools 只能引用 Session 已声明的工具。Skill 可以规定“怎样做”，不能绕过工具授权或让模型获得不存在的能力。

## 知识库：查询产品文档

文档较多或经常变化时，将你的搜索服务接成 Retriever。先在 Engine 的 bindings 注册 manual.search.v1；它是只读 Binding，返回你自己的资料片段：

```ts
const manualBinding = {
  version: "1",
  sideEffect: "read" as const,
  execute: async () => ({
    items: [
      {
        documentId: "product-manual",
        chunkId: "example-only",
        version: "1",
        title: "示例资料",
        content: "这是演示片段，接入时替换为真实文档检索结果。",
      },
    ],
  }),
};
// 创建 Engine 时：bindings: { "manual.search.v1": manualBinding }
```

生产实现应根据传入查询、context.principal 和 context.signal 调用你的搜索服务，过滤该用户不可见或过期的文档，再返回 items。不要直接将示例固定资料当成检索结果。

在 Session 声明该知识库：

```ts
import { defineKnowledgeBase } from "@agent-runtime/sdk";

const manual = defineKnowledgeBase({
  id: "manual",
  name: "产品文档",
  description: "检索产品接入方法与使用规则。",
  retriever: { type: "binding", bindingKey: "manual.search.v1" },
  querySchema: { type: "object" },
  resultSchema: { type: "object" },
  defaults: { topK: 3, maxTokens: 2000 },
  citation: { required: true, outputPointer: "/citations" },
});
const session = await engine.createSession({
  config: {
    ...config,
    instructions: {
      text: "项目问题先检索产品文档，再依据资料回答并给出引用。",
    },
    knowledgeBases: [manual],
  },
});
```

要求强制引用时，本次 Run 还需要声明对应的结构化输出：

```ts
const result = await session.run({
  input: "请查阅文档，解释接入步骤并注明来源。",
  output: {
    mode: "prompt-json",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        citations: {
          type: "array",
          items: {
            type: "object",
            properties: { sourceId: { type: "string" } },
            required: ["sourceId"],
          },
        },
      },
      required: ["answer", "citations"],
    },
  },
});
console.log(result.output);
```

sourceId 由引擎为已取回资料分配，不能让模型随意编造。outputPointer 与结果中 citations 字段的路径要对应。自定义 UI 可读取结构化 output 展示引用；现成 IM 当前按纯文本展示。

## Memory：读取跨会话偏好

同一 Session 的聊天历史已经由引擎保存，不需要 Memory。只有需要跨 Session 记住已获授权的偏好时，再增加记忆存储：

```ts
const session = await engine.createSession({
  config: {
    ...config,
    memory: {
      stores: [
        {
          id: "preferences",
          adapter: { type: "binding", bindingKey: "preferences.read.v1" },
          namespace: {
            tenantId: principal.tenantId,
            subjectId: principal.subjectId,
            agentId: "product-assistant",
          },
          read: { strategy: "semantic", topK: 3, maxTokens: 1000 },
        },
      ],
    },
  },
});
```

principal 是当前已验证主体。Engine 需先注册同名只读 Binding；读取 DTO 带 method: "read" 和 namespace，返回 { items: [{ id, content, version }] }。宿主按 namespace 隔离查询，SDK 再应用授权、有效期、去重与读取上限。

这个配置只读取，不自动写入。如果需要写入，还需 write 策略、可信业务幂等键、Policy 审批，以及后端真实实现的版本比较与原子写入。精确约定见[接口参考](/docs/api/)。

## 本站助手采用什么方式

本站把公开手册接成只读 docs.search 工具，并要求助手在回答项目问题前先检索。阅读资料是工具能力，回答风格是 instructions，两者配合工作；普通聊天可以跳过检索。

你可以复用这个思路，将检索实现替换为自己的公开文档或已授权知识库。前端的欢迎文案可以提示“询问使用规则”，但可靠的项目知识需要在后端接入。
