import { z } from "zod";
import {
  AgentEngineError,
  createAgentEngine,
  parseConfig,
  prometheusExporter,
  type AgentEvent,
  type BindingContract,
  type JsonObject,
  type JsonValue,
  type ModelRequest,
  type ModelStreamEvent,
  type OutputConfig,
} from "@agent-runtime/sdk";
import {
  MemoryStore,
  scriptedModel,
  finalText,
  toolCall,
} from "@agent-runtime/testing";

export const experiments = [
  {
    id: "output",
    title: "结构化输出与修复",
    description: "第一次输出故意不符合 schema，观察修复预算是否生效。",
    option: "允许一次输出修复",
    doc: "sdk",
  },
  {
    id: "native",
    title: "模型原生结构化输出",
    description: "检查输出 schema 是否送给支持原生结构化输出的适配器。",
    doc: "sdk",
  },
  {
    id: "citation",
    title: "引用核验",
    description: "先返回无效来源 ID，再从真实检索结果中修复引用。",
    option: "允许一次引用修复",
    doc: "knowledge",
  },
  {
    id: "retry",
    title: "模型重试",
    description: "注入一次模型超时，核对 Attempt 数量和重试事件。",
    option: "允许一次模型重试",
    doc: "rules",
  },
  {
    id: "fallback",
    title: "备用模型",
    description: "主模型不可用时，观察路由是否切换到备用模型。",
    option: "启用备用模型",
    doc: "models",
  },
  {
    id: "tool-input",
    title: "工具参数修复",
    description: "传入不合法的参数，验证修复请求和工具最终收到的参数。",
    option: "允许一次参数修复",
    doc: "tools",
  },
  {
    id: "tool-retry",
    title: "只读工具重试",
    description: "只读工具首次超时，核对实际调用次数。",
    option: "允许一次工具重试",
    doc: "tools",
  },
  {
    id: "write",
    title: "写操作结果核验",
    description: "模拟写入后响应丢失；使用回执核验结果，验证没有重复写入。",
    doc: "rules",
  },
  {
    id: "budget",
    title: "Token 预算",
    description: "将预算设得低于一次请求所需，验证模型调用前的拦截。",
    option: "启用严格预算",
    doc: "sdk",
  },
  {
    id: "compaction",
    title: "上下文整理",
    description: "用合成长历史触发摘要，核对原始历史是否保留。",
    option: "允许上下文整理",
    doc: "sdk",
  },
  {
    id: "config",
    title: "配置版本与冻结",
    description: "更新配置、尝试旧版本写入，再比较两轮运行各自的配置。",
    doc: "sdk",
  },
  {
    id: "events",
    title: "事件与可观测性",
    description:
      "分页读取事件，并检查订阅、Usage、Trace、日志和 Prometheus 指标。",
    doc: "debug",
  },
  {
    id: "lifecycle",
    title: "归档与删除",
    description: "归档会话后尝试运行，取消归档后继续，最后删除实验会话。",
    doc: "sessions",
  },
] as const;
export const experimentInput = z.strictObject({
  id: z.enum(experiments.map((v) => v.id) as [string, ...string[]]),
  enabled: z.boolean().default(true),
  requestId: z.uuid(),
});
export type ExperimentInput = z.infer<typeof experimentInput>;
const failed = (
  code: "MODEL_TIMEOUT" | "MODEL_PROVIDER_ERROR",
): ModelStreamEvent[] => [
  {
    type: "failed",
    error: new AgentEngineError(
      code,
      "Synthetic experiment failure",
      true,
      "safe",
    ),
  },
];
const objectSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};
const jsonValue = (v: unknown): JsonValue =>
  JSON.parse(JSON.stringify(v ?? null));
const delay = () => new Promise((r) => setTimeout(r, 5));

/** Each experiment uses an isolated real Engine with a deterministic model and synthetic data.
 * It never makes a provider request or writes into the visitor's conversations/memory. */
