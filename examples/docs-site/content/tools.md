**目标：** 用户问“商品 A 还有多少库存？”时，Agent 调用你已有的库存服务，并依据返回值回答。SDK 不会自动知道业务 API，需要你显式提供工具。

接入分两处：Tool 定义告诉模型有哪些参数和返回值；Binding 把工具连接到服务器上的真实业务方法。

## 1. 定义工具与 Binding

保存为 tools.ts。readInventory 由你的业务实现，传入的 principal 来自引擎的可信身份，signal 用于请求取消：

{{code:tools.ts}}

输入和输出采用 JSON Schema。引擎验证输入后再调用 Binding；输出仍需满足 outputSchema。例子使用非负整数库存，你的业务若允许小数或其他状态，应同时修改契约与实际返回格式。

## 2. 注册并提供给会话

下面沿用[后端教程](/docs/sdk/)的 createBackend。readInventory 和 authorizeAgentRequest 是你的业务方法，并非 SDK 导出：

```ts
import { createBackend } from "./backend.js";
import { inventoryTool, inventoryBinding } from "./tools.js";
import { readInventory, authorizeAgentRequest } from "./business.js";

const { engine, config } = await createBackend({
  principal: { tenantId: "my-app", subjectId: "inventory-task" },
  authorize: authorizeAgentRequest,
  bindings: { "inventory.read.v1": inventoryBinding(readInventory) },
});
const session = await engine.createSession({
  config: {
    ...config,
    instructions: { text: "库存问题必须调用 inventory.read，不要猜测库存。" },
    tools: [inventoryTool],
  },
});
const result = await session.run({
  input: "商品 A 还有多少库存？",
  requestId: "unique-inventory-question-id",
});
console.log(result.outputText);
```

**注册 Binding 不等于自动开放工具。** Engine 需要有对应实现，Session 的 tools 需要明确列出定义，宿主权限还需要允许当前用户调用。只在提示词里写工具名称不够。

## 3. 判断工具是否真的调用

在业务函数或[Debug](/docs/debug/)中确认 inventory.read 的执行记录，并核对实际输入、返回值和权限结果。模型说“我查过了”不代表工具已执行。

单测时可以注入一个返回固定库存的 readInventory；接入业务时替换为真实查询。不要将固定数字当成生产库存，也不要把当前用户身份从模型参数中取出。

## 写操作需要额外契约

查库存是只读操作。创建订单、修改数据等写操作不能只把 sideEffect 改成 write：

- 宿主 Binding 声明稳定的写 namespace 与版本。
- 工具配置提供基于可信业务键的幂等约定，并由宿主校验权限。
- 业务服务真正实现幂等和执行回执；需要审批时由宿主处理等待输入。
- 外部结果未知时进入 awaiting_tool_resolution，先核验实际结果，不要自动重跑。

执行成功但返回格式错误，也不能成为再次写入的理由。精确的审批和结果核验接口见[SDK 执行约定](/docs/api/)。

## HTTP / MCP 工具

当前也支持 HTTP 和 MCP 执行器。它们需要网络目标授权及宿主 remoteContracts 风险、版本约定；写工具还需要远程幂等字段和确认回执。不要把任意用户 URL 直接变成工具。

从自己的 Node 业务方法起步时，Binding 通常最容易接入。需要远程执行时，再根据[接口参考](/docs/api/)扩展。
