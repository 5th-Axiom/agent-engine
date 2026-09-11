import { createChatId } from "./identity.js";
import {
  ChatError,
  errorCode,
  isActiveRun,
  type ChatConfig,
  type ChatSession,
  type ChatSessionSummary,
  type ChatTransport,
} from "./protocol.js";

export interface ChatState {
  connection: "connecting" | "ready" | "disconnected";
  config?: ChatConfig;
  assistantId?: string;
  sessions: ChatSessionSummary[];
  session?: ChatSession;
  draft: string;
  sending: boolean;
  cancelling: boolean;
  pending: boolean;
  awaitingRunId?: string;
  error?: string;
}
export interface SessionMemory {
  read(): string | null;
  write(id: string | null): void;
}
/** Opt-in, account-scoped ID storage. No messages, model keys or authentication tokens are stored. */
export function createSessionMemory(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  accountScope: string,
): SessionMemory {
  if (!accountScope.trim()) throw new ChatError("CHAT_ACCOUNT_SCOPE_REQUIRED");
  const key = "agent-chat:session:" + accountScope;
  return {
    read: () => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (id) => {
      try {
        if (id) storage.setItem(key, id);
        else storage.removeItem(key);
      } catch {
        /* Storage is optional. */
      }
    },
  };
}
interface Pending {
  createId: string;
  requestId: string;
  input: string;
  assistantId: string;
  sessionId?: string;
}
export const chatBusy = (state: ChatState) =>
  state.sending ||
  !!state.awaitingRunId ||
  !!state.session?.runs.some(isActiveRun);

