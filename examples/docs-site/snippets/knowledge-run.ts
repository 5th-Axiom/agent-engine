import { defineKnowledgeBase, type BindingContract } from "@agent-runtime/sdk";
import { createBackend } from "./backend.js";
// 独立可运行的演示语料。接入时替换为按 principal 过滤的真实检索服务。
const search: BindingContract = {
  version: "1",
  sideEffect: "read",
  async execute(_input, context) {
    context.signal.throwIfAborted();
    return {
      items: [
        {
          documentId: "demo-manual",
          chunkId: "session",
          version: "1",
          title: "会话",
          content: "创建会话使用 createSession；继续会话使用 loadSession。",
        },
      ],
    };
  },
};
const manual = defineKnowledgeBase({
  id: "manual",
  name: "产品手册",
  description: "查询产品接入方法。",
  retriever: { type: "binding", bindingKey: "manual.search" },
  querySchema: { type: "object" },
  resultSchema: { type: "object" },
  defaults: { topK: 3, maxTokens: 2000 },
  citation: { required: true, outputPointer: "/citations" },
});
const { engine, config } = await createBackend({
  principal: { tenantId: "demo", subjectId: "knowledge-user" },
  bindings: { "manual.search": search },
});
try {
  const session = await engine.createSession({
    config: {
      ...config,
      knowledgeBases: [manual],
      instructions: {
        text: "先检索 manual，再根据资料回答。引用检索结果中的 sourceId。",
      },
    },
  });
  const result = await session.run({
    input: "如何恢复会话？请查手册。",
    output: {
      mode: "prompt-json",
      schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: { sourceId: { type: "string" } },
              required: ["sourceId"],
              additionalProperties: false,
            },
          },
        },
        required: ["answer", "citations"],
        additionalProperties: false,
      },
    },
  });
  console.log(result.output, result.citations);
} finally {
  await engine.close();
}
