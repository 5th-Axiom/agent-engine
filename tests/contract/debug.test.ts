import { closeResources } from "../../scripts/lib/close-resources.js";
import { it, expect } from "vitest";
import { startDebugServer } from "@agent-runtime/debug";
import { createAgentEngine } from "@agent-runtime/sdk";
import { MemoryStore, scriptedModel, finalText } from "@agent-runtime/testing";
it("Debug requires authentication, refuses mutations and omits private content", async () => {
  const token = "synthetic-debug-token-for-tests";
  const engine = await createAgentEngine({
    store: new MemoryStore(),
    principal: { tenantId: "t", subjectId: "s" },
    secrets: { resolve: async () => token },
    adapters: {
      models: { fake: scriptedModel([finalText("private final answer")]) },
    },
    policy: { allowedOrigins: ["https://model.example.com"] },
  });
  let server: Awaited<ReturnType<typeof startDebugServer>> | undefined;
  try {
    const s = await engine.createSession({
      config: {
        models: {
          p: {
            provider: "fake",
            model: "fake",
            baseURL: "https://model.example.com",
            apiKey: { secretRef: "private-reference" },
            limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
          },
        },
        routing: { primary: "p" },
      },
    });
    await s.run({ input: "private prompt" });
    server = await startDebugServer({
      engine,
      port: 0,
      auth: { type: "token", secretRef: "debug" },
    });
    expect((await fetch(server.url)).status).toBe(401);
    const headers = { authorization: `Bearer ${token}` };
    expect((await fetch(server.url, { method: "POST", headers })).status).toBe(
      405,
    );
    const response = await fetch(`${server.url}/sessions/${s.id}`, { headers });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Steps and attempts");
    for (const privateText of [
      token,
      "private-reference",
      "private prompt",
      "private final answer",
    ])
      expect(html).not.toContain(privateText);
  } finally {
    await closeResources(server, engine);
  }
});
