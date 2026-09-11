import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { ModelSchema } from "@agent-runtime/sdk";

// Host-side local development configuration. Never serialize resolved secrets.
const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const modelsSchema = z.strictObject({
  version: z.literal(1),
  default: name,
  protocolKey: z.strictObject({ secretRef: name }),
  profiles: z.record(
    name,
    z.strictObject({
      model: ModelSchema.refine((model) => {
        try {
          const url = new URL(model.baseURL);
          return (
            ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      }),
      allowPrivateNetwork: z.boolean().default(false),
    }),
  ),
});
const credentialsSchema = z.strictObject({
  version: z.literal(1),
  values: z.record(name, z.string().trim().min(1)),
});

export class LocalModelConfigError extends Error {
  constructor(
    readonly code:
      | "LOCAL_CONFIG_UNAVAILABLE"
      | "LOCAL_CONFIG_PERMISSIONS"
      | "LOCAL_CONFIG_INVALID"
      | "LOCAL_PROFILE_NOT_FOUND"
      | "LOCAL_SECRET_NOT_FOUND",
  ) {
    super(code);
    this.name = "LocalModelConfigError";
  }
}

async function readPrivateJSON(path: string): Promise<unknown> {
  let handle;
  try {
    const parent = await lstat(dirname(path));
    if (
      !parent.isDirectory() ||
      (parent.mode & 0o777) !== 0o700 ||
      parent.uid !== process.getuid?.()
    )
      throw new LocalModelConfigError("LOCAL_CONFIG_PERMISSIONS");
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== process.getuid?.()
    )
      throw new LocalModelConfigError("LOCAL_CONFIG_PERMISSIONS");
    if (stat.size > 65536)
      throw new LocalModelConfigError("LOCAL_CONFIG_INVALID");
    try {
      return JSON.parse(await handle.readFile("utf8"));
    } catch {
      throw new LocalModelConfigError("LOCAL_CONFIG_INVALID");
    }
  } catch (error) {
    if (error instanceof LocalModelConfigError) throw error;
    throw new LocalModelConfigError("LOCAL_CONFIG_UNAVAILABLE");
  } finally {
    await handle?.close();
  }
}

async function readLocalConfiguration(root: string) {
  const models = modelsSchema.safeParse(
    await readPrivateJSON(resolve(root, ".local/models.json")),
  );
  const credentials = credentialsSchema.safeParse(
    await readPrivateJSON(resolve(root, ".secrets/credentials.json")),
  );
  if (!models.success || !credentials.success)
    throw new LocalModelConfigError("LOCAL_CONFIG_INVALID");
  return { models: models.data, credentials: credentials.data };
}

function selectLocalModel(
  { models, credentials }: Awaited<ReturnType<typeof readLocalConfiguration>>,
  profileName?: string,
) {
  const selected = profileName ?? models.default;
  const profile = Object.hasOwn(models.profiles, selected)
    ? models.profiles[selected]
    : undefined;
  if (!profile) throw new LocalModelConfigError("LOCAL_PROFILE_NOT_FOUND");
  const allowed = new Map<string, string>();
  for (const ref of [
    profile.model.apiKey.secretRef,
    models.protocolKey.secretRef,
  ]) {
    const value = Object.hasOwn(credentials.values, ref)
      ? credentials.values[ref]
      : undefined;
    if (!value || value.startsWith("REPLACE_"))
      throw new LocalModelConfigError("LOCAL_SECRET_NOT_FOUND");
    allowed.set(ref, value);
  }
  return {
    profileName: selected,
    ...profile,
    protocolKey: models.protocolKey,
    secrets: {
      resolve: async (ref: string) => {
        const value = allowed.get(ref);
        if (value === undefined)
          throw new LocalModelConfigError("LOCAL_SECRET_NOT_FOUND");
        return value;
      },
    },
  };
}

export async function loadLocalModel(
  profileName?: string,
  root = process.cwd(),
) {
  return selectLocalModel(await readLocalConfiguration(root), profileName);
}

export async function loadLocalModels(root = process.cwd()) {
  const config = await readLocalConfiguration(root);
  const profiles = Object.keys(config.models.profiles).map((name) =>
    selectLocalModel(config, name),
  );
  selectLocalModel(config);
  return { defaultProfile: config.models.default, profiles };
}
