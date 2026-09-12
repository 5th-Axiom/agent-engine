import { startDebugServer } from "@agent-runtime/debug";
import { createBackend } from "./backend.js";
const { engine, config } = await createBackend({
  principal: { tenantId: "demo", subjectId: "debug-user" },
});
let debug: Awaited<ReturnType<typeof startDebugServer>> | undefined;
try {
  const session = await engine.createSession({ config });
  console.log((await session.run({ input: "简短介绍你的用途。" })).outputText);
  debug = await startDebugServer({
    engine,
    auth: { type: "token", secretRef: "DEBUG_TOKEN" },
    host: "127.0.0.1",
    port: 4319,
    basePath: "/debug",
  });
  console.log(debug.url + "/debug/");
  await new Promise<void>((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
} finally {
  await debug?.close();
  await engine.close();
}
