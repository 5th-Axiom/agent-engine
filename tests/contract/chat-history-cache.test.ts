import { afterEach, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ChatController,
  ChatError,
  createSessionListMemory,
  type ChatTransport,
  type ChatSessionSummary,
} from "@agent-runtime/chat-core";
import { visitorCookies } from "../../examples/docs-site/server.js";

const row: ChatSessionSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  assistantId: "demo",
  title: "合成对话",
  createdAt: 1,
  active: false,
};
const storage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
const controllers: ChatController[] = [];
afterEach(() => {
  controllers.splice(0).forEach((c) => c.dispose());
  vi.useRealTimers();
});

it("bounds persisted summaries, strips unknown payloads and separates account/namespace scopes", () => {
  const s = storage(),
    a = createSessionListMemory(s, "tenant/a/docs"),
    b = createSessionListMemory(s, "tenant/b/docs");
  a.write([
    {
      ...row,
      messages: "synthetic-not-for-cache",
      credential: "synthetic-not-for-cache",
    } as ChatSessionSummary,
  ]);
  expect(a.read()).toEqual([row]);
  expect([...s.values.values()].join()).not.toContain(
    "synthetic-not-for-cache",
  );
  expect(b.read()).toBeNull();
  a.write(
    Array.from({ length: 120 }, (_, i) => ({
      ...row,
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    })),
  );
  expect(a.read()).toHaveLength(100);
  a.write([{ ...row, title: "大".repeat(70_000) }]);
  expect(a.read()).toBeNull();
});
it("accepts a cached empty result but rejects expired, future, corrupt and duplicate summaries", () => {
  vi.useFakeTimers();
  const s = storage(),
    memory = createSessionListMemory(s, "account");
  memory.write([]);
  expect(memory.read()).toEqual([]);
  memory.write([row]);
  vi.advanceTimersByTime(300_000);
  expect(memory.read()).toBeNull();
  memory.write([row]);
  vi.setSystemTime(Date.now() - 1);
  expect(memory.read()).toBeNull();
  s.setItem("agent-chat:history:account", "broken");
  expect(memory.read()).toBeNull();
  memory.write([row, row]);
  expect(memory.read()).toBeNull();
  expect(s.values.size).toBe(0);
});
it("tolerates denied browser storage", () => {
  const fail = () => {
    throw Error("storage unavailable");
  };
  const memory = createSessionListMemory(
    { getItem: fail, setItem: fail, removeItem: fail },
    "account",
  );
  expect(memory.read()).toBeNull();
  expect(() => memory.write([row])).not.toThrow();
  expect(() => memory.write(null)).not.toThrow();
  expect(() => createSessionListMemory(storage(), " ")).toThrow(
    "CHAT_ACCOUNT_SCOPE_REQUIRED",
  );
});
function fixture(memory: ReturnType<typeof createSessionListMemory>) {
  let resolve!: (rows: ChatSessionSummary[]) => void;
  let reject!: (error: unknown) => void;
  const transport = {
    getConfig: async () => ({
      protocolVersion: 1,
      defaultAssistant: "demo",
      maxInputLength: 8000,
      assistants: [{ id: "demo", label: "合成助手" }],
    }),
    listSessions: () =>
      new Promise<ChatSessionSummary[]>((yes, no) => {
        resolve = yes;
        reject = no;
      }),
  } as ChatTransport;
  const controller = new ChatController(transport, {
    historyMemory: memory,
    idlePollMs: 60000,
  });
  controllers.push(controller);
  return {
    controller,
    resolve: (rows: ChatSessionSummary[]) => resolve(rows),
    reject: (error: unknown) => reject(error),
  };
}
it("hydrates synchronously, keeps cached rows during slow revalidation and replaces removed rows authoritatively", async () => {
  const memory = createSessionListMemory(storage(), "account");
  memory.write([row]);
  const f = fixture(memory);
  expect(f.controller.snapshot).toMatchObject({
    sessions: [row],
    historyLoaded: true,
    connection: "connecting",
  });
  const start = f.controller.start();
  await Promise.resolve();
  expect(f.controller.snapshot.sessions).toEqual([row]);
  f.resolve([]);
  await start;
  expect(f.controller.snapshot).toMatchObject({
    sessions: [],
    historyLoaded: true,
  });
  expect(memory.read()).toEqual([]);
  f.controller.dispose();
  expect(memory.read()).toEqual([]);
  const next = fixture(memory);
  next.controller.dispose({ clearSession: true });
  expect(memory.read()).toBeNull();
});
it("distinguishes first load from an empty result and retains data on transient refresh failure", async () => {
  const memory = createSessionListMemory(storage(), "account"),
    f = fixture(memory);
  expect(f.controller.snapshot.historyLoaded).not.toBe(true);
  const start = f.controller.start();
  await Promise.resolve();
  f.resolve([row]);
  await start;
  const refresh = f.controller.refresh();
  f.reject(new ChatError("CHAT_CONNECTION_FAILED"));
  await refresh;
  expect(f.controller.snapshot).toMatchObject({
    sessions: [row],
    historyLoaded: true,
    historyError: "CHAT_CONNECTION_FAILED",
  });
  expect(memory.read()).toEqual([row]);
});
it.each([401, 403])(
  "clears visible and persisted cache on HTTP %s and ignores an aborted late result",
  async (status) => {
    const memory = createSessionListMemory(storage(), "account");
    memory.write([row]);
    const f = fixture(memory);
    const start = f.controller.start();
    await Promise.resolve();
    f.reject(new ChatError("ACCESS_DENIED", status));
    await start;
    expect(f.controller.snapshot.sessions).toEqual([]);
    expect(memory.read()).toBeNull();
    const next = fixture(memory);
    const pending = next.controller.start();
    await Promise.resolve();
    next.controller.dispose({ clearSession: true });
    next.resolve([row]);
    await pending;
    expect(memory.read()).toBeNull();
  },
);
it("adds a verified current session before a slow list finishes and removes expired summaries from storage", async () => {
  const memory = createSessionListMemory(storage(), "account");
  const f = fixture(memory);
  f.controller.transport.readSession = async (id) => ({
    ...row,
    id,
    runs: [],
    totalRuns: 0,
    snapshotSequence: 1,
  });
  const start = f.controller.start();
  await Promise.resolve();
  f.resolve([]);
  await start;
  await f.controller.selectSession(row.id);
  expect(f.controller.snapshot.sessions).toEqual([row]);
  expect(memory.read()).toEqual([row]);
  f.resolve([]);
  await Promise.resolve();
  expect(f.controller.snapshot.sessions).toEqual([row]);
  f.controller.transport.readSession = async () => {
    throw new ChatError("DATA_RETENTION_EXPIRED", 410);
  };
  const refresh = f.controller.refresh();
  await vi.waitFor(() => expect(f.controller.snapshot.session).toBeUndefined());
  expect(memory.read()).toEqual([]);
  f.resolve([row]);
  await refresh;
  expect(f.controller.snapshot.sessions).toEqual([]);
  expect(memory.read()).toEqual([]);
});
it("derives browser cache scope from a verified visitor and rotates it for tampering, expiry or server-secret changes", () => {
  const cookies = visitorCookies("synthetic-cookie-secret");
  let issued = "";
  const response = {
    setHeader: (_name: string, value: string) => {
      issued = value;
    },
  } as unknown as ServerResponse;
  const request = (cookie?: string) =>
    ({ headers: { cookie } }) as IncomingMessage;
  const scope = cookies.cacheScope(request(), response),
    token = issued.split(";")[0]!;
  expect(scope).toMatch(/^[a-f0-9]{64}$/);
  expect(cookies.cacheScope(request(token), response)).toBe(scope);
  expect(cookies.cacheScope(request(token + "bad"), response)).not.toBe(scope);
  expect(cookies.read(request("ae_docs_visitor=" + scope))).toBeNull();
  expect(
    visitorCookies("different-synthetic-secret").cacheScope(
      request(token),
      response,
    ),
  ).not.toBe(scope);
  vi.useFakeTimers();
  vi.advanceTimersByTime(31 * 86400_000);
  expect(cookies.cacheScope(request(token), response)).not.toBe(scope);
});
