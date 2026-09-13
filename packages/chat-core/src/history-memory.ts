import {
  ChatError,
  sessionsSchema,
  type ChatSessionSummary,
} from "./protocol.js";

/** Optional summary cache. The host must supply a server-verified account/namespace scope. */
export interface SessionListMemory {
  read(): ChatSessionSummary[] | null;
  write(sessions: ChatSessionSummary[] | null): void;
}

/** Five-minute, 100-row cache of summaries only. Prefer sessionStorage; never an authorization source. */
export function createSessionListMemory(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  accountScope: string,
): SessionListMemory {
  if (!accountScope.trim()) throw new ChatError("CHAT_ACCOUNT_SCOPE_REQUIRED");
  const key = "agent-chat:history:" + accountScope;
  const maxAge = 5 * 60_000;
  // A UTF-16 character bound also bounds UTF-8 storage to at most 256 KiB.
  const maxLength = 64 * 1024;
  const clear = () => {
    try {
      storage.removeItem(key);
    } catch {}
  };
  return {
    read() {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        if (raw.length > maxLength) throw Error();
        const saved = JSON.parse(raw);
        const age = Date.now() - saved.savedAt;
        if (
          saved.version !== 1 ||
          !Number.isFinite(saved.savedAt) ||
          age < 0 ||
          age >= maxAge
        )
          throw Error();
        const sessions = sessionsSchema.max(100).parse(saved.sessions);
        if (new Set(sessions.map((s) => s.id)).size !== sessions.length)
          throw Error();
        return sessions;
      } catch {
        clear();
        return null;
      }
    },
    write(sessions) {
      if (sessions === null) {
        clear();
        return;
      }
      try {
        // Schemas strip unknown fields, so messages and host-specific payloads never enter storage.
        const summaries = sessionsSchema.parse(sessions.slice(0, 100));
        const raw = JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          sessions: summaries,
        });
        if (raw.length > maxLength) {
          clear();
          return;
        }
        storage.setItem(key, raw);
      } catch {
        clear();
      }
    },
  };
}
