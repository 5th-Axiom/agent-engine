import { randomUUID } from "node:crypto";
import type { EngineStore, StoreTransaction } from "@agent-runtime/sdk";
import { parseEvent, type AgentEvent } from "@agent-runtime/sdk";
import { Mutex } from "@agent-runtime/sdk";
import { fail } from "@agent-runtime/sdk";
export class MemoryStore implements EngineStore {
  readonly durable = false;
  private held = false;
  private mutex = new Mutex();
  private records = new Map<string, unknown>();
  private log: AgentEvent[] = [];
  private heads = new Map<string, number>();
  async acquire() {
    if (this.held) fail("ENGINE_BUSY");
    this.held = true;
  }
  async assertHeld() {
    if (!this.held) fail("STORE_LOCK_LOST");
  }
  async close() {
    this.held = false;
  }
  async transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    return this.mutex.use(async () => {
      await this.assertHeld();
      const records = structuredClone(this.records),
        log = structuredClone(this.log),
        heads = structuredClone(this.heads);
      const tx: StoreTransaction = {
        get: async <T>(t: string, k: string) =>
          structuredClone(records.get(`${t}\0${k}`)) as T | undefined,
        put: async (t, k, v) => {
          records.set(`${t}\0${k}`, structuredClone(v));
        },
        remove: async (t, k) => {
          records.delete(`${t}\0${k}`);
        },
        list: async <T>(t: string) =>
          Array.from(records)
            .filter(([k]) => k.startsWith(`${t}\0`))
            .map(([, v]) => structuredClone(v) as T),
        pruneEvents: async (s, n) => {
          for (let i = log.length - 1; i >= 0; i--)
            if (log[i]!.sessionId === s && log[i]!.sequence <= n)
              log.splice(i, 1);
        },
        head: async (s) => heads.get(s) ?? 0,
        events: async (s, a, h = Number.MAX_SAFE_INTEGER, n = 500) =>
          structuredClone(
            log
              .filter(
                (e) => e.sessionId === s && e.sequence > a && e.sequence <= h,
              )
              .slice(0, n),
          ),
        append: async (s, e) => {
          const value = parseEvent({
            ...e,
            id: randomUUID(),
            schemaVersion: "1",
            sessionId: s,
            sequence: (await tx.head(s)) + 1,
            timestamp: new Date().toISOString(),
          });
          log.push(value);
          heads.set(s, value.sequence);
          return structuredClone(value);
        },
      };
      const result = await fn(tx);
      this.records = records;
      this.log = log;
      this.heads = heads;
      return result;
    });
  }
}