/** UI-independent owner of request ordering, draft state, polling and cancellation. */
export class ChatController {
  private state: ChatState = {
    connection: "connecting",
    sessions: [],
    draft: "",
    sending: false,
    cancelling: false,
    pending: false,
  };
  private listeners = new Set<(state: ChatState) => void>();
  private lifetime = new AbortController();
  private viewRequest?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private pending?: Pending;
  private sessionId?: string;
  private disposed = false;
  private started = false;
  private refreshNumber = 0;
  constructor(
    readonly transport: ChatTransport,
    private options: {
      memory?: SessionMemory;
      assistantId?: string;
      activePollMs?: number;
      idlePollMs?: number;
    } = {},
  ) {}
  get snapshot(): ChatState {
    return structuredClone(this.state);
  }
  subscribe(listener: (state: ChatState) => void): () => void {
    if (this.disposed) throw new ChatError("CHAT_DISPOSED");
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }
  private emit() {
    if (!this.disposed)
      for (const listener of this.listeners) {
        try {
          listener(this.snapshot);
        } catch {
          /* Host callbacks cannot break state progression. */
        }
      }
  }
  private assertLive() {
    if (this.disposed) throw new ChatError("CHAT_DISPOSED");
  }
  private fail(error: unknown) {
    this.state.error = errorCode(error);
    this.state.connection = "disconnected";
    if (
      error instanceof ChatError &&
      (error.status === 401 || error.status === 403)
    ) {
      this.state.session = undefined;
      this.state.sessions = [];
      this.sessionId = undefined;
      this.options.memory?.write(null);
    }
  }
  async start(): Promise<void> {
    this.assertLive();
    if (this.started) return;
    this.started = true;
    await this.reconnect();
  }
  async reconnect(): Promise<void> {
    this.assertLive();
    if (this.state.sending) throw new ChatError("CHAT_SEND_PENDING");
    const generation = ++this.generation;
    this.viewRequest?.abort();
    clearTimeout(this.timer);
    this.state.connection = "connecting";
    this.emit();
    try {
      const config = await this.transport.getConfig(this.lifetime.signal);
      if (this.disposed || generation !== this.generation) return;
      const selected = this.state.assistantId
        ? config.assistants.some((a) => a.id === this.state.assistantId)
          ? this.state.assistantId
          : config.defaultAssistant
        : (this.options.assistantId ?? config.defaultAssistant);
      if (!config.assistants.some((a) => a.id === selected))
        throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE");
      this.state.config = config;
      this.state.assistantId = selected;
      this.sessionId ??= this.options.memory?.read() ?? undefined;
      this.state.error = undefined;
      this.state.connection = "ready";
      await this.refresh();
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.fail(error);
    } finally {
      if (!this.disposed && generation === this.generation) {
        this.emit();
        this.schedule();
      }
    }
  }
  setDraft(value: string) {
    this.assertLive();
    if (this.state.sending || this.pending) return;
    this.state.draft = value.slice(0, 8000);
    this.emit();
  }
  newSession(assistantId = this.state.assistantId) {
    this.assertLive();
    if (this.state.sending || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    if (!this.state.config?.assistants.some((a) => a.id === assistantId))
      throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE");
    ++this.generation;
    this.viewRequest?.abort();
    this.sessionId = undefined;
    this.options.memory?.write(null);
    this.state = {
      ...this.state,
      session: undefined,
      assistantId,
      draft: "",
      error: undefined,
      awaitingRunId: undefined,
      cancelling: false,
    };
    this.emit();
    this.schedule();
  }
  async selectSession(id: string) {
    this.assertLive();
    if (this.state.sending || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    ++this.generation;
    this.viewRequest?.abort();
    this.sessionId = id;
    this.options.memory?.write(id);
    this.state.session = undefined;
    this.state.draft = "";
    this.state.error = undefined;
    this.state.awaitingRunId = undefined;
    this.emit();
    await this.refresh();
    this.schedule();
  }
  async send(input = this.state.draft) {
    this.assertLive();
    if (chatBusy(this.state) || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    const text = input.trim();
    if (!text || text.length > 8000) throw new ChatError("INVALID_INPUT");
    if (!this.state.assistantId) throw new ChatError("CHAT_NOT_READY");
    this.pending = {
      input: text,
      assistantId: this.state.assistantId,
      createId: createChatId(),
      requestId: createChatId(),
      sessionId: this.sessionId,
    };
    await this.dispatch();
  }
  async retrySend() {
    this.assertLive();
    if (!this.pending || this.state.sending) return;
    await this.dispatch();
  }
  /** Stops local retrying only. An already accepted server Run can still be running. */
  discardPending() {
    this.assertLive();
    if (this.state.sending) return;
    this.pending = undefined;
    this.state.pending = false;
    this.state.error = undefined;
    this.emit();
  }
  private async dispatch() {
    const pending = this.pending!;
    const generation = this.generation;
    this.state.sending = true;
    this.state.pending = true;
    this.state.error = undefined;
    this.emit();
    try {
      if (!pending.sessionId) {
        const created = await this.transport.createSession(
          { requestId: pending.createId, assistantId: pending.assistantId },
          this.lifetime.signal,
        );
        if (this.disposed) return;
        pending.sessionId = created.id;
        this.sessionId = created.id;
        this.options.memory?.write(created.id);
      }
      const sent = await this.transport.sendMessage(
        pending.sessionId,
        { requestId: pending.requestId, input: pending.input },
        this.lifetime.signal,
      );
      if (this.disposed || generation !== this.generation) return;
      this.state.awaitingRunId = sent.runId;
      this.state.draft = "";
      this.pending = undefined;
      this.state.pending = false;
      this.state.connection = "ready";
      this.state.error = undefined;
      await this.refresh();
    } catch (error) {
      if (!this.disposed) this.fail(error);
    } finally {
      if (!this.disposed) {
        this.state.sending = false;
        this.emit();
        this.schedule();
      }
    }
  }
  async cancel() {
    this.assertLive();
    const run = this.state.session?.runs.findLast(isActiveRun);
    if (!run || !this.sessionId || this.state.cancelling) return;
    const generation = this.generation;
    this.state.cancelling = true;
    this.emit();
    try {
      await this.transport.cancelRun(
        this.sessionId,
        run.id,
        this.lifetime.signal,
      );
      if (!this.disposed && generation === this.generation)
        await this.refresh();
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.fail(error);
    } finally {
      if (!this.disposed && generation === this.generation) {
        this.state.cancelling = false;
        this.emit();
      }
    }
  }
  async refresh(): Promise<void> {
    this.assertLive();
    const generation = this.generation;
    const number = ++this.refreshNumber;
    const id = this.sessionId;
    this.viewRequest?.abort();
    const request = (this.viewRequest = new AbortController());
    const abort = () => request.abort();
    this.lifetime.signal.addEventListener("abort", abort, { once: true });
    try {
      const [sessions, session] = await Promise.all([
        this.transport.listSessions(request.signal),
        id ? this.transport.readSession(id, request.signal) : undefined,
      ]);
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation ||
        number !== this.refreshNumber
      )
        return;
      this.state.sessions = sessions;
      if (session) {
        if (session.id !== id) throw new ChatError("CHAT_INVALID_RESPONSE");
        if (
          this.state.session?.id === id &&
          session.snapshotSequence < this.state.session.snapshotSequence
        )
          return;
        this.state.session = session;
        this.state.assistantId = session.assistantId;
        if (session.runs.some((r) => r.id === this.state.awaitingRunId))
          this.state.awaitingRunId = undefined;
      }
      this.state.connection = "ready";
      if (!this.pending) this.state.error = undefined;
      this.emit();
    } catch (error) {
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation ||
        number !== this.refreshNumber
      )
        return;
      this.fail(error);
      this.emit();
    } finally {
      this.lifetime.signal.removeEventListener("abort", abort);
    }
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.disposed) return;
    const delay = chatBusy(this.state)
      ? (this.options.activePollMs ?? 450)
      : (this.options.idlePollMs ?? 2500);
    this.timer = setTimeout(
      async () => {
        await this.refresh();
        this.schedule();
      },
      Math.max(50, delay),
    );
  }
  dispose(options: { clearSession?: boolean } = {}) {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.lifetime.abort();
    this.viewRequest?.abort();
    this.listeners.clear();
    if (options.clearSession) this.options.memory?.write(null);
    this.pending = undefined;
    this.state = {
      connection: "disconnected",
      sessions: [],
      draft: "",
      sending: false,
      cancelling: false,
      pending: false,
    };
  }
}
