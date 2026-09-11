import {
  defineTool,
  type BindingContract,
  type JsonObject,
  type VerifiedPrincipal,
} from "@agent-runtime/sdk";

export const inventoryTool = defineTool({
  name: "inventory.read",
  description: "根据商品编号查询当前用户有权查看的库存。",
  inputSchema: {
    type: "object",
    properties: { sku: { type: "string", minLength: 1 } },
    required: ["sku"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { available: { type: "integer", minimum: 0 } },
    required: ["available"],
    additionalProperties: false,
  },
  execution: {
    type: "binding",
    bindingKey: "inventory.read.v1",
    sideEffect: "read",
  },
});

// readInventory 由你的业务服务实现，并按 principal 校验数据权限。
export function inventoryBinding(
  readInventory: (
    sku: string,
    principal: VerifiedPrincipal,
    signal: AbortSignal,
  ) => Promise<{ available: number }>,
): BindingContract {
  return {
    version: "1",
    sideEffect: "read",
    async execute(input, context) {
      const { sku } = input as JsonObject;
      return readInventory(String(sku), context.principal, context.signal);
    },
  };
}
