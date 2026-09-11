import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const destination = resolve(".local/chat-packages");
await mkdir(destination, { recursive: true });
for (const name of ["sdk", "chat-core", "chat-server", "chat-ui"]) {
  const result = spawnSync(
    "pnpm",
    ["pack", "--pack-destination", destination],
    { cwd: resolve("packages", name), encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}
for (const name of await readdir(destination))
  if (name.endsWith(".tgz")) console.log(resolve(destination, name));
