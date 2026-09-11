import { Pool, type PoolClient } from "pg";
import { Mutex } from "../run/state.js";
import { randomUUID } from "node:crypto";
import { AgentEngineError, fail } from "../errors/index.js";
import {
  parseEvent,
  type AgentEvent,
  type NewEvent,
} from "../protocol/events.js";
import type { EngineStore, StoreTransaction } from "./store.js";
const LOCK = 719254381;
const SCHEMA = 1;
export class PostgresStore implements EngineStore {
  readonly durable = true;
  private owner?: PoolClient;
  private alive = false;
  private ownerQueries = new Mutex();
  constructor(readonly pool: Pool) {}
  static fromConnectionString(connectionString: string): PostgresStore {
    return new PostgresStore(new Pool({ connectionString, max: 8 }));
  }
  async migrate(): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const migrationLock = await c.query<{ held: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1) AS held",
        [LOCK],
      );
      if (!migrationLock.rows[0]!.held)
        fail("ENGINE_BUSY", "Cannot migrate an active Engine database");
      await c.query(
        "CREATE TABLE IF NOT EXISTS ae_schema(version integer NOT NULL)",
      );
      const versions = await c.query<{ version: number }>(
        "SELECT version FROM ae_schema",
      );
      if (
        versions.rows.length &&
        (versions.rows.length !== 1 || versions.rows[0]!.version !== SCHEMA)
      )
        fail("RECOVERY_DEPENDENCY_MISMATCH", "Unsupported database schema");
      await c.query(
        "CREATE TABLE IF NOT EXISTS ae_records(kind text NOT NULL, key text NOT NULL, value jsonb NOT NULL, PRIMARY KEY(kind,key))",
      );
      await c.query(
        "CREATE TABLE IF NOT EXISTS ae_streams(session_id text PRIMARY KEY, sequence bigint NOT NULL DEFAULT 0)",
      );
      await c.query(
        "CREATE TABLE IF NOT EXISTS ae_events(session_id text NOT NULL, sequence bigint NOT NULL, value jsonb NOT NULL, PRIMARY KEY(session_id,sequence))",
      );
      if (!versions.rows.length)
        await c.query("INSERT INTO ae_schema(version) VALUES ($1)", [SCHEMA]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async acquire(): Promise<void> {
    if (this.owner) fail("ENGINE_BUSY");
    const c = await this.pool.connect();
    try {
      const lock = await c.query<{ held: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS held",
        [LOCK],
      );
      if (!lock.rows[0]!.held)
        fail("ENGINE_BUSY", "Another Engine owns this database");
      const version = await c.query<{ version: number }>(
        "SELECT version FROM ae_schema",
      );
      if (version.rows.length !== 1 || version.rows[0]!.version !== SCHEMA)
        fail("RECOVERY_DEPENDENCY_MISMATCH");
      this.owner = c;
      this.alive = true;
      c.on("error", () => {
        this.alive = false;
      });
      c.on("end", () => {
        this.alive = false;
      });
    } catch (e) {
      c.release(true);
      throw e;
    }
  }
  async assertHeld(): Promise<void> {
    if (!this.alive || !this.owner) fail("STORE_LOCK_LOST");
    try {
      await this.ownerQueries.use(async () => {
        if (!this.owner) fail("STORE_LOCK_LOST");
        await this.owner.query("SELECT 1");
      });
    } catch {
      this.alive = false;
      fail("STORE_LOCK_LOST");
    }
  }
  async transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    await this.assertHeld();
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // Serializes short state transactions, never external I/O. Also orders admissions across Sessions.
      await c.query("SELECT pg_advisory_xact_lock($1)", [LOCK + 1]);
      const result = await fn(new PgTransaction(c));
      await this.assertHeld();
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      if (e instanceof AgentEngineError) throw e;
      throw new AgentEngineError("STORE_UNAVAILABLE");
    } finally {
      c.release();
    }
  }
  async close(): Promise<void> {
    const c = this.owner;
    this.owner = undefined;
    this.alive = false;
    if (c) {
      try {
        await c.query("SELECT pg_advisory_unlock($1)", [LOCK]);
      } catch {
        // A lost management connection already released its server-side lock.
      } finally {
        c.release(true);
      }
    }
    await this.pool.end();
  }
}
class PgTransaction implements StoreTransaction {
  constructor(private c: PoolClient) {}
  async get<T>(table: string, key: string): Promise<T | undefined> {
    return (
      await this.c.query<{ value: T }>(
        "SELECT value FROM ae_records WHERE kind=$1 AND key=$2",
        [table, key],
      )
    ).rows[0]?.value;
  }
  async put<T>(table: string, key: string, value: T): Promise<void> {
    await this.c.query(
      "INSERT INTO ae_records(kind,key,value) VALUES($1,$2,$3) ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value",
      [table, key, JSON.stringify(value)],
    );
  }
  async remove(table: string, key: string): Promise<void> {
    await this.c.query("DELETE FROM ae_records WHERE kind=$1 AND key=$2", [
      table,
      key,
    ]);
  }
  async list<T>(table: string): Promise<T[]> {
    return (
      await this.c.query<{ value: T }>(
        "SELECT value FROM ae_records WHERE kind=$1 ORDER BY key",
        [table],
      )
    ).rows.map((r) => r.value);
  }
  async append(sessionId: string, event: NewEvent): Promise<AgentEvent> {
    const row = await this.c.query<{ sequence: string }>(
      "INSERT INTO ae_streams(session_id,sequence) VALUES($1,1) ON CONFLICT(session_id) DO UPDATE SET sequence=ae_streams.sequence+1 RETURNING sequence",
      [sessionId],
    );
    const value = parseEvent({
      ...event,
      id: randomUUID(),
      sessionId,
      sequence: Number(row.rows[0]!.sequence),
      schemaVersion: "1",
      timestamp: new Date().toISOString(),
    });
    await this.c.query(
      "INSERT INTO ae_events(session_id,sequence,value) VALUES($1,$2,$3)",
      [sessionId, value.sequence, JSON.stringify(value)],
    );
    return value;
  }
  async events(
    sessionId: string,
    after: number,
    through = Number.MAX_SAFE_INTEGER,
    limit = 500,
  ): Promise<AgentEvent[]> {
    return (
      await this.c.query<{ value: AgentEvent }>(
        "SELECT value FROM ae_events WHERE session_id=$1 AND sequence>$2 AND sequence<=$3 ORDER BY sequence LIMIT $4",
        [sessionId, after, through, limit],
      )
    ).rows.map((r) => r.value);
  }
  async pruneEvents(sessionId: string, throughSequence: number): Promise<void> {
    await this.c.query(
      "DELETE FROM ae_events WHERE session_id=$1 AND sequence<=$2",
      [sessionId, throughSequence],
    );
  }
  async head(sessionId: string): Promise<number> {
    return Number(
      (
        await this.c.query<{ sequence: string }>(
          "SELECT sequence FROM ae_streams WHERE session_id=$1",
          [sessionId],
        )
      ).rows[0]?.sequence ?? 0,
    );
  }
}
