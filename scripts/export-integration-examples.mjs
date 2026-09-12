import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
const root = resolve(".local/integration-examples");
const files = await readdir("examples/docs-site/snippets");
for (const route of ["backend", "frontend", "fullstack"]) {
  const out = join(root, route);
  await mkdir(join(out, "packages"), { recursive: true });
  const names =
    route === "frontend"
      ? ["chat-core", "chat-ui"]
      : route === "backend"
        ? ["sdk", "debug"]
        : ["sdk", "debug", "chat-core", "chat-server", "chat-ui"];
  const dependencies = { ...(route !== "frontend" ? { zod: "^4.6.2" } : {}) };
  for (const name of names) {
    const filename = `agent-runtime-${name}-0.1.0-dev.tgz`;
    await copyFile(
      resolve(".local/chat-packages", filename),
      join(out, "packages", filename),
    );
    dependencies[`@agent-runtime/${name}`] = `file:./packages/${filename}`;
  }
  const selected = files.filter((file) =>
    route === "frontend"
      ? file === "client.ts"
      : route === "backend"
        ? !["frontend.ts", "client.ts", "server.ts", "chat-server.ts"].includes(
            file,
          )
        : file !== "frontend.ts",
  );
  for (const file of selected)
    await copyFile(
      resolve("examples/docs-site/snippets", file),
      join(out, file),
    );
  await writeFile(
    join(out, "package.json"),
    JSON.stringify(
      {
        name: `agent-engine-${route}-example`,
        private: true,
        type: "module",
        packageManager: "pnpm@10.17.1",
        scripts: {
          start:
            route === "frontend"
              ? "node --env-file=.env serve.mjs"
              : `node --env-file=.env --import tsx ${route === "backend" ? "run.ts" : "server.ts"}`,
          ...(route !== "frontend"
            ? Object.fromEntries(
                [
                  "tool",
                  "skill",
                  "knowledge",
                  "memory",
                  "image",
                  "event",
                  "debug",
                ].map((name) => [
                  name,
                  `node --env-file=.env --import tsx ${name}-run.ts`,
                ]),
              )
            : {}),
        },
        dependencies,
        devDependencies: {
          typescript: "^7.0.2",
          tsx: "^4.23.13",
          "@types/node": "^22.20.2",
          ...(route !== "backend" ? { esbuild: "^0.28.2" } : {}),
        },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(out, "pnpm-workspace.yaml"),
    "overrides:\n" +
      names
        .filter((n) => ["sdk", "chat-core"].includes(n))
        .map(
          (n) =>
            `  '@agent-runtime/${n}': 'file:./packages/agent-runtime-${n}-0.1.0-dev.tgz'`,
        )
        .join("\n") +
      "\n",
  );
  await writeFile(
    join(out, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: true,
          types: ["node"],
          lib: ["ES2023", "DOM", "DOM.Iterable"],
        },
        include: ["*.ts"],
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(join(out, ".gitignore"), ".env\nnode_modules/\n.local/\n");
  await writeFile(
    join(out, ".env.example"),
    route === "frontend"
      ? "CHAT_API_URL=http://127.0.0.1:4322/api/agent-chat\nPORT=4323\n"
      : "DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/YOUR_DATABASE\nMODEL_BASE_URL=https://your-model.example/v1\nMODEL_NAME=your-model\nMODEL_API_KEY=REPLACE_WITH_YOUR_PROVIDER_KEY\nPROTOCOL_KEY=REPLACE_WITH_A_STABLE_RANDOM_KEY\nDEMO_LOGIN_PASSWORD=REPLACE_WITH_LOCAL_LOGIN_PASSWORD\n# DEBUG_TOKEN=REPLACE_WITH_DEBUG_TOKEN\n# MODEL_IMAGES=true\n# MODEL_IMAGE_TOKENS=YOUR_MODEL_PER_IMAGE_UPPER_BOUND\n# IMAGE_PATH=/absolute/path/to/image.png\n",
  );
  await writeFile(
    join(out, "README.md"),
    `# ${route} 接入示例\n\n需要 Node.js >= 22.19 和 pnpm 10.17.1。${route === "frontend" ? "需要现有聊天后端，允许本页面 Origin 和业务登录凭据。" : "需要已创建的独立 PostgreSQL 数据库和模型访问权限。"}\n\n1. pnpm install\n2. cp .env.example .env，填入自己的值，并 chmod 600 .env。\n3. pnpm start\n\n${route === "backend" ? "输出回答与 sessionId。设置 SESSION_ID 后再次启动可以续聊。pnpm tool / skill / knowledge / memory / image / event / debug 分别运行完整场景。" : route === "fullstack" ? "打开 http://127.0.0.1:4322，用 demo 与 DEMO_LOGIN_PASSWORD 登录。该 Basic 登录只用于回环本地示例；部署前接真实业务认证。刷新或重启后可继续同一会话。" : "打开 http://127.0.0.1:4323。CHAT_API_URL 是现有后端；如需跨域凭据，后端启用 allowCredentials 并列出这个页面的精确 Origin。client.ts 的 headers 接口用于接入业务 Token。"}\n\nSDK 包随目录携带，没有公共 npm 发布假设。保留数据库、身份与 PROTOCOL_KEY 可跨进程恢复。退出用 Ctrl+C。工具库存、知识、记忆使用明确标记的演示数据；生产时更换为有权限校验的真实服务。图片需真实视觉模型与模型每张图片的预算上限。\n`,
  );
  if (route === "frontend")
    await writeFile(
      join(out, "serve.mjs"),
      `import { createServer } from 'node:http';\nimport { readFile, mkdir } from 'node:fs/promises';\nimport { build } from 'esbuild';\nawait mkdir('.local',{recursive:true});\nawait build({entryPoints:['client.ts'],outfile:'.local/client.js',bundle:true,format:'esm',platform:'browser'});\nconst api=process.env.CHAT_API_URL; if(!api || !/^https?:$/.test(new URL(api).protocol)) throw Error('Set CHAT_API_URL');\nconst escape=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));\nconst port=Number(process.env.PORT??4323);\nconst server=createServer(async(req,res)=>{res.setHeader('cache-control','no-store');if(req.method!=='GET'){res.writeHead(405);res.end();return;}if(req.url==='/client.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('.local/client.js'));return;}if(req.url!=='/'){res.writeHead(404);res.end();return;}res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh-CN" data-chat-api="'+escape(api)+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>前端接入示例</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module" src="/client.js"></script></html>');});\nserver.listen(port,'127.0.0.1',()=>console.log('Open http://127.0.0.1:'+port));\nfor(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeIdleConnections();});\n`,
    );
  console.log(out);
}
