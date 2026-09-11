import { randomUUID } from "node:crypto";
import { createBackend } from "./backend.js";

// 这是服务端脚本自己的固定身份；面向用户的接口应使用已验证的登录身份。
const { engine, config } = await createBackend({
  principal: { tenantId: "my-app", subjectId: "server-task" },
});
try {
  const session = await engine.createSession({
    config,
    requestId: randomUUID(),
  });
  const first = await session.run({
    input: "用两句话介绍你能怎样帮助用户。",
    requestId: randomUUID(),
  });
  console.log(first.outputText);
  console.log("保存这个 sessionId，之后可以续聊：", session.id);

  const restored = await engine.loadSession(session.id);
  const next = await restored.run({
    input: "把刚才的回答缩短为一句话。",
    requestId: randomUUID(),
  });
  console.log(next.outputText);
} finally {
  // 常驻 HTTP 服务在进程退出时关闭，不要每个请求都关闭。
  await engine.close();
}
