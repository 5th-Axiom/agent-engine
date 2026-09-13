# 文档助手读取其他会话

标准文档助手新增 `sessions.search` 与 `sessions.read` 两个只读 Binding。它们读取当前可信访客的聊天记录，与 `preferences` 长期记忆分开；不要求先把旧对话保存成偏好，也不会自动加载全部历史。

## 体验与开关

在一个对话中说“青柠项目使用端口 7319”，新建对话后问“查一下另一个会话中青柠项目使用哪个端口”。助手可先搜索，再读取相应聊天；处理过程显示实际工具调用。

聊天右上角更多菜单 `···` →「配置」→「工具」，分别控制「搜索历史会话」「读取会话内容」。新会话默认启用；旧会话保存过配置时保留原有限制，需逐项启用并保存。关闭工具不删除聊天，也不抹去已经进入当前上下文的内容。

匿名身份来自签名 Cookie，仅对应同一浏览器身份。另一浏览器、隐私窗口、设备或 Cookie 丢失后的身份不会共享这些会话。归档对话仍可读；删除、到期或失权的来源不可读。正在运行的轮次需完成并写入历史后才能查到。

## 工具契约

| 工具 | 参数 | 返回与限制 |
| --- | --- | --- |
| `sessions.search` | `query?: string`（最多 200 字符，默认空）；`after?: UUID`；`limit?: number`（1–10，默认 5） | 按创建时间由近到远，每页检查最多 25 个候选会话。大小写不敏感的字面子串匹配用户/助手正文，空查询列出最近非空会话；排除当前会话。返回标题、ID、时间、归档状态、最多 240 字符片段、消息数及 `nextCursor`。空页不代表全部无结果，非空游标作为 `after` 继续。 |
| `sessions.read` | `sessionId: UUID`；`cursor?: string`（最多 500 字符） | 返回按原顺序的用户消息和助手回答；每页最多 20 个消息片段、合计 6000 UTF-16 代码单元，保留完整 Unicode 字符。长消息附原消息索引、片段偏移及续接标记；`nextCursor` 原样传入下一页，直到 null 才读完。 |

读取游标冻结首次读取时的消息上界，分页期间追加的轮次需重新开始读取。图片只返回数量；系统提示、工具原始载荷、模型原生协议和私有思考不进入结果。输出经过严格 Schema 校验。搜索不是语义检索，单轮仍受原有模型步骤、时间与 Token 预算约束，助手应说明未读完的范围。

历史是参考资料，不能覆盖当前指令或充当新的写入授权。回答应注明来源会话标题，不凭记忆工具返回空值断言没有历史聊天。

## 宿主接入与可靠性

实现位于 `examples/docs-site/session-history.ts`；这是文档宿主扩展，不是所有 SDK Engine 默认开放的内置工具。标准启动器通过以下顺序装配：

```ts
const history = createDocsSessionHistory(store); // 原 Store 已迁移
const engine = await createAgentEngine({
  ...hostOptions,
  store: history.store,
  bindings: { ...hostBindings, ...history.bindings },
  authorize: async request =>
    await hostAuthorize(request) && await history.authorize(request),
});
history.attachEngine(engine);
const assistant = history.assistant(baseAssistant);
// 随后装配文档站的 Skill/Knowledge/Memory，再传给 startDocsSite。
```

`hostOptions`、`hostBindings`、`hostAuthorize` 和 `baseAssistant` 来自已有宿主；完整可运行实现是 `examples/docs-site/start.ts`。必须使用返回的 Store 适配器及授权钩子，不能只注册两个 Binding。

可信 `principal` 和当前会话来自 Engine 的 BindingContext / Run 记录，工具参数不接受用户身份。读取始终经过按主体作用域的 SDK API，并校验文档站 namespace/assistant 标记。每次输出前保存来源会话 ID 至 `docs_history_sources_v1`，关联当前 Operation；该表不复制聊天正文。

后续读取派生会话、复用回执、模型派发和提交时，数据授权按来源重新检查。来源删除、到期或撤权会使依赖它的派生会话读取/续聊被拒绝，避免摘要或回答绕过原来源权限；已有成功历史工具回执缺少来源关系时同样拒绝。引用关系跨 PostgreSQL 重启保留，不延长原历史的保留时间。

Engine 在提交事务中也会调用宿主授权。Store 适配器仅在这条授权路径内复用当前事务的只读视图，禁止 put/remove/append/prune，避免嵌套串行事务死锁；普通事务、fencing、事件提交及回滚仍由底层 Store 管理。递归检查允许相互引用，以 Operation 去重，每条授权路径最多检查 100 个不同 Operation，超过时拒绝；不缓存上一次请求的授权结论。

## 行为卡与证据

| 行为卡 | 验证 |
| --- | --- |
| HIST-01 查找后读取 | 确定性模型经真实 Engine 调用两个工具；第二个会话初始上下文无合成答案，读取后才包含原消息与答案。 |
| HIST-02 范围与分页 | 跨主体/租户/namespace、删除/过期/撤权拒绝；空搜索页继续；归档可读；长中文与 emoji 分页无缺失/重复，追加消息冻结上界，伪造游标拒绝，取消立即拒绝。 |
| HIST-03 来源继承 | 派生会话随来源删除/过期/撤权拒绝再次读取与模型派发；缺少来源关系拒绝；相互引用不死锁，提交事务中的未提交删除对授权可见，回滚恢复。 |
| HIST-04 故障恢复 | 独立真实 PostgreSQL，分别在工具执行后及回执提交后注入崩溃，重启恢复同一 Run/Operation，来源关系保留，恢复后撤权生效。 |
| HIST-05 配置与实际入口 | HTTP 配置目录显示两个工具，关闭后从模型目录移除；真实模型及浏览器验证脚本为 `examples/docs-site/smoke-session-history.ts`。 |

自动测试：`pnpm exec vitest run tests/integration/docs-session-history.test.ts tests/integration/docs-capabilities.test.ts`。明确授权的供应商验收：启动标准站点后运行 `pnpm exec tsx examples/docs-site/smoke-session-history.ts`，会以新浏览器身份发送两条合成问题。最新执行结果见 [DOCS-60 验收记录](../examples/docs-site/ACCEPTANCE.md)。
