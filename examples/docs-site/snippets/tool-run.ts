import { createBackend } from "./backend.js";
import { defineBoundTool } from "@agent-runtime/sdk";
import { z } from "zod";

// 演示库存表；接业务时将 execute 内的查询替换为已授权的数据服务。
const stock = new Map([
  ["A", 24],
  ["B", 0],
]);
const inventory = defineBoundTool({
  name: "inventory.read",
  description: "查询当前用户可见的商品库存。",
  version: "1",
  sideEffect: "read",
  inputSchema: z.strictObject({ sku: z.string().min(1) }),
  outputSchema: z.strictObject({ available: z.number().int().nonnegative() }),
  async execute({ sku }, { principal, signal }) {
    signal.throwIfAborted();
    if (principal.tenantId !== "demo")
      throw new Error("Unauthorized inventory");
    return { available: stock.get(sku) ?? 0 };
  },
});
const { engine, config } = await createBackend({
  principal: { tenantId: "demo", subjectId: "inventory-user" },
  bindings: inventory.bindings,
});
try {
  const session = await engine.createSession({
    config: {
      ...config,
      tools: [inventory.definition],
      instructions: { text: "库存问题必须查询 inventory.read，根据结果回答。" },
    },
  });
  const result = await session.run({ input: "查询商品 A 的库存。" });
  console.log(result.outputText);
  console.log((await engine.inspectSession(session.id)).operations);
} finally {
  await engine.close();
}