export async function runDocsExperiment(input: ExperimentInput) {
  const { id, enabled } = experimentInput.parse(input),
    checks: Array<{ label: string; passed: boolean; actual: JsonValue }> = [];
  const check = (label: string, passed: boolean, actual: unknown) =>
    checks.push({ label, passed, actual: jsonValue(actual) });
  const store = new MemoryStore(),
    spans: unknown[] = [],
    logs: unknown[] = [],
    delivered: string[] = [],
    metrics = prometheusExporter();
  const script: Parameters<typeof scriptedModel>[0] = [];
  let reads = 0,
    writes = 0,
    received: JsonValue = null;
  const bindings: Record<string, BindingContract> = {
    read: {
      version: "1",
      sideEffect: "read",
      execute: async (v) => {
        received = v;
        reads++;
        if (id === "tool-retry" && reads === 1)
          throw new AgentEngineError("TOOL_TIMEOUT", "Synthetic timeout", true);
        return { answer: "工具已执行" };
      },
    },
    policy: { version: "1", sideEffect: "read", execute: async () => "allow" },
    key: {
      version: "1",
      sideEffect: "read",
      execute: async () => "synthetic-record",
    },
    write: {
      version: "1",
      sideEffect: "write",
      namespace: "docs-lab-write",
      execute: async () => {
        writes++;
        throw new AgentEngineError("TOOL_TIMEOUT");
      },
    },
    reconcile: {
      version: "1",
      sideEffect: "read",
      execute: async () => ({
        outcome: "succeeded",
        evidenceRef: "synthetic-receipt",
        receipt: { answer: "实验记录已写入" },
      }),
    },
    search: {
      version: "1",
      sideEffect: "read",
      execute: async () => ({
        items: [
          {
            documentId: "sample",
            chunkId: "1",
            version: "1",
            content: "这是用于引用核验的合成资料。",
            title: "实验资料",
          },
        ],
      }),
    },
  };
  const config = parseConfig({
    models: {
      p: {
        provider: "docs-lab",
        model: "synthetic-primary",
        baseURL: "https://docs-lab.invalid",
        apiKey: { secretRef: "synthetic" },
        limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
      },
    },
    routing: { primary: "p" },
    loop: {
      maxSteps: 10,
      maxModelAttempts: 10,
      maxCapabilityInvocations: 12,
      timeoutMs: 5000,
    },
    retry: {
      model: { maxRetries: 0 },
      outputRepair: { maxAttempts: 0 },
      toolInputRepair: { maxAttempts: 0 },
      readonlyTool: { maxRetries: 0 },
    },
  });
  let output: OutputConfig | undefined;
  switch (id) {
    case "output":
      config.retry!.outputRepair = { maxAttempts: enabled ? 1 : 0 };
      output = {
        mode: "prompt-json",
        schema: objectSchema,
        maxRepairAttempts: enabled ? 1 : 0,
      };
      script.push(
        finalText("not json"),
        finalText('{"answer":"已按 schema 修复"}'),
      );
      break;
    case "native":
      output = { mode: "provider-native", schema: objectSchema };
      script.push(finalText('{"answer":"原生结构化结果"}'));
      break;
    case "citation":
      config.retry!.outputRepair = { maxAttempts: enabled ? 1 : 0 };
      config.knowledgeBases = [
        {
          id: "sample",
          name: "实验资料",
          description: "仅供实验",
          retriever: { type: "binding", bindingKey: "search" },
          querySchema: { type: "object" },
          resultSchema: { type: "object" },
          citation: { required: true, outputPointer: "/citations" },
        },
      ];
      output = {
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
              },
            },
          },
          required: ["answer", "citations"],
        },
        maxRepairAttempts: enabled ? 1 : 0,
      };
      script.push(
        toolCall("engine.knowledge.sample", { query: "实验资料" }),
        finalText('{"answer":"合成回答","citations":[{"sourceId":"invalid"}]}'),
        (req) => {
          const sourceId = JSON.parse(
            req.messages.find((m) => m.role === "tool")!.content,
          ).items[0].sourceId;
          return finalText(
            JSON.stringify({ answer: "已核验引用", citations: [{ sourceId }] }),
          );
        },
      );
      break;
    case "retry":
      config.retry!.model = {
        maxRetries: enabled ? 1 : 0,
        retryOn: ["timeout"],
        backoff: {
          type: "exponential-jitter",
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
      };
      script.push(failed("MODEL_TIMEOUT"), finalText("重试成功"));
      break;
    case "fallback":
      config.retry!.model = { maxRetries: 1, retryOn: [] };
      config.models.b = { ...config.models.p!, model: "synthetic-backup" };
      config.routing.fallbacks = enabled ? ["b"] : [];
      config.routing.fallbackOn = ["provider_unavailable"];
      script.push(failed("MODEL_PROVIDER_ERROR"), finalText("备用模型完成"));
      break;
    case "tool-input":
    case "tool-retry":
      config.tools = [
        {
          name: "sample.read",
          description: "读取合成记录",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
            additionalProperties: false,
          },
          outputSchema: objectSchema,
          execution: {
            type: "binding",
            bindingKey: "read",
            sideEffect: "read",
          },
        },
      ];
      if (id === "tool-input") {
        config.retry!.toolInputRepair = { maxAttempts: enabled ? 1 : 0 };
        script.push(toolCall("sample.read", { id: 7 }));
        if (enabled)
          script.push(
            toolCall("sample.read", { id: "corrected" }, "corrected-call"),
          );
        script.push(finalText("实验结束"));
      } else {
        config.retry!.readonlyTool = { maxRetries: enabled ? 1 : 0 };
        script.push(
          toolCall("sample.read", { id: "one" }),
          finalText("实验结束"),
        );
      }
      break;
    case "write":
      config.permissions = {
        policy: { type: "binding", bindingKey: "policy" },
      };
      config.tools = [
        {
          name: "sample.write",
          description: "只修改实验内的计数器",
          inputSchema: { type: "object" },
          outputSchema: objectSchema,
          execution: {
            type: "binding",
            bindingKey: "write",
            sideEffect: "write",
            idempotency: {
              namespace: "docs-lab-write",
              businessKey: { type: "binding", bindingKey: "key" },
            },
          },
          reconciliation: { type: "binding", bindingKey: "reconcile" },
        },
      ];
      script.push(toolCall("sample.write", {}), finalText("已通过回执确认"));
      break;
    case "budget":
      if (enabled) config.budgets = { perRun: { maxTotalTokens: 1 } };
      script.push(finalText("预算内完成"));
      break;
    case "compaction":
      config.context = {
        maxInputTokens: 5000,
        compaction: {
          triggerAtRatio: 0.5,
          targetAtRatio: 0.4,
          maxCyclesPerRun: enabled ? 2 : 0,
        },
      };
      script.push(finalText("A".repeat(1000)));
      if (enabled) script.push(finalText("短摘要"));
      script.push(finalText("新回答"));
      break;
    case "config":
      script.push(finalText("第一轮"), finalText("第二轮"));
      break;
    case "events":
      script.push([
        {
          type: "usage",
          usage: { input: 12, output: 3 },
          mode: "snapshot",
          final: true,
        },
        ...finalText("事件实验"),
      ]);
      break;
    case "lifecycle":
      script.push(finalText("解除归档后完成"));
      break;
  }
  const model = scriptedModel(script),
    engine = await createAgentEngine({
      store,
      principal: { tenantId: "docs-lab", subjectId: input.requestId },
      secrets: { resolve: async () => "synthetic-no-credential" },
      adapters: { models: { "docs-lab": model } },
      bindings,
      policy: { allowedOrigins: ["https://docs-lab.invalid"] },
      telemetry: {
        event: (e) => {
          delivered.push(e.type);
        },
        metrics,
        traces: {
          export: (s) => {
            spans.push(s);
          },
        },
        logs: {
          write: (r) => {
            logs.push(r);
          },
        },
      },
    });
  let cleanup: undefined | (() => void);
  try {
    const session = await engine.createSession({ config }),
      subscribed: AgentEvent[] = [];
    cleanup = session.onEvent((event) => {
      subscribed.push(event);
    });
    const before = await session.getEffectiveConfig();
    let result: Awaited<ReturnType<typeof session.run>> | undefined,
      error: string | undefined;
    if (id === "lifecycle") {
      await session.archive();
      try {
        await session.startRun({ input: "归档会话" });
      } catch (e) {
        check(
          "归档后拒绝新运行",
          (e as AgentEngineError).code === "SESSION_ARCHIVED",
          (e as AgentEngineError).code,
        );
      }
      await session.unarchive();
    }
    if (id === "compaction") await session.run({ input: "Q".repeat(700) });
    try {
      if (id === "write") {
        const handle = await session.startRun({ input: "合成写入实验" });
        handle.result.catch(() => {});
        for (
          let n = 0;
          n < 600 &&
          (await session.getRun(handle.runId)).state !==
            "awaiting_tool_resolution";
          n++
        )
          await delay();
        const run = await session.getRun(handle.runId);
        check(
          "丢失响应后等待核验",
          run.state === "awaiting_tool_resolution",
          run.state,
        );
        if (run.state === "awaiting_tool_resolution")
          await session.reconcileOperation(
            (await engine.readRun(session.id, handle.runId)).operationIds[0]!,
          );
        result = await handle.result;
      } else
        result = await session.run({
          input: "运行合成配置实验",
          ...(output ? { output } : {}),
        });
    } catch (e) {
      error = e instanceof AgentEngineError ? e.code : "EXPERIMENT_ERROR";
    }
    if (id === "config") {
      const original = await engine.readSession(session.id);
      await session.replaceConfig({
        ifVersion: original.version,
        config: { ...config, instructions: { text: "新配置" } },
      });
      try {
        await session.replaceConfig({ ifVersion: original.version, config });
      } catch (e) {
        check(
          "旧配置版本写入被拒绝",
          (e as AgentEngineError).code === "CONFIG_VERSION_CONFLICT",
          (e as AgentEngineError).code,
        );
      }
      const next = await session.run({ input: "第二轮" }),
        oldFrozen = await session.getEffectiveConfig({ runId: result!.runId }),
        newFrozen = await session.getEffectiveConfig({ runId: next.runId });
      check("已完成 Run 保持原配置", oldFrozen.hash === before.hash, {
        before: before.hash,
        oldRun: oldFrozen.hash,
      });
      check("新 Run 使用更新配置", newFrozen.hash !== oldFrozen.hash, {
        newRun: newFrozen.hash,
      });
    }
    const expectedError = !enabled
      ? (
          {
            output: "OUTPUT_SCHEMA_INVALID",
            citation: "OUTPUT_SCHEMA_INVALID",
            retry: "MODEL_TIMEOUT",
            fallback: "MODEL_PROVIDER_ERROR",
            "tool-input": "TOOL_INPUT_INVALID",
          } as Record<string, string>
        )[id]
      : id === "budget"
        ? "BUDGET_EXCEEDED"
        : undefined;
    check(
      "终态符合配置预期",
      expectedError ? error === expectedError && !result : !!result && !error,
      {
        expectedError: expectedError ?? null,
        error: error ?? null,
        state: result ? "completed" : "failed",
      },
    );
    const snapshot = await engine.inspectSession(session.id),
      events: AgentEvent[] = [];
    let afterSequence = 0;
    for (let n = 0; n < 100; n++) {
      const page = await session.listEvents({ afterSequence, limit: 7 });
      events.push(...page.events);
      if (!page.events.length || page.nextSequence === afterSequence) break;
      afterSequence = page.nextSequence;
    }
    const types = events.map((e) => e.type),
      purposes = model.requests.map((r) => r.purpose);
    switch (id) {
      case "output":
      case "citation":
        check(
          "修复开关决定修复请求",
          purposes.includes("output-repair") === enabled,
          purposes,
        );
        check(
          "输出必须通过校验",
          enabled ? !!result && !error : error === "OUTPUT_SCHEMA_INVALID",
          {
            state: result ? "completed" : "failed",
            error: error ?? null,
          },
        );
        if (id === "citation" && enabled)
          check(
            "引用来自检索结果",
            !!result?.citations?.length,
            result?.citations,
          );
        break;
      case "native":
        check(
          "schema 传给模型适配器",
          !!model.requests[0]?.outputSchema,
          model.requests[0]?.outputSchema ?? null,
        );
        check("返回结构化结果", !!result && !error, result?.output ?? null);
        break;
      case "retry":
        check(
          "模型重试次数遵循配置",
          model.requests.length === (enabled ? 2 : 1),
          model.requests.length,
        );
        check(
          "重试事件遵循配置",
          types.includes("model.retrying") === enabled,
          types.filter((t) => t.startsWith("model.")),
        );
        break;
      case "fallback":
        check(
          "备用模型开关生效",
          model.requests.some((r) => r.model.model === "synthetic-backup") ===
            enabled,
          model.requests.map((r) => r.model.model),
        );
        break;
      case "tool-input":
        check(
          "参数修复开关生效",
          purposes.includes("input-repair") === enabled,
          purposes,
        );
        check("不合法参数不会执行", reads === (enabled ? 1 : 0), {
          reads,
          received,
        });
        break;
      case "tool-retry":
        check("只读工具实际重试次数", reads === (enabled ? 2 : 1), reads);
        break;
      case "write":
        check("写入只执行一次", writes === 1, writes);
        check("核验后继续原 Run", !!result && !error, {
          state: result ? "completed" : "failed",
          error: error ?? null,
        });
        break;
      case "budget":
        check(
          "预算在请求模型前检查",
          enabled
            ? model.requests.length === 0 && error === "BUDGET_EXCEEDED"
            : !!result,
          { requests: model.requests.length, error: error ?? null },
        );
        break;
      case "compaction":
        check(
          "整理开关决定摘要调用",
          purposes.includes("compaction") === enabled,
          purposes,
        );
        check(
          "原始历史保留",
          (await engine.readSession(session.id)).history.some(
            (m) => m.content === "Q".repeat(700),
          ),
          {
            historyCount: (await engine.readSession(session.id)).history.length,
          },
        );
        break;
    }
    if (id === "events") {
      for (
        let n = 0;
        n < 200 &&
        (!spans.some((v: any) => v.name === "agent.run") ||
          !delivered.includes("run.completed"));
        n++
      )
        await delay();
      check(
        "分页事件有序且不重复",
        events.length > 7 &&
          new Set(events.map((e) => e.sequence)).size === events.length &&
          events.every(
            (e, i) => i === 0 || e.sequence > events[i - 1]!.sequence,
          ),
        { events: events.length },
      );
      for (
        let n = 0;
        n < 200 && !subscribed.some((e) => e.type === "run.completed");
        n++
      )
        await delay();
      check(
        "订阅收到完成事件",
        subscribed.some((e) => e.type === "run.completed"),
        subscribed.map((e) => e.type),
      );
      const replayed: AgentEvent[] = [];
      const durableSubscription = await session.subscribe({
        afterSequence: 0,
        onEvent: (e) => {
          replayed.push(e);
        },
      });
      try {
        for (
          let n = 0;
          n < 200 && !replayed.some((e) => e.type === "run.completed");
          n++
        )
          await delay();
        check(
          "从游标补齐订阅历史",
          replayed.some((e) => e.type === "run.completed") &&
            new Set(replayed.map((e) => e.id)).size === replayed.length,
          { events: replayed.length },
        );
      } finally {
        await durableSubscription.close();
      }
      check(
        "Usage 来自适配器",
        (await engine.usage.getRun(result!.runId)).attemptCount === 1,
        await engine.usage.getRun(result!.runId),
      );
      check(
        "Trace / 日志 / 指标真实导出",
        spans.length > 0 &&
          logs.length > 0 &&
          metrics.render().includes("agent_usage_total_tokens_net 15"),
        { spans: spans.length, logs: logs.length },
      );
    }
    if (id === "lifecycle") {
      check("解除归档后继续", !!result, { runId: result?.runId });
      await engine.deleteSession(session.id);
      try {
        await engine.readSession(session.id);
      } catch (e) {
        check(
          "删除后不可读取",
          (e as AgentEngineError).code === "ACCESS_DENIED",
          (e as AgentEngineError).code,
        );
      }
    }
    return jsonValue({
      id,
      enabled,
      mode: "deterministic",
      storage: "isolated-memory",
      passed: checks.length > 0 && checks.every((v) => v.passed),
      checks,
      config: before.value,
      configurationSnapshot: before,
      requests: model.requests.map((r) => ({
        model: r.model.model,
        purpose: r.purpose,
        tools: r.tools.map((t) => t.name),
        outputSchema: r.outputSchema,
      })),
      result: result
        ? {
            outputText: result.outputText,
            output: result.output,
            citations: result.citations,
          }
        : null,
      error: error ?? null,
      events,
      snapshot,
      telemetry: { spans, logs, metrics: metrics.render() },
    }) as JsonObject;
  } finally {
    cleanup?.();
    await engine.close();
  }
}
