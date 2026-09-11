import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import assert from "node:assert/strict";
const consumer = await mkdtemp(join(tmpdir(), "agent-chat-consumer-"));
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify({
    name: "sdk-consumer-check",
    private: true,
    type: "module",
    packageManager: "pnpm@10.17.1",
  }),
);
await writeFile(
  join(consumer, "pnpm-workspace.yaml"),
  "overrides:\n" +
    ["chat-core", "sdk"]
      .map(
        (n) =>
          `  "@agent-runtime/${n}": "file:${resolve(`.local/chat-packages/agent-runtime-${n}-0.1.0-dev.tgz`)}"`,
      )
      .join("\n") +
    "\n",
);
const packages = ["chat-core", "chat-ui", "sdk", "chat-server"].map((n) =>
  resolve(`.local/chat-packages/agent-runtime-${n}-0.1.0-dev.tgz`),
);
const install = spawnSync("pnpm", ["add", ...packages], {
  cwd: consumer,
  encoding: "utf8",
  timeout: 120000,
});
if (install.status !== 0) {
  console.error(install.stdout, install.stderr);
  throw Error("PACKAGE_INSTALL_FAILED");
}
const entry = join(consumer, "check.ts");
await writeFile(
  entry,
  `
import {mountChatWidget, mountChatPage, createHttpChatTransport} from '@agent-runtime/chat-ui';
import {resolveChatTheme} from '@agent-runtime/chat-ui/tokens';
import {createButton} from '@agent-runtime/chat-ui/atoms';
import {createMessage} from '@agent-runtime/chat-ui/components';
import {createChatPage} from '@agent-runtime/chat-ui/pages';
import {installChatStyles} from '@agent-runtime/chat-ui/styles';
import {ChatController} from '@agent-runtime/chat-core';
import {createChatHandler} from '@agent-runtime/chat-server';
import {createAgentEngine} from '@agent-runtime/sdk';
const transport=createHttpChatTransport({baseURL:'https://admin.example.com/api/agent-chat'});
const controller=new ChatController(transport);
resolveChatTheme({mode:'dark',skin:'rounded',accent:'#a63212'});
for(const fn of [mountChatWidget,mountChatPage,createChatPage,createButton,createMessage,installChatStyles,createChatHandler,createAgentEngine]) if(typeof fn!=='function') throw Error('EXPORT_MISSING');
controller.dispose();
`,
);
const types = spawnSync(
  process.execPath,
  [
    resolve("node_modules/typescript/bin/tsc"),
    entry,
    "--noEmit",
    "--skipLibCheck",
    "--module",
    "nodenext",
    "--target",
    "es2023",
    "--strict",
  ],
  { cwd: consumer, encoding: "utf8", timeout: 30000 },
);
if (types.status !== 0) {
  console.error(types.stdout, types.stderr);
  throw Error("DECLARATIONS_FAILED");
}
const execute = spawnSync(process.execPath, [entry], {
  cwd: consumer,
  encoding: "utf8",
  timeout: 10000,
});
if (execute.status !== 0) {
  console.error(execute.stdout, execute.stderr);
  throw Error("SSR_IMPORT_FAILED");
}
const front = join(consumer, "frontend.ts");
await writeFile(
  front,
  `export {mountChatWidget, createHttpChatTransport} from '@agent-runtime/chat-ui';`,
);
const bundle = await build({
  entryPoints: [front],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  metafile: true,
});
assert(
  !Object.keys(bundle.metafile.inputs).some((p) =>
    /agent-runtime.(sdk|chat-server)/.test(p),
  ),
);
await writeFile(
  ".local/chat-package-check.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      install: true,
      declarations: true,
      nodeSSRImport: true,
      browserBundle: true,
      noServerInBrowser: true,
      consumer,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    install: true,
    declarations: true,
    nodeSSRImport: true,
    browserBundle: true,
    noServerInBrowser: true,
  }),
);
