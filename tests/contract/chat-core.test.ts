import { afterEach, expect, it, vi } from "vitest";
import {
  ChatController,
  ChatError,
  createHttpChatTransport,
  createSessionMemory,
  type ChatTransport,
  type ChatSession,
  type ChatConfig,
  type ChatSessionSummary,
  selectedChatModel,
} from "@agent-runtime/chat-core";
import { resolveChatTheme, contrast } from "@agent-runtime/chat-ui";
const ids = {
  a: "00000000-0000-4000-8000-000000000001",
  b: "00000000-0000-4000-8000-000000000002",
  run: "00000000-0000-4000-8000-000000000003",
};
const config: ChatConfig = {
  protocolVersion: 1,
  defaultAssistant: "demo",
  maxInputLength: 8000,
  assistants: [{ id: "demo", label: "Demo" }],
};
const session = (id = ids.a): ChatSession => ({
  id,
  assistantId: "demo",
  title: "Synthetic",
  runs: [],
  totalRuns: 0,
  snapshotSequence: 1,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function transport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getConfig: async () => config,
    listSessions: async () => [],
    readSession: async (id) => session(id),
    createSession: async () => ({ id: ids.a }),
    sendMessage: async () => ({ runId: ids.run }),
    cancelRun: async () => ({ accepted: true }),
    ...overrides,
  };
}
const controllers: ChatController[] = [];
function controller(t: ChatTransport) {
  const c = new ChatController(t, { idlePollMs: 60000 });
  controllers.push(c);
  return c;
}
afterEach(() => {
  controllers.splice(0).forEach((c) => c.dispose());
  vi.useRealTimers();
});

