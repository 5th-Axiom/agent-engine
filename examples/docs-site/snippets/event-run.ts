import { AgentEngineError } from "@agent-runtime/sdk";
import { createBackend } from "./backend.js";
const { engine, config } = await createBackend({
  principal: { tenantId: "demo", subjectId: "event-user" },
});
try {
  const session = await engine.createSession({ config });
  const subscription = await session.subscribe({
    afterSequence: 0,
    onEvent(event) {
      console.log(event.sequence, event.type); // 只记录需要展示的字段。
    },
  });
  try {
    const handle = await session.startRun({ input: "简短介绍产品。" });
    const cancel = () => {
      void handle.cancel();
    };
    process.once("SIGINT", cancel);
    try {
      console.log((await handle.result).outputText);
    } catch (error) {
      if (error instanceof AgentEngineError) console.error(error.code);
      else throw error;
    } finally {
      process.off("SIGINT", cancel);
    }
    console.log(await engine.usage.getRun(handle.runId));
  } finally {
    subscription.close();
  }
} finally {
  await engine.close();
}
