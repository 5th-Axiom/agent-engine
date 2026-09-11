import { fail } from "../errors/index.js";
export const runStates = [
  "queued",
  "running",
  "awaiting_input",
  "awaiting_tool_resolution",
  "recovering",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RunState = (typeof runStates)[number];
const edges: Record<RunState, readonly RunState[]> = {
  queued: ["running", "cancelled", "failed", "recovering"],
  running: [
    "awaiting_input",
    "awaiting_tool_resolution",
    "recovering",
    "completed",
    "failed",
    "cancelled",
  ],
  awaiting_input: ["running", "cancelled", "failed", "recovering"],
  awaiting_tool_resolution: ["running", "cancelled", "failed", "recovering"],
  recovering: [
    "running",
    "awaiting_input",
    "awaiting_tool_resolution",
    "failed",
    "cancelled",
  ],
  completed: [],
  failed: [],
  cancelled: [],
};
export function terminal(state: RunState): boolean {
  return ["completed", "failed", "cancelled"].includes(state);
}
export function transition(from: RunState, to: RunState): RunState {
  if (!edges[from].includes(to))
    fail("INTERNAL_ERROR", `Illegal run transition ${from} -> ${to}`);
  return to;
}
export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async use<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
export class RunLocks {
  private locks = new Map<string, Mutex>();
  async use<T>(id: string, fn: () => Promise<T>): Promise<T> {
    let lock = this.locks.get(id);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(id, lock);
    }
    return lock.use(fn);
  }
}
export class Semaphore {
  private active = 0;
  private queue: {
    signal: AbortSignal;
    resolve: (release: () => void) => void;
    reject: (reason: unknown) => void;
    abort: () => void;
  }[] = [];
  constructor(private max: number) {
    if (!Number.isSafeInteger(max) || max < 1)
      fail("CONFIG_INVALID", "Invalid concurrency limit");
  }
  acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        resolve,
        reject,
        abort: () => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) this.queue.splice(index, 1);
          reject(signal.reason);
        },
      };
      if (this.active < this.max) {
        this.active++;
        resolve(this.release());
        return;
      }
      signal.addEventListener("abort", entry.abort, { once: true });
      this.queue.push(entry);
    });
  }
  private release() {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.queue.shift();
      if (next) {
        next.signal.removeEventListener("abort", next.abort);
        next.resolve(this.release());
      } else this.active--;
    };
  }
}
