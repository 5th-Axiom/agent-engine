import { createChatId } from "./identity.js";
import type { SessionListMemory } from "./history-memory.js";
import {
  ChatError,
  errorCode,
  isActiveRun,
  type ChatConfig,
  type ChatImage,
  type ChatSession,
  type ChatSessionSummary,
  type ChatTransport,
  type ChatInputResolution,
} from "./protocol.js";

export interface DraftImage {
  id: string;
  name: string;
  preview: string;
  status: "uploading" | "ready" | "failed";
  attachment?: ChatImage;
  error?: string;
}
/** Local feedback only; an accepted submission is replaced by its authoritative Run. */
export interface ChatSubmission {
  requestId: string;
  input: string;
  attachments?: ChatImage[];
  status: "sending" | "accepted" | "unconfirmed";
  runId?: string;
}
export interface ChatState {
  contextRef?: string;
  preparingSession?: boolean;
  modelId?: string;
  skillId?: string;
  images?: DraftImage[];
  connection: "connecting" | "ready" | "disconnected";
  config?: ChatConfig;
  assistantId?: string;
  sessions: ChatSessionSummary[];
  selectedSessionId?: string;
  loadingSession?: boolean;
  historyError?: string;
  /** At least one list snapshot is available, including a valid empty cache. */
  historyLoaded?: boolean;
  session?: ChatSession;
  submission?: ChatSubmission;
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
  contextRef?: string;
  modelId?: string;
  skillId?: string;
  attachments?: ChatImage[];
  createId: string;
  requestId: string;
  input: string;
  assistantId: string;
  sessionId?: string;
}
export const chatBusy = (state: ChatState) =>
  state.sending ||
  state.preparingSession === true ||
  state.loadingSession === true ||
  !!state.awaitingRunId ||
  !!state.session?.runs.some(isActiveRun);

