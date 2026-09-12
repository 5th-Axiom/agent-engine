import { readFile } from "node:fs/promises";
import { createBackend } from "./backend.js";
const filename = process.env.IMAGE_PATH;
if (!filename) throw new Error("Set IMAGE_PATH to a PNG image");
const { engine, config } = await createBackend({
  principal: { tenantId: "demo", subjectId: "image-user" },
});
try {
  const image = await engine.uploadImage({
    data: await readFile(filename),
    mediaType: "image/png",
    filename: "upload.png",
  });
  const session = await engine.createSession({ config });
  const result = await session.run({
    input: "描述这张图片。",
    attachments: [image],
  });
  console.log(result.outputText, "sessionId:", session.id);
  console.log(
    (await session.run({ input: "再指出图里一个具体细节。" })).outputText,
  );
} finally {
  await engine.close();
}
