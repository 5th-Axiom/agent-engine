import { defineSkill } from "@agent-runtime/sdk";
import { createBackend } from "./backend.js";
const skill = defineSkill({
  id: "concise-help",
  name: "简明答疑",
  description: "解释一个概念并提供一个例子。",
  instructions: "先用一句话解释，再给一个具体例子。",
  allowedTools: [],
});
const { engine, config } = await createBackend({
  principal: { tenantId: "demo", subjectId: "skill-user" },
});
try {
  const session = await engine.createSession({
    config: {
      ...config,
      skills: [skill],
      instructions: { text: "按当前技能完成概念答疑。" },
    },
  });
  const result = await session.run({
    skill: "concise-help",
    input: "解释什么是会话。",
  });
  console.log(result.outputText);
  console.log(
    (await session.listEvents()).events.filter((event) =>
      event.type.startsWith("skill."),
    ),
  );
} finally {
  await engine.close();
}
