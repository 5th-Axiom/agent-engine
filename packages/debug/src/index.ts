import { createServer, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { AgentEngine } from "@agent-runtime/sdk";
import { AgentEngineError } from "@agent-runtime/sdk";
export interface DebugOptions {
  engine: AgentEngine;
  host?: string;
  port?: number;
  basePath?: string;
  backLink?: { href: string; label: string };
  auth: { type: "token"; secretRef: string };
  redaction?: {
    hideSecrets: true;
    thinking: "summary-only";
    toolResults: "policy-based";
  };
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function rows(values: Record<string, unknown>[], columns: string[]) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable records"><table><thead><tr>${columns.map((c) => `<th scope="col">${escape(c)}</th>`).join("")}</tr></thead><tbody>${values.map((row) => `<tr>${columns.map((c) => `<td>${escape(typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${columns.length}">No records yet.</td></tr>`}</tbody></table></div>`;
}
function page(content: string, options: DebugOptions) {
  const root = `${options.basePath ?? ""}/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Engine · Debug</title><style>
:root{color-scheme:light;--ink:#172b42;--muted:#48596a;--line:#cad4df;--link:#0758a0;--surface:#f3f6f9}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:white;font:15px/1.55 system-ui,sans-serif}header{padding:24px 4vw;background:var(--surface);border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:24px}h1{font-size:24px;line-height:1.25;margin:0;font-weight:650}header p{margin:0;color:var(--muted)}main{max-width:1440px;margin:auto;padding:32px 4vw 80px}h2{font-size:20px;margin:36px 0 12px}h3{font-size:16px;margin:24px 0 10px}a{color:var(--link);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}:focus-visible{outline:3px solid #0758a0;outline-offset:4px}::selection{background:#c7e1fc}.table-scroll{overflow:auto;border:1px solid var(--line)}table{width:100%;min-width:720px;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--surface);font-size:13px}td{min-width:12ch;max-width:56ch;overflow-wrap:anywhere}tr:last-child td{border:0}details{margin:16px 0;padding:12px 0;border-bottom:1px solid var(--line)}summary{cursor:pointer;font-weight:600}pre{font:13px/1.6 ui-monospace,monospace;overflow:auto;padding:16px;background:var(--surface)}.error{color:#99252c}.empty{max-width:70ch;padding:32px 0;color:var(--muted)}@media(max-width:640px){header{display:block;padding:20px}header p{margin-top:8px}main{padding:20px}th,td{padding:10px}h1{font-size:22px}}</style></head><body><header><h1>Agent Engine</h1><p>Read-only execution debugger</p></header><main><nav aria-label="Location"><a href="${escape(root)}">Sessions</a>${options.backLink ? ` · <a href="${escape(options.backLink.href)}">${escape(options.backLink.label)}</a>` : ""}</nav>${content}</main></body></html>`;
}
export async function startDebugServer(options: DebugOptions) {
  const basePath = options.basePath ?? "";
  if (
    !/^(\/[a-zA-Z0-9_-]+)*$/.test(basePath) ||
    (options.backLink &&
      !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(options.backLink.href))
  )
    throw new AgentEngineError(
      "CONFIG_INVALID",
      "Invalid Debug navigation path",
    );
  const token = await options.engine.options.secrets.resolve(
    options.auth.secretRef,
    options.engine.principal,
  );
  if (token.length < 16)
    throw new AgentEngineError(
      "CONFIG_INVALID",
      "Debug token must contain at least 16 characters",
    );
  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    );
    const provided = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : req.headers.authorization?.startsWith("Basic ")
        ? Buffer.from(req.headers.authorization.slice(6), "base64")
            .toString()
            .split(":")
            .slice(1)
            .join(":")
        : "";
    if (
      !provided ||
      Buffer.byteLength(provided) !== Buffer.byteLength(token) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    ) {
      res.writeHead(401, {
        "www-authenticate": 'Basic realm="Agent Engine Debug"',
      });
      res.end(
        "Authentication required. Use any username and your Debug token as the password.",
      );
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" });
      res.end("Read-only endpoint");
      return;
    }
    try {
      const url = new URL(req.url ?? "/", "http://debug.local");
      let content: string;
      if (url.pathname === `${basePath}/` || url.pathname === basePath) {
        const sessions = await options.engine.listSessions();
        content =
          "<h2>Sessions</h2>" +
          (!sessions.length
            ? '<p class="empty">No sessions available. Create a Session through your application, then refresh this page.</p>'
            : sessions
                .map(
                  (s) =>
                    `<details open><summary><a href="${basePath}/sessions/${encodeURIComponent(s.id)}">${escape(s.id)}</a></summary><p>Config version ${s.version} · ${s.archived ? "Archived" : "Active"}</p></details>`,
                )
                .join(""));
      } else if (url.pathname.startsWith(`${basePath}/sessions/`)) {
        const id = decodeURIComponent(
          url.pathname.slice(`${basePath}/sessions/`.length),
        );
        const data = await options.engine.inspectSession(id);
        if (url.searchParams.get("format") === "json") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(data));
          return;
        }
        content = `<h2>Session ${escape(id)}</h2><p>Snapshot sequence ${data.snapshotSequence}. Request bodies, private reasoning and tool receipts are hidden.</p><h2>Configuration versions</h2>${data.configVersions.map((c) => `<details id="config-${c.version}"><summary>Version ${c.version} · ${escape(c.hash.slice(0, 12))}</summary><pre>${escape(JSON.stringify(c, null, 2))}</pre></details>`).join("")}<h2>Runs</h2>${
          data.runs
            .map(
              (r) =>
                `<details open><summary>${escape(r.id)} · ${escape(r.state)}</summary><p>Configuration: <a href="#config-${r.configVersion}">version ${r.configVersion}</a></p>${r.error ? `<p class="error">${escape(r.error.code)} · ${escape(r.error.message)}</p>` : ""}<h3>Steps and attempts</h3>${rows(r.steps, ["id", "purpose", "provider", "model", "attempts", "committed"])}<h3>Usage</h3><p>${r.usage.complete ? "Token totals confirmed" : "Token totals incomplete"} · ${r.usage.costComplete ? "Cost estimate complete" : "Cost estimate incomplete"} · revision ${r.usage.revision}</p>${rows(
                  r.usage.attempts.map((u) => ({
                    attempt: u.attemptId,
                    dispatch: u.dispatchState,
                    status: u.status,
                    tokens: u.tokens,
                    cost: u.cost,
                  })),
                  ["attempt", "dispatch", "status", "tokens", "cost"],
                )}</details>`,
            )
            .join("") || "<p>No runs yet.</p>"
        }<h2>Operations</h2>${rows(data.operations, ["id", "runId", "name", "executionStatus", "validationStatus", "error"])}`;
      } else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(content, options));
    } catch (e) {
      const code = e instanceof AgentEngineError ? e.code : "INTERNAL_ERROR";
      res.writeHead(code === "ACCESS_DENIED" ? 403 : 503, {
        "content-type": "text/html; charset=utf-8",
      });
      res.end(
        page(
          `<h2>Unable to load records</h2><p class="error">${escape(code)}</p><p><a href="${basePath}/">Return to Sessions and retry</a></p>`,
          options,
        ),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4319, options.host ?? "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No server address");
  return {
    url: `http://${options.host ?? "127.0.0.1"}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
