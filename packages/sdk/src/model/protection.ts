import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import {
  canonical,
  type JsonValue,
  type JsonObject,
} from "../protocol/json.js";
import { AgentEngineError, fail } from "../errors/index.js";
export function seal(
  value: JsonValue,
  key: string,
  binding: JsonObject,
): JsonValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(key).digest(),
    iv,
  );
  cipher.setAAD(Buffer.from(canonical(binding)));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    binding,
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
export function unseal(
  value: JsonValue,
  key: string,
  binding: JsonObject,
): JsonValue {
  try {
    const v = value as JsonObject;
    if (v.version !== 1 || !v.binding) fail("MODEL_CONTINUATION_UNAVAILABLE");
    const stored = v.binding as JsonObject;
    if (
      stored.tenantId !== binding.tenantId ||
      stored.subjectId !== binding.subjectId ||
      stored.sessionId !== binding.sessionId
    )
      fail("MODEL_CONTINUATION_UNAVAILABLE");
    if (canonical(stored) !== canonical(binding))
      fail("MODEL_HISTORY_INCOMPATIBLE");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(key).digest(),
      Buffer.from(String(v.iv), "base64"),
    );
    decipher.setAAD(Buffer.from(canonical(binding)));
    decipher.setAuthTag(Buffer.from(String(v.tag), "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(String(v.encrypted), "base64")),
        decipher.final(),
      ]).toString("utf8"),
    ) as JsonValue;
  } catch (error) {
    if (error instanceof AgentEngineError) throw error;
    return fail("MODEL_CONTINUATION_UNAVAILABLE");
  }
}
