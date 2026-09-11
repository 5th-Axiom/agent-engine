import { Decimal } from "decimal.js";
import type { ProviderUsage } from "../model/types.js";
import type { ModelConfig } from "../config/schema.js";
import { fail } from "../errors/index.js";
export interface UsageRecord {
  id: string;
  messageId?: string;
  sessionId: string;
  runId: string;
  stepId: string;
  attemptId: string;
  provider: string;
  model: string;
  dispatchState: "not_sent" | "sent" | "unknown";
  revision: number;
  tokens: ProviderUsage;
  cost: { estimated?: string; currency?: string };
  pricing?: ModelConfig["pricing"];
  status: "unknown" | "provisional" | "final";
  source: "unknown" | "provider";
  seen: string[];
  reservation: { input: number; output: number; cost?: string };
}
export function updateUsage(
  record: UsageRecord,
  usage: ProviderUsage,
  mode: "snapshot" | "delta",
  final: boolean,
  sourceEventId?: string,
): boolean {
  for (const [key, n] of Object.entries(usage))
    if (
      ![
        "input",
        "uncachedInput",
        "cacheReadInput",
        "cacheWriteInput",
        "output",
        "reasoning",
        "total",
      ].includes(key) ||
      !Number.isSafeInteger(n) ||
      n! < 0
    )
      fail("MODEL_PROTOCOL_ERROR", "Invalid usage");
  if (record.status === "final" && !final) return false;
  if (
    mode === "snapshot" &&
    JSON.stringify(record.tokens) ===
      JSON.stringify({
        ...usage,
        ...(usage.input !== undefined && usage.output !== undefined
          ? { total: usage.input + usage.output }
          : {}),
      }) &&
    record.status === (final ? "final" : "provisional")
  )
    return false;
  if (
    mode === "delta" &&
    (!sourceEventId || record.seen.includes(sourceEventId))
  )
    return false;
  const next = { ...record.tokens };
  if (mode === "delta") {
    if (record.seen.length >= 10000)
      fail("MODEL_PROTOCOL_ERROR", "Usage deduplication limit reached");
    for (const [k, v] of Object.entries(usage)) {
      const key = k as keyof ProviderUsage;
      next[key] = (next[key] ?? 0) + v;
    }
  }
  const t = mode === "delta" ? next : { ...usage };
  for (const value of Object.values(t))
    if (!Number.isSafeInteger(value)) fail("MODEL_PROTOCOL_ERROR");
  if (
    usage.total !== undefined &&
    usage.input !== undefined &&
    usage.output !== undefined &&
    usage.total !== usage.input + usage.output
  )
    fail("MODEL_PROTOCOL_ERROR", "Usage total disagrees with partitions");
  if (t.input !== undefined && t.output !== undefined)
    t.total = t.input + t.output;
  if (
    t.reasoning !== undefined &&
    t.output !== undefined &&
    t.reasoning > t.output
  )
    fail("MODEL_PROTOCOL_ERROR", "Reasoning must be an output subset");
  if (
    t.input !== undefined &&
    [t.uncachedInput, t.cacheReadInput, t.cacheWriteInput].every(
      (v) => v !== undefined,
    ) &&
    t.uncachedInput! + t.cacheReadInput! + t.cacheWriteInput! !== t.input
  )
    fail("MODEL_PROTOCOL_ERROR", "Input token partitions disagree");
  record.tokens = t;
  if (mode === "delta") record.seen.push(sourceEventId!);
  record.status = final ? "final" : "provisional";
  record.source = "provider";
  record.revision++;
  return true;
}
export function price(
  tokens: ProviderUsage,
  pricing: ModelConfig["pricing"],
): { estimated?: string; currency?: string } {
  if (!pricing) return {};
  let total = new Decimal(0);
  const fields = [
    ["uncachedInput", "uncachedInputPerMillion"],
    ["cacheReadInput", "cacheReadInputPerMillion"],
    ["cacheWriteInput", "cacheWriteInputPerMillion"],
    ["output", "outputPerMillion"],
  ] as const;
  for (const [token, key] of fields) {
    const n = tokens[token];
    if (n === undefined) return { currency: pricing.currency };
    if (n === 0) continue;
    const rate = pricing[key];
    if (rate === undefined) return { currency: pricing.currency };
    total = total.plus(new Decimal(n).mul(rate).div(1_000_000));
  }
  return { estimated: total.toFixed(), currency: pricing.currency };
}
export function conservativeCost(
  input: number,
  output: number,
  pricing: ModelConfig["pricing"],
): string | undefined {
  if (
    !pricing ||
    [
      pricing.uncachedInputPerMillion,
      pricing.cacheReadInputPerMillion,
      pricing.cacheWriteInputPerMillion,
      pricing.outputPerMillion,
    ].some((v) => v === undefined)
  )
    return;
  const max = Math.max(
    pricing.uncachedInputPerMillion!,
    pricing.cacheReadInputPerMillion!,
    pricing.cacheWriteInputPerMillion!,
  );
  return new Decimal(input)
    .mul(max)
    .plus(new Decimal(output).mul(pricing.outputPerMillion!))
    .div(1_000_000)
    .toFixed();
}
export function summarize(records: UsageRecord[]) {
  const consumed = records.filter((r) => r.dispatchState !== "not_sent");
  const knownTotals: ProviderUsage = {};
  const costByCurrency: Record<
    string,
    { estimated: string; complete: boolean }
  > = Object.create(null);
  for (const r of consumed) {
    for (const [k, v] of Object.entries(r.tokens)) {
      const key = k as keyof ProviderUsage;
      knownTotals[key] = (knownTotals[key] ?? 0) + v;
    }
    if (r.cost.currency) {
      const group = (costByCurrency[r.cost.currency] ??= {
        estimated: "0",
        complete: true,
      });
      if (r.cost.estimated !== undefined)
        group.estimated = new Decimal(group.estimated)
          .plus(r.cost.estimated)
          .toFixed();
      else group.complete = false;
      if (r.status !== "final") group.complete = false;
    }
  }
  return {
    knownTotals,
    complete: consumed.every(
      (r) =>
        r.status === "final" &&
        r.tokens.input !== undefined &&
        r.tokens.output !== undefined &&
        r.tokens.total !== undefined,
    ),
    revision: records.reduce((a, r) => a + r.revision, 0),
    attemptCount: records.length,
    costByCurrency,
    costComplete: consumed.every(
      (r) =>
        r.status === "final" &&
        r.cost.estimated !== undefined &&
        !!r.cost.currency,
    ),
    attempts: records,
  };
}
