自己的页面需要展示“正在回答”“正在查询工具”或停止按钮时，可以使用后端 SDK 的运行和事件接口。现成的前端 SDK 已处理聊天协议与展示，无需接入方再拼一套事件客户端。

以下片段中的 session 和 engine 来自[后端教程](/docs/sdk/)。

## 立即取得 runId，再等待结果

```ts
const handle = await session.startRun({
  input: "介绍一下产品的使用流程。",
  requestId: "unique-message-id",
});
console.log(handle.runId); // 可返回给你的客户端，用于查询状态。

try {
  const result = await handle.result;
  console.log(result.outputText);
} catch (error) {
  // 按你的日志策略记录错误码，不直接向浏览器返回内部载荷。
  if (error instanceof AgentEngineError) console.error(error.code);
  else throw error;
}
```

run 是 startRun 后等待 result 的便捷方法。审批、补充输入和工具结果未知会保持等待，HTTP 宿主不应假定每次调用都很快结束。

## 读取状态与取消

```ts
const run = await session.getRun(handle.runId);
console.log(run.state);

// 用户点击停止时：
await session.cancelRun(handle.runId);
```

| state                    | 你可以怎样展示               |
| ------------------------ | ---------------------------- |
| completed                | 已完成                       |
| failed                   | 执行失败，按错误码给出下一步 |
| cancelled                | 已停止                       |
| awaiting_input           | 等待审批或补充信息           |
| awaiting_tool_resolution | 等待宿主核验外部操作结果     |

取消会请求停止后续执行，不能撤销已经发生的业务写入。遇到结果未知的操作，由宿主核验，不要把“停止”显示为“已撤销订单”等不存在的承诺。

## 订阅执行事件

```ts
const subscription = await session.subscribe({
  afterSequence: 0, // 恢复时使用你的消费者已成功处理的 sequence。
  maxBuffer: 1000,
  onEvent(event) {
    console.log(event.sequence, event.type);
    // 在这里把允许展示的字段转换为你自己的 UI 消息。
  },
});
// 消费者退出时：
subscription.close();
```

subscribe 支持从事件序号恢复。持久消费者在成功处理后保存游标；分页补拉可使用 listEvents({ afterSequence, throughSequence, limit })，并固定首屏的 highWaterMark。

只需要临时进度提示时可以用 onEvent，它是有界的实时通知，不能代替可靠事件历史。订阅消费者过慢或抛错会关闭自身订阅，不改变 Run 的结果。

自己实现流式 UI 时应按消息和尝试标识处理草稿更新、撤销与提交，不能把重试前后的所有文本增量直接拼接为最终回答。

## 断线后恢复界面

游标过期时先调用 getSnapshot()，应用快照的完整 drafts 与运行状态，再从 snapshotSequence 补拉事件。不要用缺失的旧 delta 猜测当前正文。

后端 SDK 的事件是服务端接口；浏览器需要你提供受限 HTTP/SSE 等传输。如果使用 chat-ui，它通过 chat-server 快照轮询同步，不会自动变成 SSE 客户端。

## 查询模型用量

```ts
const usage = await engine.usage.getRun(handle.runId);
console.log(usage);
const sessionUsage = await engine.usage.getSession(session.id);
console.log(sessionUsage);
```

展示已知用量时同时显示 complete 和 costComplete。未知不是 0；Thinking 属于输出的一部分，不能再重复相加。配置费率计算的是估算费用，不是供应商实际账单。

重试、摘要和输出修复都可能产生用量，迟到的统计会修订对应记录。需要集中排查时，继续[接入 Debug](/docs/debug/)。
