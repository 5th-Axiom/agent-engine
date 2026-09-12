import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { createBackend } from "./backend.js";
import { connectChat } from "./chat-server.js";

const password = process.env.DEMO_LOGIN_PASSWORD;
if (!password || password.length < 16)
  throw new Error("DEMO_LOGIN_PASSWORD needs at least 16 characters");
const principal = { tenantId: "demo", subjectId: "demo-user" };
const port = Number(process.env.PORT ?? 4322),
  origin = `http://127.0.0.1:${port}`;
const verifyLogin = async (req: IncomingMessage) => {
  const value = req.headers.authorization;
  if (!value?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(value.slice(6), "base64").toString();
  const expected = Buffer.from(`demo:${password}`),
    actual = Buffer.from(decoded);
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? principal
    : null;
};
// 本地示例只允许一个已验证身份。Session 的归属仍由 Engine 强制检查。
const { engine, config } = await createBackend({
  principal,
  authorize: async (req) =>
    req.principal.tenantId === principal.tenantId &&
    req.principal.subjectId === principal.subjectId,
});
let server: ReturnType<typeof createServer> | undefined;
try {
  await mkdir(".local", { recursive: true });
  await build({
    entryPoints: [new URL("./client.ts", import.meta.url).pathname],
    outfile: ".local/client.js",
    bundle: true,
    format: "esm",
    platform: "browser",
  });
  const handler = connectChat({
    engine,
    config,
    frontendOrigin: [
      origin,
      ...(process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : []),
    ],
    verifyLogin,
  });
  server = createServer(async (req, res) => {
    try {
      if (await handler(req, res)) return;
      if (!(await verifyLogin(req))) {
        res.writeHead(401, {
          "www-authenticate": 'Basic realm="Local integration demo"',
        });
        res.end("Login required");
        return;
      }

      res.setHeader("cache-control", "no-store");
      if (req.method === "GET" && req.url === "/client.js") {
        res.setHeader("content-type", "text/javascript");
        res.end(await readFile(".local/client.js"));
        return;
      }
      if (req.method === "GET" && req.url === "/") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(
          '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Agent Engine 接入示例</title><style>body{margin:0}#chat{height:100dvh}</style><div id="chat"></div><script type="module" src="/client.js"></script></html>',
        );
        return;
      }
      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(500);
      res.end("Local server error");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", resolve);
  });
  console.log(`Open ${origin}; log in as demo using DEMO_LOGIN_PASSWORD.`);
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
  if (server?.listening)
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
      server!.closeIdleConnections();
    });
  await engine.close();
}