export const composerCatalog = (state: ChatState) => {
  const assistant = state.config?.assistants.find(
    (a) => a.id === state.assistantId,
  );
  return {
    models: state.session?.models ?? assistant?.models,
    skills: state.session?.skills ?? assistant?.skills,
    defaultModelId: state.session?.defaultModelId ?? assistant?.defaultModelId,
  };
};
export const selectedChatModel = (state: ChatState) => {
  const catalog = composerCatalog(state);
  return catalog.models?.find(
    (model) => model.id === (state.modelId ?? catalog.defaultModelId),
  );
};

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
  private imageFiles = new Map<string, Blob>();
  private uploads = new Map<string, AbortController>();
  private listeners = new Set<(state: ChatState) => void>();
  private lifetime = new AbortController();
  private viewRequest?: AbortController;
  private historyRequest?: {
    controller: AbortController;
    promise: Promise<void>;
  };
  private historyReadAt = 0;
  private cache = new Map<string, { session: ChatSession; bytes: number }>();
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private pending?: Pending;
  private sessionId?: string;
  private preparationId?: string;
  private disposed = false;
  private unauthorized = false;
  private started = false;
  private refreshNumber = 0;
  constructor(
    readonly transport: ChatTransport,
    private options: {
      memory?: SessionMemory;
      historyMemory?: SessionListMemory;
      assistantId?: string;
      activePollMs?: number;
      idlePollMs?: number;
    } = {},
  ) {
    try {
      const sessions = options.historyMemory?.read();
      if (sessions) {
        this.state.sessions = structuredClone(sessions);
        this.state.historyLoaded = true;
        const selected = options.memory?.read();
        if (sessions.some((session) => session.id === selected))
          this.state.selectedSessionId = selected ?? undefined;
      }
    } catch {
      /* Optional host storage cannot prevent mounting. */
    }
  }
  private rememberHistory(sessions: ChatSessionSummary[] | null) {
    try {
      this.options.historyMemory?.write(sessions);
    } catch {
      /* Optional cache. */
    }
  }
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
      this.clearImages();
      this.unauthorized = true;
      clearTimeout(this.timer);
      ++this.generation;
      this.viewRequest?.abort();
      this.historyRequest?.controller.abort();
      this.cache.clear();
      this.state.session = undefined;
      this.state.sessions = [];
      this.state.historyLoaded = false;
      this.rememberHistory(null);
      this.state.selectedSessionId = undefined;
      this.state.loadingSession = false;
      this.state.submission = undefined;
      this.state.awaitingRunId = undefined;
      this.state.sending = false;
      this.state.cancelling = false;
      this.state.historyError = undefined;
      this.state.modelId = undefined;
      this.state.skillId = undefined;
      this.sessionId = undefined;
      this.options.memory?.write(null);
      this.emit();
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
    this.historyRequest?.controller.abort();
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
      this.unauthorized = false;
      this.state.assistantId = selected;
      this.sessionId ??= this.options.memory?.read() ?? undefined;
      this.state.selectedSessionId = this.sessionId;
      this.state.loadingSession = !!this.sessionId;
      this.state.error = undefined;
      this.state.connection = "ready";
      await this.refresh();
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.fail(error);
        this.emit();
      }
    } finally {
      if (!this.disposed && generation === this.generation) {
        this.emit();
        this.schedule();
      }
    }
  }
  async addImages(files: readonly File[]) {
    this.assertLive();
    if (this.pending || this.state.sending)
      throw new ChatError("CHAT_SEND_PENDING");
    if (
      (selectedChatModel(this.state)?.supportsImages ??
        this.state.session?.supportsImages ??
        this.state.config?.assistants.find(
          (a) => a.id === this.state.assistantId,
        )?.supportsImages) === false
    )
      throw new ChatError("MODEL_CAPABILITY_MISMATCH");
    if (!this.state.config?.images || !this.transport.uploadImage)
      throw new ChatError("MODEL_CAPABILITY_MISMATCH");
    if (
      (this.state.images?.length ?? 0) + files.length >
      this.state.config.images.maxPerMessage
    )
      throw new ChatError("IMAGE_INVALID");
    for (const file of files) {
      if (
        !file.size ||
        file.size > this.state.config.images.maxBytes ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        )
      )
        throw new ChatError("IMAGE_INVALID");
    }
    const ids = files.map((file) => {
      const id = createChatId();
      this.imageFiles.set(id, file);
      (this.state.images ??= []).push({
        id,
        name: file.name,
        preview: URL.createObjectURL(file),
        status: "uploading",
      });
      return id;
    });
    this.emit();
    await Promise.all(ids.map((id) => this.retryImage(id)));
  }
  async retryImage(id: string) {
    this.assertLive();
    if (this.pending || this.state.sending || this.uploads.has(id)) return;
    const image = this.state.images?.find((v) => v.id === id),
      file = this.imageFiles.get(id);
    if (!image || !file || !this.transport.uploadImage) return;
    const controller = new AbortController();
    this.uploads.set(id, controller);
    image.status = "uploading";
    image.error = undefined;
    this.emit();
    try {
      const ref = await this.transport.uploadImage(file, controller.signal);
      if (!this.disposed && this.state.images?.includes(image)) {
        image.attachment = ref;
        image.status = "ready";
      }
    } catch (error) {
      if (!this.disposed && this.state.images?.includes(image)) {
        image.status = "failed";
        image.error = errorCode(error);
      }
    } finally {
      this.uploads.delete(id);
      this.emit();
    }
  }
  removeImage(id: string) {
    if (this.pending || this.state.sending) return;
    this.uploads.get(id)?.abort();
    this.uploads.delete(id);
    const image = this.state.images?.find((v) => v.id === id);
    if (image) URL.revokeObjectURL(image.preview);
    this.state.images = this.state.images?.filter((v) => v.id !== id);
    this.imageFiles.delete(id);
    this.emit();
  }
  private clearImages() {
    for (const upload of this.uploads.values()) upload.abort();
    this.uploads.clear();
    for (const image of this.state.images ?? [])
      URL.revokeObjectURL(image.preview);
    this.imageFiles.clear();
    this.state.images = [];
  }
  setDraft(value: string) {
    this.assertLive();
    if (this.state.sending || this.state.preparingSession || this.pending)
      return;
    this.state.draft = value.slice(0, 8000);
    this.emit();
  }
  /** Sets the next turn's host-issued scope. A pending submission keeps its original reference. */
  setContextRef(value?: string) {
    this.assertLive();
    if (value !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(value))
      throw new ChatError("INVALID_INPUT");
    this.state.contextRef = value;
    this.emit();
  }
  setModel(id: string) {
    this.assertLive();
    if (this.state.sending || this.state.preparingSession || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    const model = composerCatalog(this.state).models?.find(
      (model) => model.id === id,
    );
    if (!model) throw new ChatError("CHAT_MODEL_UNAVAILABLE");
    if (this.state.images?.length && !model.supportsImages)
      throw new ChatError("MODEL_CAPABILITY_MISMATCH");
    this.state.modelId = id;
    this.state.error = undefined;
    this.emit();
  }
  setSkill(id?: string) {
    this.assertLive();
    if (this.state.sending || this.state.preparingSession || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    if (
      id &&
      !composerCatalog(this.state).skills?.some((skill) => skill.id === id)
    )
      throw new ChatError("CHAT_SKILL_UNAVAILABLE");
    this.state.skillId = id;
    this.emit();
  }
  newSession(assistantId = this.state.assistantId) {
    this.assertLive();
    if (this.state.sending || this.state.preparingSession || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    if (!this.state.config?.assistants.some((a) => a.id === assistantId))
      throw new ChatError("CHAT_ASSISTANT_UNAVAILABLE");
    ++this.generation;
    this.viewRequest?.abort();
    this.viewRequest = undefined;
    this.sessionId = undefined;
    this.preparationId = undefined;
    this.options.memory?.write(null);
    this.clearImages();
    this.state = {
      ...this.state,
      session: undefined,
      selectedSessionId: undefined,
      loadingSession: false,
      submission: undefined,
      assistantId,
      modelId: undefined,
      skillId: undefined,
      draft: "",
      error: undefined,
      awaitingRunId: undefined,
      cancelling: false,
    };
    this.emit();
    this.schedule();
  }
  /** Resolve the current request and refresh authoritative Run state. */
  async resolveInput(input: ChatInputResolution): Promise<void> {
    this.assertLive();
    if (!this.sessionId || !this.transport.resolveInput)
      throw new ChatError("CHAT_INTERACTION_UNAVAILABLE");
    await this.transport.resolveInput(
      this.sessionId,
      input,
      this.lifetime.signal,
    );
    await this.refreshView();
  }
  /** Materialize an empty session for configuration without sending a message. */
  async ensureSession(): Promise<string> {
    this.assertLive();
    if (this.sessionId) return this.sessionId;
    if (this.state.sending || this.state.preparingSession || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    if (!this.state.assistantId) throw new ChatError("CHAT_NOT_READY");
    this.state.preparingSession = true;
    this.emit();
    try {
      this.preparationId ??= createChatId();
      const created = await this.transport.createSession(
        { requestId: this.preparationId, assistantId: this.state.assistantId },
        this.lifetime.signal,
      );
      this.assertLive();
      this.sessionId = created.id;
      this.state.selectedSessionId = created.id;
      this.options.memory?.write(created.id);
      void this.refreshHistory();
      await this.refreshView();
      return created.id;
    } finally {
      this.state.preparingSession = false;
      this.emit();
    }
  }
  async selectSession(id: string) {
    this.assertLive();
    if (this.unauthorized) throw new ChatError("CHAT_NOT_READY");
    if (this.state.sending || this.state.preparingSession || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    ++this.generation;
    this.viewRequest?.abort();
    this.clearImages();
    this.sessionId = id;
    this.state.selectedSessionId = id;
    this.state.loadingSession = true;
    this.options.memory?.write(id);
    const cached = this.cache.get(id);
    this.state.session = cached?.session;
    if (cached) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      this.state.assistantId = cached.session.assistantId;
    }
    this.state.modelId =
      cached?.session.runs.at(-1)?.modelId ?? cached?.session.defaultModelId;
    this.state.skillId = undefined;
    this.state.draft = "";
    this.state.error = undefined;
    this.state.awaitingRunId = undefined;
    this.state.submission = undefined;
    this.state.cancelling = false;
    this.emit();
    void this.refreshHistory();
    await this.refreshView();
    this.schedule();
  }
  async send(input = this.state.draft) {
    this.assertLive();
    if (chatBusy(this.state) || this.pending)
      throw new ChatError("CHAT_SEND_PENDING");
    if (
      this.state.connection !== "ready" ||
      (this.state.selectedSessionId && !this.state.session)
    )
      throw new ChatError("CHAT_NOT_READY");
    const text = input.trim();
    if ((!text && !this.state.images?.length) || text.length > 8000)
      throw new ChatError("INVALID_INPUT");
    if (this.state.images?.some((image) => image.status !== "ready"))
      throw new ChatError("IMAGE_UNAVAILABLE");
    if (!this.state.assistantId) throw new ChatError("CHAT_NOT_READY");
    if (composerCatalog(this.state).models && !selectedChatModel(this.state))
      throw new ChatError("CHAT_MODEL_UNAVAILABLE");
    this.pending = {
      input: text,
      ...(this.state.contextRef ? { contextRef: this.state.contextRef } : {}),
      ...(selectedChatModel(this.state)
        ? { modelId: selectedChatModel(this.state)!.id }
        : {}),
      ...(this.state.skillId ? { skillId: this.state.skillId } : {}),
      ...(this.state.images?.length
        ? { attachments: this.state.images.map((image) => image.attachment!) }
        : {}),
      assistantId: this.state.assistantId,
      createId: this.preparationId ?? createChatId(),
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
    if (this.pending) this.state.submission = undefined;
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
    this.state.submission = {
      requestId: pending.requestId,
      input: pending.input,
      attachments: pending.attachments,
      status: "sending",
    };
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
        this.state.selectedSessionId = created.id;
        this.options.memory?.write(created.id);
      }
      const sent = await this.transport.sendMessage(
        pending.sessionId,
        {
          requestId: pending.requestId,
          input: pending.input,
          ...(pending.contextRef ? { contextRef: pending.contextRef } : {}),
          ...(pending.modelId ? { modelId: pending.modelId } : {}),
          ...(pending.skillId ? { skillId: pending.skillId } : {}),
          ...(pending.attachments?.length
            ? { attachments: pending.attachments }
            : {}),
        },
        this.lifetime.signal,
      );
      if (this.disposed || generation !== this.generation) return;
      this.state.awaitingRunId = sent.runId;
      this.state.submission = {
        ...this.state.submission!,
        status: "accepted",
        runId: sent.runId,
      };
      this.state.draft = "";
      this.state.skillId = undefined;
      this.clearImages();
      this.pending = undefined;
      this.state.pending = false;
      this.state.sending = false;
      this.state.connection = "ready";
      this.state.error = undefined;
      // Acknowledgment must paint before either snapshot or sidebar requests finish.
      this.emit();
      void this.refreshHistory();
      await this.refreshView();
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        if (this.state.submission) this.state.submission.status = "unconfirmed";
        this.fail(error);
      }
    } finally {
      if (!this.disposed && generation === this.generation) {
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
        await this.refreshView();
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
    await Promise.all([this.refreshView(), this.refreshHistory()]);
  }
  private async refreshHistory(): Promise<void> {
    if (this.disposed || this.unauthorized) return;
    if (this.historyRequest && !this.historyRequest.controller.signal.aborted)
      return this.historyRequest.promise;
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.lifetime.signal.addEventListener("abort", abort, { once: true });
    const request = { controller, promise: Promise.resolve() };
    this.historyRequest = request;
    this.historyReadAt = Date.now();
    request.promise = (async () => {
      try {
        const sessions = await this.transport.listSessions(controller.signal);
        if (this.disposed || controller.signal.aborted) return;
        this.state.sessions = sessions;
        this.state.historyLoaded = true;
        this.syncCurrentSummary();
        this.rememberHistory(this.state.sessions);
        this.state.historyError = undefined;
        this.emit();
      } catch (error) {
        if (this.disposed || controller.signal.aborted) return;
        if (
          error instanceof ChatError &&
          [401, 403].includes(error.status ?? 0)
        )
          this.fail(error);
        else this.state.historyError = errorCode(error);
        this.emit();
      } finally {
        this.lifetime.signal.removeEventListener("abort", abort);
        if (this.historyRequest === request) this.historyRequest = undefined;
      }
    })();
    return request.promise;
  }
  private syncCurrentSummary() {
    const session = this.state.session;
    if (!session || this.state.loadingSession || this.state.awaitingRunId)
      return;
    // Current Run snapshots arrive independently of the slower list request.
    // A late list must not resurrect the current conversation's running badge.
    const active = !!session.activeRun || session.runs.some(isActiveRun);
    const existing = this.state.sessions.find(
      (summary) => summary.id === session.id,
    );
    if (existing?.title === session.title && existing.active === active) return;
    this.state.sessions = existing
      ? this.state.sessions.map((summary) =>
          summary.id === session.id
            ? {
                ...summary,
                title: session.title,
                active,
              }
            : summary,
        )
      : [
          {
            id: session.id,
            assistantId: session.assistantId,
            title: session.title,
            createdAt: session.createdAt ?? 0,
            active,
          },
          ...this.state.sessions,
        ];
    this.rememberHistory(this.state.sessions);
  }
  private remember(session: ChatSession) {
    this.cache.delete(session.id);
    const bytes = JSON.stringify(session).length * 2;
    // Bounded, controller-local memory only; never persist conversation contents.
    if (bytes > 4 * 1024 * 1024) return;
    this.cache.set(session.id, { session, bytes });
    let total = [...this.cache.values()].reduce(
      (sum, item) => sum + item.bytes,
      0,
    );
    while (this.cache.size > 5 || total > 4 * 1024 * 1024) {
      const [id, oldest] = this.cache.entries().next().value!;
      total -= oldest.bytes;
      this.cache.delete(id);
    }
  }
  private async refreshView(): Promise<void> {
    if (this.disposed || this.unauthorized) return;
    clearTimeout(this.timer);
    const generation = this.generation;
    const number = ++this.refreshNumber;
    const id = this.sessionId;
    this.viewRequest?.abort();
    const request = (this.viewRequest = new AbortController());
    const abort = () => request.abort();
    this.lifetime.signal.addEventListener("abort", abort, { once: true });
    try {
      const session = id
        ? await this.transport.readSession(id, request.signal)
        : undefined;
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation ||
        number !== this.refreshNumber
      )
        return;
      this.state.loadingSession = false;
      if (session) {
        if (session.id !== id) throw new ChatError("CHAT_INVALID_RESPONSE");
        if (
          this.state.session?.id === id &&
          session.snapshotSequence < this.state.session.snapshotSequence
        ) {
          this.emit();
          return;
        }
        const previous = this.state.session;
        if (
          previous &&
          previous.defaultModelId !== session.defaultModelId &&
          this.state.modelId === previous?.defaultModelId &&
          !this.pending &&
          !this.state.images?.length
        )
          this.state.modelId = session.defaultModelId;
        if (
          !this.pending &&
          this.state.skillId &&
          session.skills &&
          !session.skills.some((s) => s.id === this.state.skillId)
        )
          this.state.skillId = undefined;
        this.state.session = session;
        this.remember(session);
        this.state.assistantId = session.assistantId;
        this.state.modelId ??=
          session.runs.at(-1)?.modelId ?? session.defaultModelId;
        if (session.runs.some((r) => r.id === this.state.awaitingRunId)) {
          this.state.awaitingRunId = undefined;
          this.state.submission = undefined;
        }
        this.syncCurrentSummary();
      }
      if (!this.pending) {
        this.state.connection = "ready";
        this.state.error = undefined;
      }
      this.emit();
    } catch (error) {
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation ||
        number !== this.refreshNumber
      )
        return;
      this.state.loadingSession = false;
      if (
        error instanceof ChatError &&
        (error.status === 404 || error.status === 410)
      ) {
        if (id) this.cache.delete(id);
        this.historyRequest?.controller.abort();
        this.state.session = undefined;
        this.state.sessions = this.state.sessions.filter(
          (summary) => summary.id !== id,
        );
        this.rememberHistory(this.state.sessions);
      }
      this.fail(error);
      this.emit();
    } finally {
      this.lifetime.signal.removeEventListener("abort", abort);
      if (this.viewRequest === request) {
        this.viewRequest = undefined;
        this.schedule();
      }
    }
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.disposed || this.unauthorized || this.viewRequest) return;
    const delay = chatBusy(this.state)
      ? (this.options.activePollMs ?? 250)
      : (this.options.idlePollMs ?? 2500);
    this.timer = setTimeout(
      async () => {
        const started = Date.now();
        if (started - this.historyReadAt >= 5000) void this.refreshHistory();
        await this.refreshView();
        this.schedule();
      },
      Math.max(50, delay),
    );
  }
  dispose(options: { clearSession?: boolean } = {}) {
    if (this.disposed) return;
    this.clearImages();
    this.disposed = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.lifetime.abort();
    this.viewRequest?.abort();
    this.historyRequest?.controller.abort();
    this.cache.clear();
    this.listeners.clear();
    if (options.clearSession) this.options.memory?.write(null);
    if (options.clearSession) this.rememberHistory(null);
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
