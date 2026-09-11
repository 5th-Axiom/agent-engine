import { createAgentEngine, PostgresStore } from "@agent-runtime/sdk";
import { scriptedModel, toolCall } from "@agent-runtime/testing";

const origin = process.env.CRASH_TEST_ORIGIN!;
const engine = await createAgentEngine({
  store: PostgresStore.fromConnectionString(
    process.env.AGENT_TEST_DATABASE_URL!,
  ),
  principal: { tenantId: process.env.CRASH_TEST_TENANT!, subjectId: "user" },
  secrets: { resolve: async () => "synthetic" },
  adapters: {
    models: {
      scripted: scriptedModel([toolCall("write.record", { id: "one" })]),
    },
  },
  policy: {
    allowedOrigins: [origin, "https://model.example.com"],
    allowPrivateOrigins: [origin],
  },
  remoteContracts: {
    [origin + "/write"]: {
      version: "1",
      sideEffect: "write",
      namespace: "process.crash",
    },
  },
  bindings: {
    key: { version: "1", sideEffect: "read", execute: async () => "one" },
    policy: { version: "1", sideEffect: "read", execute: async () => "allow" },
  },
  fault: (point) => {
    if (point === "tool.after_execute") process.kill(process.pid, "SIGKILL");
  },
});
const session = await engine.createSession({
  config: {
    models: {
      p: {
        provider: "scripted",
        model: "fake",
        baseURL: "https://model.example.com",
        apiKey: { secretRef: "test" },
        limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
      },
    },
    routing: { primary: "p" },
    permissions: { policy: { type: "binding", bindingKey: "policy" } },
    tools: [
      {
        name: "write.record",
        description: "Synthetic local write",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        execution: {
          type: "http",
          endpoint: origin + "/write",
          sideEffect: "write",
          idempotencyHeader: "Idempotency-Key",
          idempotency: {
            required: true,
            namespace: "process.crash",
            businessKey: { type: "binding", bindingKey: "key" },
          },
        },
      },
    ],
  },
});
await session.run({ requestId: "crash", input: "write once" });
throw new Error("Crash fault was not reached");
