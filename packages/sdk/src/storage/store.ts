import type { AgentEvent, NewEvent } from "../protocol/events.js";
export interface StoreTransaction {
  get<T>(table: string, key: string): Promise<T | undefined>;
  put<T>(table: string, key: string, value: T): Promise<void>;
  remove(table: string, key: string): Promise<void>;
  list<T>(table: string): Promise<T[]>;
  /** Optional indexed read of records whose sessionId equals the supplied ID. Not an authorization check. */
  listBySession?<T>(table: string, sessionId: string): Promise<T[]>;
  append(sessionId: string, event: NewEvent): Promise<AgentEvent>;
  events(
    sessionId: string,
    after: number,
    through?: number,
    limit?: number,
  ): Promise<AgentEvent[]>;
  head(sessionId: string): Promise<number>;
  pruneEvents(sessionId: string, throughSequence: number): Promise<void>;
}
export interface EngineStore {
  readonly durable: boolean;
  acquire(): Promise<void>;
  assertHeld(): Promise<void>;
  transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
