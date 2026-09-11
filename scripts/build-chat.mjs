import { build } from "esbuild";
const options = {
  entryPoints: ["packages/chat-ui/src/index.ts"],
  bundle: true,
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: true,
  legalComments: "eof",
};
await build({
  ...options,
  format: "esm",
  outfile: "packages/chat-ui/dist/agent-chat.mjs",
});
await build({
  ...options,
  format: "iife",
  globalName: "AgentChat",
  outfile: "packages/chat-ui/dist/agent-chat.js",
});
