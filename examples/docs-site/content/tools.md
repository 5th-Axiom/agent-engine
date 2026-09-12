**目标：** 用户问“商品 A 还有多少库存？”时，Agent 调用你已有的库存服务，并依据返回值回答。SDK 不会自动知道业务 API，需要你显式提供工具。

接入分两处：Tool 定义告诉模型有哪些参数和返回值；Binding 把工具连接到服务器上的真实业务方法。

## 前置条件

完成[环境准备](/docs/installation/)，导出 [backend 示例](/docs/integration/)。本页脚本与 settings.ts、backend.ts 同目录；示例库存是显式标记的本地数据。

## 定义、注册、调用

{{code:tool-run.ts}}

```sh
node --env-file=.env --import tsx tool-run.ts
```

defineBoundTool 从结构化 Zod Schema 推导 execute 参数类型，并生成 definition 与 bindings。普通工具仍可使用 defineTool + BindingContract，既有 API 保留。不要将 execute 函数放进 Session 配置。

**注册 Binding 不等于自动开放工具。** Session 仍需列出 definition，宿主仍需允许调用。型别推导不替代运行时输入和输出验证。

## 确认接入成功

看到库存回答后检查 operations：应包含 inventory.read，executionStatus 为 succeeded，validationStatus 为 valid。如果模型没有调用工具，检查提示和模型工具能力；若输出验证失败，修正业务返回值，不能将模型声称“查过了”当成证据。

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
