import { randomUUID, createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  AgentEngineError,
  parseConfig,
  type AgentEngine,
  type JsonObject,
  type JsonValue,
} from "@agent-runtime/sdk";
import type { ChatAssistantDefinition } from "@agent-runtime/chat-server";
import type { DocsCapabilities } from "./capabilities.js";
import {
  experiments,
  experimentInput,
  runDocsExperiment,
} from "./experiments.js";
const reportTable = "docs_experiments_v1";
interface Report {
  id: string;
  owner: string;
  instance: string;
  createdAt: number;
  input: JsonValue;
  state: "running" | "completed" | "failed";
  result?: JsonObject;
  error?: string;
}
const isDocs = (config: ReturnType<typeof parseConfig>) => {
  const marker = config.metadata?.agentChat;
  return (
    marker &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    marker.namespace === "agent-engine-docs" &&
    marker.assistantId === "docs"
  );
};
export function createDocsCapabilitiesHandler(options: {
  engine: AgentEngine;
  assistant: ChatAssistantDefinition;
  capabilities: DocsCapabilities;
  visitor: (req: IncomingMessage) => string | undefined;
  origin: () => string;
  allow: (id: string) => boolean;
}) {
  const instance = randomUUID(),
    active = new Set<Promise<void>>();
  let closing = false;
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  async function body(req: IncomingMessage) {
    if (
      req.headers.origin !== options.origin() ||
      req.headers["x-agent-chat"] !== "1" ||
      !req.headers["content-type"]?.startsWith("application/json")
    )
      throw new AgentEngineError("ACCESS_DENIED");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      const b = Buffer.from(c);
      size += b.length;
      if (size > 16000) throw new AgentEngineError("CONFIG_INVALID");
      chunks.push(b);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AgentEngineError("CONFIG_INVALID");
    }
  }
  return {
    async handle(req: IncomingMessage, res: ServerResponse) {
      const path = new URL(req.url!, options.origin()).pathname;
      if (!path.startsWith("/api/docs-capabilities")) return false;
      try {
        const visitor = options.visitor(req);
        if (!visitor) {
          json(res, 401, { error: { code: "CHAT_UNAUTHENTICATED" } });
          return true;
        }
        const principal = { tenantId: "docs-site", subjectId: visitor },
          engine = options.engine.forPrincipal(principal),
          owner = createHash("sha256").update(visitor).digest("hex");
        const route = path.slice("/api/docs-capabilities".length) || "/";
        if (req.method !== "GET" && req.method !== "POST") {
          json(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
          return true;
        }
        if (req.method === "GET" && route === "/") {
          const assistant = options.capabilities.assistant(
              options.assistant,
              principal,
            ),
            config = parseConfig(assistant.config);
          json(res, 200, {
            storage: engine.options.store.durable
              ? "PostgreSQL"
              : "内存（重启后丢失）",
            tools: config.tools.map((t) => ({
              name: t.name,
              label: assistant.toolDisplay?.[t.name]?.label ?? t.name,
              description:
                assistant.toolDisplay?.[t.name]?.description ?? t.description,
              executor: t.execution.type,
            })),
            skills: config.skills.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              source: s.source ? "loader" : "inline",
            })),
            knowledge: config.knowledgeBases.map((k) => ({
              id: k.id,
              name: k.name,
            })),
            memory: config.memory.stores.map((m) => ({
              id: m.id,
              read: m.read,
              write: !!m.write,
              retentionDays: m.write?.retentionDays,
            })),
            interaction: !!assistant.interaction,
            images: Object.values(config.models).some(
              (m) => m.capabilities?.images,
            ),
            experiments,
          });
          return true;
        }
        if (route === "/memories" && req.method === "GET") {
          json(res, 200, { items: await options.capabilities.list(principal) });
          return true;
        }
        if (route === "/memories/delete" && req.method === "POST") {
          const v = z
            .strictObject({
              id: z.string().max(80),
              version: z.string().min(1).max(80),
            })
            .parse(await body(req));
          await options.capabilities.remove(principal, v.id, v.version);
          json(res, 200, { deleted: true });
          return true;
        }
        if (route === "/sessions" && req.method === "GET") {
          const summaries = await engine.listSessions({ limit: 100 }),
            items = [];
          for (const s of summaries) {
            try {
              const record = await engine.readSession(s.id);
              if (isDocs(record.config))
                items.push({
                  ...s,
                  title:
                    record.history
                      .find((m) => m.role === "user")
                      ?.content.slice(0, 100) || "未开始的会话",
                  active: !!record.activeRun,
                });
            } catch (e) {
              if (
                !(e instanceof AgentEngineError) ||
                !["ACCESS_DENIED", "DATA_RETENTION_EXPIRED"].includes(e.code)
              )
                throw e;
            }
          }
          json(res, 200, { items });
          return true;
        }
        const sessionRoute = /^\/sessions\/([a-f0-9-]{36})$/.exec(route);
        if (sessionRoute) {
          const sid = z.uuid().parse(sessionRoute[1]),
            record = await engine.readSession(sid);
          if (!isDocs(record.config))
            throw new AgentEngineError("ACCESS_DENIED");
          if (req.method === "GET") {
            const snapshot = await engine.inspectSession(sid),
              cfg = (await (await engine.loadSession(sid)).getEffectiveConfig())
                .value;
            const events = await engine.listEvents(sid, {
              afterSequence: Math.max(0, snapshot.snapshotSequence - 1000),
              throughSequence: snapshot.snapshotSequence,
              limit: 1000,
            });
            json(res, 200, {
              snapshot: {
                ...snapshot,
                events: events.events,
                eventsTruncated: snapshot.snapshotSequence > 1000,
              },
              configuration: {
                loop: cfg.loop,
                retry: cfg.retry,
                context: cfg.context,
                budgets: cfg.budgets,
                routing: cfg.routing,
                tools: cfg.tools.map((t) => ({
                  name: t.name,
                  permission: t.permission,
                  executor: t.execution.type,
                })),
                skills: cfg.skills.map((s) => s.id),
                knowledge: cfg.knowledgeBases.map((k) => k.id),
                memory: cfg.memory.stores.map((m) => ({
                  id: m.id,
                  read: m.read,
                  write: !!m.write,
                })),
                interaction: cfg.interaction,
              },
            });
            return true;
          }
          const v = z
            .strictObject({
              action: z.enum(["archive", "unarchive", "delete"]),
            })
            .parse(await body(req));
          if (record.activeRun) {
            json(res, 409, { error: { code: "RUN_ALREADY_ACTIVE" } });
            return true;
          }
          const s = await engine.loadSession(sid);
          if (v.action === "delete") await engine.deleteSession(sid);
          else if (v.action === "archive") await s.archive();
          else await s.unarchive();
          json(res, 200, { accepted: true });
          return true;
        }
        if (route === "/experiments" && req.method === "GET") {
          const items = await engine.options.store.transaction(async (tx) =>
            (await tx.list<Report>(reportTable))
              .filter((r) => r.owner === owner)
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 20)
              .map((r) => ({
                id: r.id,
                input: r.input,
                createdAt: r.createdAt,
                state:
                  r.state === "running" && r.instance !== instance
                    ? "failed"
                    : r.state,
                passed: r.result?.passed,
                error:
                  r.state === "running" && r.instance !== instance
                    ? "HOST_RESTARTED"
                    : r.error,
              })),
          );
          json(res, 200, { items });
          return true;
        }
        if (route === "/experiments" && req.method === "POST") {
          const v = experimentInput.parse(await body(req)),
            key = owner + ":" + v.requestId;
          if (closing) throw new AgentEngineError("ENGINE_CLOSED");
          const report = await engine.options.store.transaction(async (tx) => {
            const old = await tx.get<Report>(reportTable, key);
            if (old) {
              if (JSON.stringify(old.input) !== JSON.stringify(v))
                throw new AgentEngineError("CONFIG_VERSION_CONFLICT");
              return { value: old, start: false };
            }
            const own = (await tx.list<Report>(reportTable))
              .filter((r) => r.owner === owner)
              .sort((a, b) => a.createdAt - b.createdAt);
            if (
              own.some(
                (r) => r.state === "running" && r.instance === instance,
              ) ||
              active.size >= 4 ||
              !options.allow("lab:" + owner)
            )
              throw new AgentEngineError("ENGINE_BUSY");
            for (const row of own.slice(0, Math.max(0, own.length - 19)))
              await tx.remove(reportTable, owner + ":" + row.id);
            const value: Report = {
              id: v.requestId,
              owner,
              instance,
              createdAt: Date.now(),
              input: v,
              state: "running",
            };
            await tx.put(reportTable, key, value);
            return { value, start: true };
          });
          if (report.start) {
            const work = (async () => {
              try {
                const result = await runDocsExperiment(v);
                await engine.options.store.transaction((tx) =>
                  tx.put(reportTable, key, {
                    ...report.value,
                    state: "completed",
                    result,
                  }),
                );
              } catch (e) {
                await engine.options.store.transaction((tx) =>
                  tx.put(reportTable, key, {
                    ...report.value,
                    state: "failed",
                    error:
                      e instanceof AgentEngineError
                        ? e.code
                        : "EXPERIMENT_ERROR",
                  }),
                );
              }
            })();
            active.add(work);
            void work.catch(() => {}).finally(() => active.delete(work));
          }
          json(res, 202, { id: report.value.id });
          return true;
        }
        const reportRoute = /^\/experiments\/([a-f0-9-]{36})$/.exec(route);
        if (req.method === "GET" && reportRoute) {
          const id = z.uuid().parse(reportRoute[1]),
            record = await engine.options.store.transaction((tx) =>
              tx.get<Report>(reportTable, owner + ":" + id),
            );
          if (!record) throw new AgentEngineError("ACCESS_DENIED");
          json(res, 200, {
            id: record.id,
            createdAt: record.createdAt,
            input: record.input,
            state:
              record.state === "running" && record.instance !== instance
                ? "failed"
                : record.state,
            result: record.result,
            error:
              record.state === "running" && record.instance !== instance
                ? "HOST_RESTARTED"
                : record.error,
          });
          return true;
        }
        json(res, 404, { error: { code: "NOT_FOUND" } });
      } catch (e) {
        const code =
          e instanceof AgentEngineError
            ? e.code
            : e instanceof z.ZodError
              ? "CONFIG_INVALID"
              : "DOCS_SERVER_ERROR";
        json(
          res,
          code === "ACCESS_DENIED"
            ? 403
            : code === "ENGINE_BUSY"
              ? 429
              : ["MEMORY_VERSION_CONFLICT", "CONFIG_VERSION_CONFLICT"].includes(
                    code,
                  )
                ? 409
                : code === "CONFIG_INVALID"
                  ? 400
                  : 500,
          { error: { code } },
        );
      }
      return true;
    },
    async close() {
      closing = true;
      await Promise.allSettled([...active]);
    },
  };
}
