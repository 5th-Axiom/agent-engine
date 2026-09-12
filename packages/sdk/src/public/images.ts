import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { fail } from "../errors/index.js";
import { seal, unseal } from "../model/protection.js";
import type { JsonValue } from "../protocol/json.js";
import type { StoreTransaction } from "../storage/store.js";
import type { VerifiedPrincipal, EngineOptions } from "./types.js";

export const imageAttachmentSchema = z.strictObject({
  type: z.literal("image"),
  attachmentId: z.uuid(),
});
export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
export const imageAttachment = (attachmentId: string): ImageAttachment =>
  imageAttachmentSchema.parse({ type: "image", attachmentId });
export const imageMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export type ImageMediaType = (typeof imageMediaTypes)[number];
export const imageLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxPerMessage: 8,
} as const;
/** Frozen metadata only. Inline bytes exist only while dispatching to an adapter. */
export interface ModelImage extends ImageAttachment {
  mediaType: ImageMediaType;
  sha256: string;
  bytes: number;
  expiresAt: string;
  data?: string;
}
/** Optional durable object storage. Values are encrypted; keys are opaque and immutable. */
export interface ImageStorage {
  version: string;
  put(id: string, encrypted: JsonValue): Promise<void>;
  get(id: string): Promise<JsonValue | undefined>;
  remove(id: string): Promise<void>;
}
interface ImageRecord extends Omit<ModelImage, "type" | "data"> {
  principal: VerifiedPrincipal;
  filename: string;
  storageVersion?: string;
  encrypted?: JsonValue;
  purged?: boolean;
}
export interface UploadImageInput {
  data: Uint8Array;
  mediaType: ImageMediaType;
  filename?: string;
  /** Defaults to 30 days; maximum 365 days. Expiry is never silently extended. */
  expiresAt?: string;
}
export function validateImage(data: Uint8Array, mediaType: string) {
  if (!data.byteLength || data.byteLength > imageLimits.maxBytes)
    fail("IMAGE_INVALID", "Image must be between 1 byte and 5 MiB");
  const b = Buffer.from(data);
  const actual = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "image/jpeg"
      : b.toString("ascii", 0, 4) === "RIFF" &&
          b.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : ["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6))
          ? "image/gif"
          : undefined;
  if (actual !== mediaType || !actual)
    fail("IMAGE_INVALID", "Unsupported image or media type mismatch");
}
export function collectImageAttachments(value: JsonValue): ImageAttachment[] {
  const result: ImageAttachment[] = [];
  const visit = (v: JsonValue) => {
    if (!v || typeof v !== "object") return;
    if (!Array.isArray(v) && v.type === "image" && "attachmentId" in v) {
      const parsed = imageAttachmentSchema.safeParse(v);
      if (!parsed.success) fail("IMAGE_INVALID", "Invalid image reference");
      result.push(parsed.data);
    } else for (const child of Object.values(v)) visit(child);
  };
  visit(value);
  const unique = [...new Map(result.map((v) => [v.attachmentId, v])).values()];
  if (unique.length > imageLimits.maxPerMessage)
    fail("IMAGE_INVALID", "At most 8 images per message");
  return unique;
}

export class ImageRepository {
  constructor(
    private host: {
      principal: VerifiedPrincipal;
      transaction: <T>(fn: (tx: StoreTransaction) => Promise<T>) => Promise<T>;
      authorize: (id: string, effect: "read" | "write") => Promise<void>;
      key: () => Promise<string>;
      now: () => number;
      storage?: EngineOptions["imageStorage"];
    },
  ) {}
  private binding(id: string) {
    return { ...this.host.principal, sessionId: `image:${id}` };
  }
  async upload(input: UploadImageInput): Promise<ImageAttachment> {
    input = { ...input, data: new Uint8Array(input.data) };
    validateImage(input.data, input.mediaType);
    await this.host.authorize("image:upload", "write");
    const expires = input.expiresAt
      ? Date.parse(input.expiresAt)
      : this.host.now() + 30 * 86400000;
    if (
      !(expires > this.host.now()) ||
      expires > this.host.now() + 365 * 86400000
    )
      fail("IMAGE_INVALID", "Image expiry must be within the next 365 days");
    const id = randomUUID();
    const encrypted = seal(
      Buffer.from(input.data).toString("base64"),
      await this.host.key(),
      this.binding(id),
    );
    const record: ImageRecord = {
      attachmentId: id,
      principal: this.host.principal,
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      expiresAt: new Date(expires).toISOString(),
      filename: (input.filename ?? "image")
        .replace(/[\x00-\x1f/\\]/g, "_")
        .slice(0, 120),
      ...(this.host.storage
        ? { storageVersion: this.host.storage.version }
        : { encrypted }),
    };
    // Persist the expiry before writing external bytes. A crash or failed upload
    // must still leave enough metadata for the retention sweep to remove them.
    await this.host.transaction((tx) => tx.put("images", id, record));
    if (this.host.storage) await this.host.storage.put(id, encrypted);
    return imageAttachment(id);
  }
  async metadata(
    id: string,
    transaction?: StoreTransaction,
  ): Promise<ImageRecord> {
    if (!z.uuid().safeParse(id).success) fail("IMAGE_INVALID");
    await this.host.authorize(`image:${id}`, "read");
    const record = transaction
      ? await transaction.get<ImageRecord>("images", id)
      : await this.host.transaction((tx) => tx.get<ImageRecord>("images", id));
    if (
      !record ||
      record.principal.tenantId !== this.host.principal.tenantId ||
      record.principal.subjectId !== this.host.principal.subjectId
    )
      fail("ACCESS_DENIED");
    if (Date.parse(record.expiresAt) <= this.host.now()) fail("IMAGE_EXPIRED");
    return record;
  }
  async freeze(refs: ImageAttachment[]): Promise<ModelImage[]> {
    if (refs.length > imageLimits.maxPerMessage) fail("IMAGE_INVALID");
    return Promise.all(
      refs.map(async (ref) => {
        const r = await this.metadata(ref.attachmentId);
        return {
          ...ref,
          mediaType: r.mediaType,
          bytes: r.bytes,
          sha256: r.sha256,
          expiresAt: r.expiresAt,
        };
      }),
    );
  }
  async read(id: string) {
    const record = await this.metadata(id);
    if (record.storageVersion !== this.host.storage?.version)
      fail("RECOVERY_DEPENDENCY_MISMATCH");
    const encrypted = this.host.storage
      ? await this.host.storage.get(id)
      : record.encrypted;
    if (!encrypted) fail("IMAGE_UNAVAILABLE");
    const key = await this.host.key();
    let value: JsonValue;
    try {
      value = unseal(encrypted, key, this.binding(id));
    } catch {
      return fail("IMAGE_UNAVAILABLE");
    }
    if (typeof value !== "string") fail("IMAGE_UNAVAILABLE");
    const data = Buffer.from(value, "base64");
    if (createHash("sha256").update(data).digest("hex") !== record.sha256)
      fail("IMAGE_UNAVAILABLE");
    // Storage and key resolution can await external services.
    await this.metadata(id);
    return {
      data,
      mediaType: record.mediaType,
      filename: record.filename,
      expiresAt: record.expiresAt,
      sha256: record.sha256,
    };
  }
  async remove(id: string) {
    // Authorization and ownership apply even to an expired image.
    await this.host.authorize(`image:${id}`, "write");
    const r = await this.host.transaction((tx) =>
      tx.get<ImageRecord>("images", id),
    );
    if (
      !r ||
      r.principal.tenantId !== this.host.principal.tenantId ||
      r.principal.subjectId !== this.host.principal.subjectId
    )
      fail("ACCESS_DENIED");
    if (r.storageVersion !== this.host.storage?.version)
      fail("RECOVERY_DEPENDENCY_MISMATCH");
    if (this.host.storage) await this.host.storage.remove(id);
    await this.host.transaction((tx) => tx.remove("images", id));
  }
  async sweep(allPrincipals: boolean) {
    const expired = await this.host.transaction(async (tx) =>
      (await tx.list<ImageRecord>("images")).filter(
        (r) =>
          !r.purged &&
          Date.parse(r.expiresAt) <= this.host.now() &&
          (allPrincipals ||
            (r.principal.tenantId === this.host.principal.tenantId &&
              r.principal.subjectId === this.host.principal.subjectId)),
      ),
    );
    for (const record of expired) {
      if (record.storageVersion !== this.host.storage?.version) continue;
      if (this.host.storage)
        await this.host.storage.remove(record.attachmentId);
      await this.host.transaction(async (tx) => {
        const current = await tx.get<ImageRecord>(
          "images",
          record.attachmentId,
        );
        if (current) {
          delete current.encrypted;
          current.filename = "expired image";
          current.purged = true;
          await tx.put("images", record.attachmentId, current);
        }
      });
    }
  }
}
