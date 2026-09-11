import { afterEach, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadLocalModel,
  loadLocalModels,
} from "../../scripts/lib/local-model-config.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "agent-local-config-"));
  roots.push(root);
  for (const dir of [".local", ".secrets"])
    await mkdir(join(root, dir), { mode: 0o700 });
  const config = {
    version: 1,
    default: "primary",
    protocolKey: { secretRef: "PROTOCOL" },
    profiles: {
      primary: {
        model: {
          provider: "openai-compatible",
          baseURL: "https://example.invalid/v1",
          model: "synthetic",
          apiKey: { secretRef: "MODEL" },
          limits: { contextWindowTokens: 32000, maxOutputTokens: 256 },
        },
      },
    },
  };
  const values = {
    MODEL: "synthetic-model-key",
    PROTOCOL: "synthetic-protection-key",
    OTHER: "unrelated-secret",
  };
  const save = async () => {
    await writeFile(join(root, ".local/models.json"), JSON.stringify(config), {
      mode: 0o600,
    });
    await writeFile(
      join(root, ".secrets/credentials.json"),
      JSON.stringify({ version: 1, values }),
      { mode: 0o600 },
    );
  };
  await save();
  return { root, config, values, save };
}

it("resolves only the selected model and protection key without serializing tokens", async () => {
  const { root, values } = await fixture();
  const local = await loadLocalModel(undefined, root);
  expect(await local.secrets.resolve("MODEL")).toBe(values.MODEL);
  expect(await local.secrets.resolve("PROTOCOL")).toBe(values.PROTOCOL);
  await expect(local.secrets.resolve("OTHER")).rejects.toMatchObject({
    code: "LOCAL_SECRET_NOT_FOUND",
  });
  for (const value of Object.values(values))
    expect(JSON.stringify(local)).not.toContain(value);
  const all = await loadLocalModels(root);
  expect(all.defaultProfile).toBe("primary");
  expect(all.profiles.map((p) => p.profileName)).toEqual(["primary"]);
  for (const value of Object.values(values))
    expect(JSON.stringify(all)).not.toContain(value);
  await expect(loadLocalModel("missing", root)).rejects.toMatchObject({
    code: "LOCAL_PROFILE_NOT_FOUND",
  });
});

it("rejects missing or placeholder references before any provider request", async () => {
  const f = await fixture();
  f.config.profiles.primary.model.apiKey.secretRef = "MISSING";
  await f.save();
  await expect(loadLocalModel(undefined, f.root)).rejects.toMatchObject({
    code: "LOCAL_SECRET_NOT_FOUND",
  });
  f.config.profiles.primary.model.apiKey.secretRef = "MODEL";
  f.values.MODEL = "REPLACE_WITH_YOUR_AUTHORIZED_KEY";
  await f.save();
  await expect(loadLocalModel(undefined, f.root)).rejects.toMatchObject({
    code: "LOCAL_SECRET_NOT_FOUND",
  });
});

it("rejects exposed credential files and directories", async () => {
  const { root } = await fixture();
  const path = join(root, ".secrets/credentials.json");
  await chmod(path, 0o644);
  await expect(loadLocalModel(undefined, root)).rejects.toMatchObject({
    code: "LOCAL_CONFIG_PERMISSIONS",
  });
  await chmod(path, 0o600);
  await chmod(join(root, ".secrets"), 0o755);
  await expect(loadLocalModel(undefined, root)).rejects.toMatchObject({
    code: "LOCAL_CONFIG_PERMISSIONS",
  });
});

it("does not include credential values in malformed JSON or model validation errors", async () => {
  const { root, config, values, save } = await fixture();
  config.profiles.primary.model.baseURL = `https://user:${values.MODEL}@example.invalid/v1`;
  await save();
  await expect(loadLocalModel(undefined, root)).rejects.toThrow(
    "LOCAL_CONFIG_INVALID",
  );
  config.profiles.primary.model.baseURL = values.MODEL;
  await save();
  await expect(loadLocalModel(undefined, root)).rejects.toThrow(
    "LOCAL_CONFIG_INVALID",
  );
  await writeFile(
    join(root, ".secrets/credentials.json"),
    `{"key":"${values.MODEL}",`,
  );
  try {
    await loadLocalModel(undefined, root);
    expect.fail("invalid JSON accepted");
  } catch (error) {
    expect(String(error)).toContain("LOCAL_CONFIG_INVALID");
    expect(String(error)).not.toContain(values.MODEL);
  }
});
