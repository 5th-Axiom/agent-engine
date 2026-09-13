import { afterEach, expect, it, vi } from "vitest";
import {
  ChatController,
  ChatError,
  type ChatSession,
  type ChatTransport,
} from "@agent-runtime/chat-core";

const ids = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const summary = (id: string) => ({
  id,
  assistantId: "demo",
  title: "合成会话",
  createdAt: 1,
  active: false,
});
const session = (id: string): ChatSession => ({
  ...summary(id),
  runs: [],
  totalRuns: 0,
  snapshotSequence: 1,
});
const controllers: ChatController[] = [];
const fixture = (
  readSession: ChatTransport["readSession"],
  prefetchHistory = false,
) => {
  const c = new ChatController(
    {
      getConfig: async () => ({
        protocolVersion: 1,
        defaultAssistant: "demo",
        maxInputLength: 8000,
        assistants: [{ id: "demo", label: "合成助手" }],
      }),
      listSessions: async () => ids.map(summary),
      readSession,
      createSession: async () => ({ id: ids[0]! }),
      sendMessage: async () => ({ runId: ids[0]! }),
      cancelRun: async () => ({ accepted: true }),
    },
    { prefetchHistory, idlePollMs: 60000 },
  );
  controllers.push(c);
  return c;
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
afterEach(() => {
  controllers.splice(0).forEach((c) => c.dispose());
  vi.useRealTimers();
});

it("warms at most four recent sessions while idle without selecting or changing a draft", async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  const c = fixture(async (id) => {
    calls.push(id);
    return session(id);
  }, true);
  await c.start();
  c.setDraft("合成未发送草稿");
  await vi.advanceTimersByTimeAsync(149);
  expect(calls).toEqual([]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toEqual(ids.slice(0, 4));
  expect(c.snapshot.session).toBeUndefined();
  expect(c.snapshot.selectedSessionId).toBeUndefined();
  expect(c.snapshot.draft).toBe("合成未发送草稿");
  await c.refresh();
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toHaveLength(4);
});
it("shows a prefetched body synchronously and still revalidates before allowing a send", async () => {
  const read = deferred<ChatSession>();
  let held = false;
  const c = fixture(async (id) => (held ? read.promise : session(id)));
  await c.start();
  await c.prefetchSession(ids[0]!);
  held = true;
  const select = c.selectSession(ids[0]!);
  expect(c.snapshot.session?.id).toBe(ids[0]);
  expect(c.snapshot.loadingSession).toBe(true);
  await expect(c.send("合成问题")).rejects.toThrow("CHAT_SEND_PENDING");
  read.resolve({
    ...session(ids[0]!),
    snapshotSequence: 2,
    title: "最新合成标题",
  });
  await select;
  expect(c.snapshot.session?.title).toBe("最新合成标题");
  expect(c.snapshot.loadingSession).toBe(false);
});
it("promotes an in-flight prefetch on click instead of starting a duplicate read", async () => {
  const read = deferred<ChatSession>();
  const calls: string[] = [];
  const c = fixture(async (id) => {
    calls.push(id);
    return read.promise;
  });
  await c.start();
  const prefetch = c.prefetchSession(ids[0]!);
  const select = c.selectSession(ids[0]!);
  expect(calls).toEqual([ids[0]]);
  read.resolve(session(ids[0]!));
  await Promise.all([prefetch, select]);
  expect(c.snapshot.session?.id).toBe(ids[0]);
  expect(c.snapshot.loadingSession).toBe(false);
});
it("starts a fresh read when refresh interrupts an already promoted prefetch", async () => {
  const read = deferred<ChatSession>();
  let calls = 0;
  let signal: AbortSignal | undefined;
  const c = fixture(async (id, s) => {
    calls++;
    if (calls === 1) {
      signal = s;
      return read.promise;
    }
    return { ...session(id), snapshotSequence: 2 };
  });
  await c.start();
  const prefetch = c.prefetchSession(ids[0]!);
  const select = c.selectSession(ids[0]!);
  await c.refresh();
  expect(signal?.aborted).toBe(true);
  expect(calls).toBe(2);
  read.resolve(session(ids[0]!));
  await Promise.all([prefetch, select]);
  expect(c.snapshot.session?.snapshotSequence).toBe(2);
  expect(c.snapshot.connection).toBe("ready");
  expect(c.snapshot.error).toBeUndefined();
});
it("aborts a promoted read on another click and never renders its late response", async () => {
  const read = deferred<ChatSession>();
  let signal: AbortSignal | undefined;
  const c = fixture(async (id, s) => {
    if (id === ids[0]) {
      signal = s;
      return read.promise;
    }
    return session(id);
  });
  await c.start();
  const prefetch = c.prefetchSession(ids[0]!);
  const select = c.selectSession(ids[0]!);
  await c.selectSession(ids[1]!);
  expect(signal?.aborted).toBe(true);
  read.resolve(session(ids[0]!));
  await Promise.all([prefetch, select]);
  expect(c.snapshot.session?.id).toBe(ids[1]);
});
it("prioritizes the selected conversation over idle warming and skips unknown session IDs", async () => {
  vi.useFakeTimers();
  const read = deferred<ChatSession>();
  const calls: string[] = [];
  const c = fixture(async (id) => {
    calls.push(id);
    return id === ids[0] ? read.promise : session(id);
  }, true);
  await c.start();
  await c.prefetchSession("not-in-sidebar");
  expect(calls).toEqual([]);
  const select = c.selectSession(ids[0]!);
  await vi.advanceTimersByTimeAsync(2000);
  expect(calls).toEqual([ids[0]]);
  read.resolve(session(ids[0]!));
  await select;
  await vi.advanceTimersByTimeAsync(1000);
  expect(c.snapshot.session?.id).toBe(ids[0]);
  expect(calls).toEqual(ids.slice(0, 5));
});
it("does not evict visited conversations to make room for speculative content", async () => {
  let held = false;
  const read = deferred<ChatSession>();
  const calls: string[] = [];
  const c = fixture(async (id) => {
    calls.push(id);
    return held ? read.promise : session(id);
  });
  await c.start();
  for (const id of ids.slice(0, 5)) await c.selectSession(id);
  await c.prefetchSession(ids[5]!);
  expect(calls).not.toContain(ids[5]);
  held = true;
  const select = c.selectSession(ids[0]!);
  expect(c.snapshot.session?.id).toBe(ids[0]);
  read.resolve(session(ids[0]!));
  await select;
});
it.each([403, 404, 410, 500])(
  "keeps the selected conversation intact after a speculative HTTP %s failure",
  async (status) => {
    const c = fixture(async (id) => {
      if (id === ids[1]) throw new ChatError("ACCESS_DENIED", status);
      return session(id);
    });
    await c.start();
    await c.selectSession(ids[0]!);
    await c.prefetchSession(ids[1]!);
    expect(c.snapshot.session?.id).toBe(ids[0]);
    expect(c.snapshot.connection).toBe("ready");
    expect(c.snapshot.error).toBeUndefined();
  },
);
it("clears the visible session on a speculative authentication failure", async () => {
  const c = fixture(async (id) => {
    if (id === ids[1]) throw new ChatError("CHAT_UNAUTHENTICATED", 401);
    return session(id);
  });
  await c.start();
  await c.selectSession(ids[0]!);
  await c.prefetchSession(ids[1]!);
  expect(c.snapshot.session).toBeUndefined();
  expect(c.snapshot.sessions).toEqual([]);
  expect(c.snapshot.connection).toBe("disconnected");
});
it.each(["reconnect", "dispose"] as const)(
  "discards prefetch completions after %s",
  async (action) => {
    let held = true;
    let signal: AbortSignal | undefined;
    const read = deferred<ChatSession>();
    const c = fixture(async (id, s) => {
      signal = s;
      return held ? read.promise : session(id);
    });
    await c.start();
    const prefetch = c.prefetchSession(ids[0]!);
    if (action === "reconnect") await c.reconnect();
    else c.dispose();
    expect(signal?.aborted).toBe(true);
    read.resolve(session(ids[0]!));
    await prefetch;
    expect(c.snapshot.session).toBeUndefined();
    if (action === "reconnect") {
      held = false;
      const select = c.selectSession(ids[0]!);
      expect(c.snapshot.session).toBeUndefined();
      await select;
    }
  },
);
