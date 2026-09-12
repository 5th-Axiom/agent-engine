# 可信页面上下文

Chat 协议可选传递不透明 `contextRef`，不接受浏览器任意 `context` JSON。宿主解析引用后将可信 `JsonObject` 交给 `RunInput.context`，工具从 `BindingContext.context` 读取；不会自动注入模型提示词。

```ts
const chat = mountChatWidget({ transport });
chat.controller.setContextRef(scope.scopeId); // scope 由宿主认证接口发出
// 此操作不发送问题、不执行工具。用户下一次 send 才带上引用。
```

`setContextRef(undefined)` 清除下一轮引用。controller 在创建请求时捕获引用；丢失受理响应后 `retrySend()` 保留原 requestId 和原 contextRef，页面切换只改变下一轮。引用只允许 1–200 个字母、数字、下划线、横线。

服务端：

```ts
createChatHandler({
  namespace: 'my-host',
  allowedOrigins: ['https://example.com'],
  resolveContext: authenticateAndScopeEngine,
  resolveRunContext: async ({ context, sessionId, requestId, contextRef }) => {
    // 宿主必须持久保存第一次解析，键包含身份、sessionId、requestId。
    // 即使这次不传 contextRef，重投仍需复用原记录。
    const admitted = await admissions.resolveOnce({
      principal: context.engine.principal,
      sessionId, requestId, contextRef,
    });
    await authorizeCurrentScope(admitted);
    return { scopeId: admitted.scopeId, environmentId: admitted.environmentId };
  },
});
```

`resolveRunContext` 在 session 归属校验后调用，配置后每次发送都会调用，包括无引用的旧客户端。**chat-server 不替宿主实现持久范围仓库**，也不承诺回调只执行一次；宿主必须处理并发重投、崩溃恢复、撤权与有效期。相对时间在首次受理时转换为固定窗口。没有 resolver 的旧宿主维持原有行为；收到 contextRef 时返回 `CHAT_CONTEXT_UNAVAILABLE`，不会静默丢弃。

在 `createChatPage`、`mountChatPage` 或 `mountChatWidget` 的 options 中传 `contextBar: HTMLElement` 可在页头下方加入宿主范围控件。DOM、事件与异步请求生命周期归宿主所有。通用 Chat UI 不理解 Alice 表结构、数据库或管理员规则。

需要模型看到当前页面对象时，提供受控 `diagnosis.context` 一类读取工具或安全摘要，禁止把凭据放入 Run.context。宿主的 `authorize(action:'data', resource:sessionId)` 会在模型历史读取/分发前重检；可据此拒绝已撤销数据策略的历史上下文。工具执行和独立证据 API 仍需分别重新授权。

已验证：`tests/contract/chat-context.test.ts` 冻结请求引用；`tests/integration/chat-context.test.ts` 验证所属 session 授权先于解析、引用只进入 BindingContext、无 resolver 拒绝引用。Alice 宿主的真实 PostgreSQL 测试另验证持久 admission、并发重投、进程恢复与范围撤销。
