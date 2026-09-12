import { createBackend } from "./backend.js";
import type { BindingContract, JsonObject } from "@agent-runtime/sdk";
const principal = { tenantId: "demo", subjectId: "memory-user" };
// 可运行的只读偏好示例。生产实现应查询自己的持久记忆服务。
const preferences: BindingContract = {
  version: "1",
  sideEffect: "read",
  methods: { read: "read" },
  async execute(input, context) {
    const value = input as JsonObject;
    const namespace = value.namespace as JsonObject;
    if (
      value.method !== "read" ||
      namespace.tenantId !== context.principal.tenantId ||
      namespace.subjectId !== context.principal.subjectId
    )
      throw new Error("Unauthorized memory");
    context.signal.throwIfAborted();
    return {
      items: [
        {
          id: "language",
          content: "用户偏好简体中文，回答简短。",
          version: "1",
        },
      ],
    };
  },
};
const { engine, config } = await createBackend({
  principal,
  bindings: { preferences },
});
try {
  const session = await engine.createSession({
    config: {
      ...config,
      memory: {
        stores: [
          {
            id: "preferences",
            adapter: { type: "binding", bindingKey: "preferences" },
            namespace: { ...principal, agentId: "product-help" },
            read: { strategy: "semantic", topK: 3, maxTokens: 1000 },
          },
        ],
      },
    },
  });
  console.log(
    (await session.run({ input: "请按我的偏好介绍你的用途。" })).outputText,
  );
  console.log(
    (await session.listEvents()).events.filter((event) =>
      event.type.startsWith("memory."),
    ),
  );
} finally {
  await engine.close();
}
