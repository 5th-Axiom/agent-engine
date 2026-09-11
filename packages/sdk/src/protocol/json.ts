import { createHash } from "node:crypto";
import { fail } from "../errors/index.js";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export function json(value: unknown): JsonValue {
  const seen = new Set<object>();
  const visit = (v: unknown): JsonValue => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || !v || seen.has(v))
      return fail("CONFIG_INVALID", "Expected acyclic, finite JSON values");
    seen.add(v);
    let result: JsonValue;
    if (Array.isArray(v)) result = v.map(visit);
    else {
      if (
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      )
        fail("CONFIG_INVALID", "Class instances are not configuration");
      const out: JsonObject = {};
      for (const k of Object.keys(v).sort()) {
        if (["__proto__", "constructor", "prototype"].includes(k))
          fail("CONFIG_INVALID", "Unsafe object key");
        out[k] = visit((v as Record<string, unknown>)[k]);
      }
      result = out;
    }
    seen.delete(v);
    return result;
  };
  return visit(value);
}
export function canonical(value: unknown): string {
  return JSON.stringify(json(value));
}
export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function clone<T>(value: T): T {
  return structuredClone(value);
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value;
}
