import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEngineTestHarness,
  scriptedModel,
  toolCall,
  finalText,
} from "@agent-runtime/testing";
import type { Article } from "./content.js";
import {
  createKnowledge,
  loadProjectSnapshot,
  type Knowledge,
} from "./knowledge.js";
import { docsAssistant, docsBinding } from "./server.js";

export async function verifyKnowledge(
  articles: Article[],
  knowledge: Knowledge,
) {
  assert.ok(knowledge.snapshot.files.size > 30);
  const api = await knowledge.execute("api.lookup", {
    query: "mountChatWidget",
  });
  assert.equal(api.items[0]?.title, "mountChatWidget");
  assert.match(api.items[0]!.path, /pages\/mount.ts$/);
  assert.match(api.items[0]!.text, /export function mountChatWidget/);
  const alias = await knowledge.execute("api.lookup", {
    query: "EngineOptionsSchema",
  });
  assert.equal(alias.items[0]?.title, "EngineOptionsSchema");
  const examples = await knowledge.execute("examples.find", {
    query: "mountChatWidget",
  });
  assert.ok(
    examples.items.some(
      (i) => i.path === "examples/docs-site/snippets/frontend.ts",
    ),
  );
  const found = await knowledge.execute("code.search", {
    query: "createSessionMemory",
    pathPrefix: "packages/chat-core/",
  });
  assert.ok(found.items.length);
  assert.ok(found.items.every((i) => i.path.startsWith("packages/chat-core/")));
  const read = await knowledge.execute("code.read", {
    path: found.items[0]!.path,
    startLine: found.items[0]!.startLine,
  });
  assert.match(read.items[0]!.text, /createSessionMemory/);
  assert.equal(read.revision, knowledge.snapshot.revision);
  assert.equal(
    (await knowledge.execute("code.search", { query: "[.*" })).items.length,
    0,
  );
  for (const path of [
    "../../.secrets/credentials.json",
    ".local/models.json",
    "packages/sdk/src/../../../../.secrets/credentials.json",
    "/etc/passwd",
    "__proto__",
    "constructor",
  ])
    assert.equal(
      (await knowledge.execute("code.read", { path })).items.length,
      0,
    );
  const article = articles.find((a) => a.id === "sdk")!;
  const pages: string[] = [];
  let line = 1;
  do {
    const result = await knowledge.execute("docs.read", {
      articleId: "sdk",
      startLine: line,
    });
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 6200);
    assert.equal(result.items[0]!.startLine, line);
    pages.push(result.items[0]!.text);
    assert.ok(result.nextLine === 0 || result.nextLine > line);
    line = result.nextLine;
  } while (line);
  assert.equal(pages.join("\n"), article.markdown);
  assert.match(pages.join("\n"), /~~~ts/);
  assert.equal(
    (await knowledge.execute("docs.read", { articleId: "../../private" })).items
      .length,
    0,
  );

  const sequence = [
    toolCall("docs.search", { query: "前端 SDK" }),
    toolCall("docs.read", { articleId: "frontend" }),
    toolCall("api.lookup", { query: "mountChatWidget" }),
    finalText("文档和 API 已查询。"),
    toolCall("examples.find", { query: "mountChatWidget" }),
    toolCall("code.search", { query: "createSessionMemory" }),
    toolCall("code.read", {
      path: "examples/docs-site/snippets/frontend.ts",
      startLine: 1,
    }),
    finalText("示例和源码已查询。"),
  ];
  const harness = await createEngineTestHarness({
    model: scriptedModel(sequence),
    bindings: {
      "docs.search.v1": docsBinding(articles),
      ...knowledge.bindings,
    },
  });
  try {
    // Two realistic lookup/read flows; unknown provider usage retains conservative reservations.
    for (const [i, output] of [
      "文档和 API 已查询。",
      "示例和源码已查询。",
    ].entries()) {
      const session = await harness.engine.createSession({
        config: docsAssistant(harness.modelConfig.models.primary, knowledge)
          .config,
        requestId: "docs-tools-" + i,
      });
      const result = await session.run({
        input: "合成测试：查询资料并读取定义",
        requestId: "tools-run-" + i,
      });
      assert.equal(result.outputText, output);
    }
    for (const name of [
      "docs.search",
      "docs.read",
      "api.lookup",
      "examples.find",
      "code.search",
      "code.read",
    ])
      assert.equal(harness.calls.forBinding(name + ".v1").length, 1, name);
  } finally {
    await harness.close();
  }

  // Committed allowlist, symlink exclusion and dirty-worktree isolation in an unrelated disposable repo.
  const root = await mkdtemp(join(tmpdir(), "agent-docs-snapshot-"));
  const exec = promisify(execFile);
  const git = (args: string[]) => exec("git", ["-C", root, ...args]);
  try {
    await mkdir(join(root, "packages/sdk/src"), { recursive: true });
    await mkdir(join(root, ".secrets"));
    await writeFile(
      join(root, "packages/sdk/src/index.ts"),
      'export const example = "committed";\n',
    );
    await writeFile(join(root, ".secrets/test.ts"), "synthetic-private-marker");
    await symlink(
      "../../../.secrets/test.ts",
      join(root, "packages/sdk/src/link.ts"),
    );
    await git(["init", "-q"]);
    await git(["add", "."]);
    await git([
      "-c",
      "user.name=Docs fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "synthetic snapshot",
    ]);
    await writeFile(
      join(root, "packages/sdk/src/index.ts"),
      "uncommitted-private-marker",
    );
    await writeFile(
      join(root, "packages/sdk/src/untracked.ts"),
      "untracked-private-marker",
    );
    const snapshot = await loadProjectSnapshot(root);
    assert.deepEqual([...snapshot.files.keys()], ["packages/sdk/src/index.ts"]);
    assert.equal(
      snapshot.files.get("packages/sdk/src/index.ts")!.text,
      'export const example = "committed";\n',
    );
    const small = createKnowledge(articles, snapshot);
    assert.equal(
      (await small.execute("code.search", { query: "private-marker" })).items
        .length,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
