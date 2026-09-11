一段连续对话是 Session，用户发出一条消息后的一次执行是 Run。后端 SDK 保存会话历史，宿主保存 sessionId 与自己业务对象的关联。

本文片段沿用[后端接入教程](/docs/sdk/)中的 engine、config 和 session；requestId 应由业务为每个新操作生成，并在网络重试时保留。

## 新建和继续对话

```ts
const session = await engine.createSession({
  config,
  requestId: "create-conversation-unique-id",
});
const result = await session.run({
  input: "帮我写一句产品介绍。",
  requestId: "message-unique-id-1",
});

// 保存 session.id。之后从已验证用户作用域加载：
const sameSession = await engine.loadSession(session.id);
const followUp = await sameSession.run({
  input: "再简短一点。",
  requestId: "message-unique-id-2",
});
console.log(followUp.outputText);
```

示例中的字符串表示由业务生成的唯一值，不要复制为所有用户公用的固定 ID。跨请求继续同一段对话时使用原 sessionId；希望开始新的话题和历史时创建新 Session。

createSession 不生成回答。loadSession 不需要重新上传历史，也不会自动发送模型请求。对外接口须从已验证的 engine.forPrincipal(principal) 加载会话，不能只凭调用方提交了一个 ID 就认为有权限。

## 新消息和重试怎样区分

| 情况                         | requestId 怎么用             | 结果                      |
| ---------------------------- | ---------------------------- | ------------------------- |
| 用户发送一个新问题           | 生成新的值                   | 创建一个新 Run            |
| 网络断开，不知道上次是否受理 | 保留原值及完全相同的请求内容 | 复用原 Run                |
| 想修改问题后再发             | 使用新的值                   | 作为新消息处理            |
| 复用旧值却换了输入或配置     | 不应这样做                   | 返回 RUN_REQUEST_CONFLICT |

同一 Session 内的输入、context、输出契约和 overrides 都参与重试判等。metadata 仅作关联信息，不能用于权限判断。现成前端 SDK 已处理未确认发送的重试；自己写 UI 时要保留这个行为。

## 更新助手的规则或能力

```ts
const current = await session.getConfig();
await session.replaceConfig({
  ifVersion: current.version,
  config: {
    ...current.value,
    instructions: { text: "你是产品助手，先解释操作步骤，再给一个简短例子。" },
  },
});
```

ifVersion 避免覆盖别人刚更新的配置。冲突时先重新读取并合并你的业务修改，不要盲目重试旧版本。新配置用于后续运行，已经受理的 Run 使用自己的冻结配置。

工具、技能等列表是整体替换，不是自动追加；增加工具时保留需要的原列表。getConfig 查看当前声明，getEffectiveConfig({ runId }) 查看指定运行实际使用的配置、默认值及来源。

## 只调整这一次调用

```ts
const answer = await session.run({
  input: "请简短回答。",
  requestId: "another-unique-message-id",
  overrides: {
    model: "primary",
    tools: [],
    loop: { maxSteps: 2 },
  },
});
```

overrides 只能选择已经声明的模型、缩小工具集合和收紧 Loop 限额，不能临时增加未授权的工具或模型。需要增添能力时，先更新 Session 配置并让宿主授权。

## 关闭服务与保留历史

engine.close() 用在服务退出阶段，它关闭当前进程资源；不会删除数据库历史，也不等于撤销已发生的外部动作。保留数据库、身份与协议保护 Key，重启后才有条件恢复会话和运行。

想停止某次生成，使用[运行取消接口](/docs/events/)，而不是通过关闭 Engine 模拟取消。