it("reuses both request identifiers after lost acceptance, then clears the draft only after acknowledgment", async () => {
  const creates: unknown[] = [];
  const sends: { requestId: string; input: string }[] = [];
  let lostCreate = true,
    lostSend = true;
  const c = controller(
    transport({
      createSession: async (data) => {
        creates.push(data);
        if (lostCreate) {
          lostCreate = false;
          throw new ChatError("CHAT_CONNECTION_FAILED");
        }
        return { id: ids.a };
      },
      sendMessage: async (_id, data) => {
        sends.push(data);
        if (lostSend) {
          lostSend = false;
          throw new ChatError("CHAT_CONNECTION_FAILED");
        }
        return { runId: ids.run };
      },
    }),
  );
  await c.start();
  c.setDraft("你好");
  await c.send();
  expect(c.snapshot.pending).toBe(true);
  expect(c.snapshot.draft).toBe("你好");
  await c.retrySend();
  expect(creates[0]).toEqual(creates[1]);
  expect(c.snapshot.pending).toBe(true);
  await c.retrySend();
  expect(sends[0]).toEqual(sends[1]);
  expect(c.snapshot.pending).toBe(false);
  expect(c.snapshot.draft).toBe("");
  expect(c.snapshot.awaitingRunId).toBe(ids.run);
});
it("ignores delayed session reads after switching to another conversation", async () => {
  const older = deferred<ChatSession>();
  const c = controller(
    transport({
      readSession: (id) =>
        id === ids.a ? older.promise : Promise.resolve(session(id)),
    }),
  );
  await c.start();
  const pending = c.selectSession(ids.a);
  await c.selectSession(ids.b);
  older.resolve(session(ids.a));
  await pending;
  expect(c.snapshot.session?.id).toBe(ids.b);
});
it("shows a frozen submission before acceptance and reconciles only its acknowledged run", async () => {
  const accepted = deferred<{ runId: string }>();
  const firstRead = deferred<ChatSession>();
  const c = controller(
    transport({
      sendMessage: () => accepted.promise,
      readSession: () => firstRead.promise,
    }),
  );
  await c.start();
  c.setDraft("合成即时消息");
  const sending = c.send();
  expect(c.snapshot.submission).toMatchObject({
    input: "合成即时消息",
    status: "sending",
  });
  accepted.resolve({ runId: ids.run });
  await vi.waitFor(() =>
    expect(c.snapshot.submission?.status).toBe("accepted"),
  );
  expect(c.snapshot.draft).toBe("");
  expect(c.snapshot.submission?.input).toBe("合成即时消息");
  firstRead.resolve(session());
  await sending;
  expect(c.snapshot.submission?.runId).toBe(ids.run);
  c.discardPending();
  expect(c.snapshot.submission?.runId).toBe(ids.run);
  c.newSession();
  expect(c.snapshot.submission).toBeUndefined();
});
it("selects cached conversation content immediately while revalidating, without waiting for history", async () => {
  let slow = false;
  const read = deferred<ChatSession>();
  const history = deferred<ChatSessionSummary[]>();
  const c = controller(
    transport({
      listSessions: () => (slow ? history.promise : Promise.resolve([])),
      readSession: (id) => (slow ? read.promise : Promise.resolve(session(id))),
    }),
  );
  await c.start();
  await c.selectSession(ids.a);
  await c.selectSession(ids.b);
  slow = true;
  const selecting = c.selectSession(ids.a);
  expect(c.snapshot.selectedSessionId).toBe(ids.a);
  expect(c.snapshot.session?.id).toBe(ids.a);
  expect(c.snapshot.loadingSession).toBe(true);
  read.resolve({ ...session(ids.a), title: "Updated", snapshotSequence: 2 });
  await selecting;
  expect(c.snapshot.session?.title).toBe("Updated");
  expect(c.snapshot.loadingSession).toBe(false);
  history.resolve([]);
});
it("renders current snapshot updates while the conversation list request is still pending", async () => {
  let slow = false;
  const history = deferred<ChatSessionSummary[]>();
  let sequence = 1;
  const c = controller(
    transport({
      listSessions: () => (slow ? history.promise : Promise.resolve([])),
      readSession: async (id) => ({
        ...session(id),
        snapshotSequence: sequence,
      }),
    }),
  );
  await c.start();
  await c.selectSession(ids.a);
  slow = true;
  sequence = 2;
  const refreshing = c.refresh();
  await vi.waitFor(() => expect(c.snapshot.session?.snapshotSequence).toBe(2));
  history.resolve([]);
  await refreshing;
});
it.each(["completed", "failed", "cancelled"] as const)(
  "updates the sidebar immediately on %s and rejects a stale running badge",
  async (state) => {
    const oldSummary: ChatSessionSummary = {
      id: ids.a,
      assistantId: "demo",
      title: "新对话",
      createdAt: 0,
      active: true,
    };
    const late = deferred<ChatSessionSummary[]>();
    let ending = false;
    const c = controller(
      transport({
        listSessions: () =>
          ending ? late.promise : Promise.resolve([oldSummary]),
        readSession: async () => ({
          ...session(),
          title: ending ? "实际问题" : "新对话",
          snapshotSequence: ending ? 2 : 1,
          activeRun: ending ? undefined : ids.run,
          runs: [
            {
              id: ids.run,
              sequence: 1,
              input: "实际问题",
              output: "",
              draft: "",
              state: ending ? state : "running",
              cancelRequested: false,
              steps: 1,
              attempts: 1,
              operations: [],
              usage: { complete: false, costComplete: false },
            },
          ],
        }),
      }),
    );
    await c.start();
    await c.selectSession(ids.a);
    expect(c.snapshot.sessions[0]?.active).toBe(true);
    ending = true;
    const refresh = c.refresh();
    await vi.waitFor(() =>
      expect(c.snapshot.session?.runs[0]?.state).toBe(state),
    );
    expect(c.snapshot.sessions[0]).toMatchObject({
      active: false,
      title: "实际问题",
    });
    late.resolve([oldSummary]);
    await refresh;
    expect(c.snapshot.sessions[0]).toMatchObject({
      active: false,
      title: "实际问题",
    });
  },
);
it("replaces the accepted echo exactly once when its Run arrives and permits switching during a delayed snapshot", async () => {
  let delayed = false;
  const read = deferred<ChatSession>();
  const c = controller(
    transport({
      readSession: (id) =>
        delayed ? read.promise : Promise.resolve(session(id)),
    }),
  );
  await c.start();
  delayed = true;
  const sending = c.send("即时显示");
  await vi.waitFor(() => expect(c.snapshot.submission?.runId).toBe(ids.run));
  expect(c.snapshot.sending).toBe(false);
  c.newSession();
  read.resolve({
    ...session(),
    runs: [
      {
        id: ids.run,
        sequence: 1,
        input: "即时显示",
        output: "",
        draft: "",
        state: "running",
        cancelRequested: false,
        steps: 1,
        attempts: 1,
        operations: [],
        usage: { complete: false, costComplete: false },
      },
    ],
  });
  await sending;
  expect(c.snapshot.session).toBeUndefined();
  delayed = false;
  await c.send("下一条");
  expect(c.snapshot.submission?.status).toBe("accepted");
  delayed = true;
  await c.refresh();
  expect(c.snapshot.submission).toBeUndefined();
  expect(c.snapshot.awaitingRunId).toBeUndefined();
  expect(c.snapshot.session?.runs).toHaveLength(1);
});
it("blocks sending cached data until revalidation and removes it on expiry or authorization loss", async () => {
  let failure: ChatError | undefined;
  const gate = deferred<ChatSession>();
  let held = false;
  const c = controller(
    transport({
      readSession: async (id) => {
        if (held) return gate.promise;
        if (failure) throw failure;
        return session(id);
      },
    }),
  );
  await c.start();
  await c.selectSession(ids.a);
  c.newSession();
  held = true;
  const selecting = c.selectSession(ids.a);
  expect(c.snapshot.session?.id).toBe(ids.a);
  await expect(c.send("wait for validation")).rejects.toThrow(
    "CHAT_SEND_PENDING",
  );
  gate.resolve(session(ids.a));
  await selecting;
  held = false;
  failure = new ChatError("CHAT_SESSION_NOT_FOUND", 404);
  await c.refresh();
  expect(c.snapshot.session).toBeUndefined();
  c.newSession();
  const expired = c.selectSession(ids.a);
  expect(c.snapshot.session).toBeUndefined();
  await expired;
  failure = undefined;
  await c.selectSession(ids.b);
  failure = new ChatError("ACCESS_DENIED", 403);
  await c.refresh();
  expect(c.snapshot.selectedSessionId).toBeUndefined();
  failure = undefined;
  await c.refresh();
  expect(c.snapshot.connection).toBe("disconnected");
  await c.reconnect();
  const unauthorizedCache = c.selectSession(ids.b);
  expect(c.snapshot.session).toBeUndefined();
  await unauthorizedCache;
});
it("keeps active polling moving and coalesces a stalled sidebar request", async () => {
  vi.useFakeTimers();
  let held = false,
    reads = 0,
    lists = 0;
  const history = deferred<ChatSessionSummary[]>();
  const c = controller(
    transport({
      readSession: async (id) => ({
        ...session(id),
        snapshotSequence: ++reads,
      }),
      listSessions: async () => {
        lists++;
        return held ? history.promise : [];
      },
    }),
  );
  await c.start();
  held = true;
  await c.send("pending Run");
  const listsBefore = lists,
    readsBefore = reads;
  await vi.advanceTimersByTimeAsync(1500);
  expect(reads - readsBefore).toBeGreaterThanOrEqual(5);
  expect(lists).toBe(listsBefore);
  history.resolve([]);
  await Promise.resolve();
});
it("does not let a polling timer abort a slow conversation selection", async () => {
  vi.useFakeTimers();
  const read = deferred<ChatSession>();
  let reads = 0,
    signal: AbortSignal | undefined;
  const c = new ChatController(
    transport({
      readSession: (_id, currentSignal) => {
        reads++;
        signal = currentSignal;
        return read.promise;
      },
    }),
    { idlePollMs: 100 },
  );
  controllers.push(c);
  await c.start();
  const selecting = c.selectSession(ids.a);
  await vi.advanceTimersByTimeAsync(3000);
  expect(reads).toBe(1);
  expect(signal?.aborted).toBe(false);
  read.resolve(session(ids.a));
  await selecting;
  expect(c.snapshot.loadingSession).toBe(false);
});
it("dispose aborts active work and prevents late subscriber updates", async () => {
  const later = deferred<{ id: string }>();
  let signal: AbortSignal | undefined;
  const c = controller(
    transport({
      createSession: async (_data, s) => {
        signal = s;
        return later.promise;
      },
    }),
  );
  await c.start();
  let calls = 0;
  c.subscribe(() => calls++);
  const sent = c.send("等待");
  const before = calls;
  c.dispose();
  later.resolve({ id: ids.a });
  await sent;
  expect(signal?.aborted).toBe(true);
  expect(calls).toBe(before);
  expect(c.snapshot.session).toBeUndefined();
});
it("unauthorized refresh clears visible records and remembers no session ID", async () => {
  let denied = false;
  const values = new Map<string, string>();
  const memory = createSessionMemory(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      },
      removeItem: (k) => {
        values.delete(k);
      },
    },
    "tenant/user",
  );
  const c = new ChatController(
    transport({
      readSession: async (id) => {
        if (denied) throw new ChatError("ACCESS_DENIED", 403);
        return session(id);
      },
    }),
    { memory, idlePollMs: 60000 },
  );
  controllers.push(c);
  await c.start();
  await c.selectSession(ids.a);
  expect(memory.read()).toBe(ids.a);
  denied = true;
  await c.refresh();
  expect(c.snapshot.session).toBeUndefined();
  expect(memory.read()).toBeNull();
});
it("HTTP transport re-evaluates business headers, strips extra fields and refuses raw error payloads", async () => {
  let count = 0;
  const headers: string[] = [];
  const fake: typeof fetch = async (_input, init) => {
    headers.push(new Headers(init?.headers).get("authorization")!);
    return Response.json({ ...config, apiKey: "synthetic-private-field" });
  };
  const t = createHttpChatTransport({
    baseURL: "https://chat.example/api",
    fetch: fake,
    headers: () => ({ authorization: "Bearer business-" + ++count }),
  });
  expect(await t.getConfig()).toEqual(config);
  await t.getConfig();
  expect(headers).toEqual(["Bearer business-1", "Bearer business-2"]);
  const bad = createHttpChatTransport({
    baseURL: "https://chat.example/api",
    fetch: async () =>
      Response.json(
        { error: { code: "secret body content" } },
        { status: 500 },
      ),
  });
  await expect(bad.getConfig()).rejects.toMatchObject({
    code: "CHAT_REQUEST_FAILED",
  });
  const expired = createHttpChatTransport({
    baseURL: "https://chat.example/api",
    fetch: async () => new Response("<html>login page</html>", { status: 401 }),
  });
  await expect(expired.getConfig()).rejects.toMatchObject({
    code: "CHAT_UNAUTHENTICATED",
    status: 401,
  });
  expect(() =>
    createHttpChatTransport({ baseURL: "https://user:password@example.com" }),
  ).toThrow("CHAT_INVALID_URL");
});
it("theme skins and arbitrary brand colors retain readable semantic pairs", () => {
  for (const mode of ["light", "dark"] as const)
    for (const skin of ["workbench", "rounded"] as const)
      for (const accent of [
        "#0758a0",
        "#d1471b",
        "#ffffff",
        "#000000",
        "#27a37c",
      ]) {
        const theme = resolveChatTheme({ mode, skin, accent });
        expect(contrast(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(theme.text, theme.canvas)).toBeGreaterThanOrEqual(4.5);
      }
  expect(resolveChatTheme({ mode: "system" }, true).canvas).toBe(
    resolveChatTheme({ mode: "dark" }).canvas,
  );
  expect(() =>
    resolveChatTheme({ accent: "url(https://bad.example)" }),
  ).toThrow("CHAT_INVALID_COLOR");
  expect(() => resolveChatTheme({ tokens: { text: "#ffffff" } })).toThrow(
    "CHAT_THEME_CONTRAST",
  );
});

it("async authentication headers time out or abort without a late dispatch", async () => {
  for (const cancel of [false, true]) {
    let release!: (value: HeadersInit) => void,
      calls = 0;
    const headers = new Promise<HeadersInit>((resolve) => {
      release = resolve;
    });
    const controller = new AbortController();
    const transport = createHttpChatTransport({
      baseURL: "https://app.example.com/api/chat",
      timeoutMs: 30,
      headers: () => headers,
      fetch: async () => {
        calls++;
        throw new Error("Must not dispatch");
      },
    });
    const result = transport.getConfig(controller.signal);
    if (cancel) controller.abort();
    await expect(result).rejects.toMatchObject({
      code: cancel ? "CHAT_ABORTED" : "CHAT_REQUEST_TIMEOUT",
    });
    release({ authorization: "synthetic" });
    await Promise.resolve();
    expect(calls).toBe(0);
  }
});

const composerOptions = {
  defaultModelId: "text",
  models: [
    { id: "text", label: "文字", supportsImages: false, thinking: false },
    { id: "vision", label: "视觉", supportsImages: true, thinking: false },
  ],
  skills: [{ id: "guide", label: "接入指南" }],
};
const composerConfig: ChatConfig = {
  ...config,
  assistants: [{ ...config.assistants[0]!, ...composerOptions }],
};

it("freezes the chosen model and skill across lost acceptance and restores the last run without overwriting the next draft selection", async () => {
  const sent: unknown[] = [];
  let lost = true;
  const c = controller(
    transport({
      getConfig: async () => composerConfig,
      readSession: async (id) => ({
        ...session(id),
        ...composerOptions,
        runs: [
          {
            id: ids.run,
            sequence: 1,
            input: "说明接入",
            output: "完成",
            draft: "",
            state: "completed",
            modelId: "vision",
            cancelRequested: false,
            steps: 1,
            attempts: 1,
            operations: [],
            usage: { complete: false, costComplete: false },
          },
        ],
      }),
      sendMessage: async (_id, data) => {
        sent.push(data);
        if (lost) {
          lost = false;
          throw new ChatError("CHAT_CONNECTION_FAILED");
        }
        return { runId: ids.run };
      },
    }),
  );
  await c.start();
  expect(selectedChatModel(c.snapshot)?.id).toBe("text");
  c.setModel("vision");
  c.setSkill("guide");
  await c.send("说明接入");
  expect(() => c.setModel("text")).toThrow("CHAT_SEND_PENDING");
  expect(() => c.setSkill()).toThrow("CHAT_SEND_PENDING");
  await c.retrySend();
  expect(sent[0]).toEqual(sent[1]);
  expect(sent[0]).toMatchObject({ modelId: "vision", skillId: "guide" });
  expect(c.snapshot.skillId).toBeUndefined();
  c.setModel("text");
  c.setDraft("下一条草稿");
  await c.refresh();
  expect(c.snapshot).toMatchObject({ modelId: "text", draft: "下一条草稿" });
  await c.selectSession(ids.a);
  expect(selectedChatModel(c.snapshot)?.id).toBe("vision");
  c.newSession();
  expect(selectedChatModel(c.snapshot)?.id).toBe("text");
  expect(() => c.setModel("undeclared")).toThrow("CHAT_MODEL_UNAVAILABLE");
  expect(() => c.setSkill("undeclared")).toThrow("CHAT_SKILL_UNAVAILABLE");
});

it("does not discard an image draft when a text-only model is selected", async () => {
  const c = controller(
    transport({
      getConfig: async () => ({
        ...composerConfig,
        images: { maxBytes: 10000, maxPerMessage: 4 },
      }),
      uploadImage: async () => ({ type: "image", attachmentId: ids.b }),
    }),
  );
  await c.start();
  await expect(
    c.addImages([new File(["x"], "test.png", { type: "image/png" })]),
  ).rejects.toThrow("MODEL_CAPABILITY_MISMATCH");
  c.setModel("vision");
  c.setDraft("看图");
  await c.addImages([new File(["x"], "test.png", { type: "image/png" })]);
  expect(() => c.setModel("text")).toThrow("MODEL_CAPABILITY_MISMATCH");
  expect(c.snapshot.images).toHaveLength(1);
  expect(c.snapshot).toMatchObject({ modelId: "vision", draft: "看图" });
});

it("prepares one configurable session without a message, guards concurrent edits, and preserves the draft", async () => {
  const gate = deferred<{ id: string }>();
  const creates: unknown[] = [];
  let sends = 0;
  const c = controller(
    transport({
      createSession: async (input) => {
        creates.push(input);
        return gate.promise;
      },
      sendMessage: async () => {
        sends++;
        return { runId: ids.run };
      },
    }),
  );
  await c.start();
  c.setDraft("keep this draft");
  const preparing = c.ensureSession();
  expect(c.snapshot.preparingSession).toBe(true);
  await expect(c.send()).rejects.toMatchObject({ code: "CHAT_SEND_PENDING" });
  expect(() => c.newSession()).toThrow("CHAT_SEND_PENDING");
  gate.resolve({ id: ids.a });
  expect(await preparing).toBe(ids.a);
  expect(await c.ensureSession()).toBe(ids.a);
  expect(creates).toHaveLength(1);
  expect(sends).toBe(0);
  expect(c.snapshot.draft).toBe("keep this draft");
  expect(c.snapshot.preparingSession).toBe(false);
});
