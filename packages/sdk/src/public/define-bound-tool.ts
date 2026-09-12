import { z } from "zod";
import { defineTool, type ToolDefinition } from "../config/schema.js";
import { json } from "../protocol/json.js";
import type { BindingContext, BindingContract } from "./types.js";

/** Define the serializable contract and its versioned host implementation together.
 * Register `bindings` on the Engine and explicitly enable `definition` in a Session.
 */
export function defineBoundTool<
  I extends z.ZodType,
  O extends z.ZodType,
>(input: {
  name: string;
  description: string;
  version: string;
  inputSchema: I;
  outputSchema: O;
  sideEffect: "read" | "write";
  permission?: ToolDefinition["permission"];
  bindingKey?: string;
  timeoutMs?: number;
  idempotency?: Extract<
    ToolDefinition["execution"],
    { type: "binding" }
  >["idempotency"];
  reconciliation?: ToolDefinition["reconciliation"];
  execute: (
    value: z.output<I>,
    context: BindingContext,
  ) => Promise<z.output<O>>;
}): { definition: ToolDefinition; bindings: Record<string, BindingContract> } {
  const bindingKey = input.bindingKey ?? input.name;
  const definition = defineTool({
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    execution: {
      type: "binding",
      bindingKey,
      sideEffect: input.sideEffect,
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.idempotency ? { idempotency: input.idempotency } : {}),
    },
    ...(input.permission ? { permission: input.permission } : {}),
    ...(input.reconciliation ? { reconciliation: input.reconciliation } : {}),
  });
  return {
    definition,
    bindings: {
      [bindingKey]: {
        version: input.version,
        sideEffect: input.sideEffect,
        ...(input.idempotency
          ? { namespace: input.idempotency.namespace }
          : {}),
        execute: async (value, context) =>
          json(await input.execute(input.inputSchema.parse(value), context)),
      },
    },
  };
}
