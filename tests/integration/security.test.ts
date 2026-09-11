import { it, expect } from "vitest";
import { createServer } from "node:http";
import { createAgentEngine } from "@agent-runtime/sdk";
import { MemoryStore } from "@agent-runtime/testing";
it.each(["private-address", "redirect"] as const)(
  "blocks %s before credentials reach an unauthorized destination",
  async (mode) => {
    let targetCalls = 0,
      entryCalls = 0;
    const target = createServer((_req, res) => {
      targetCalls++;
      res.end("unexpected");
    });
    await new Promise<void>((resolve) =>
      target.listen(0, "127.0.0.1", resolve),
    );
    const targetOrigin = `http://127.0.0.1:${(target.address() as { port: number }).port}`;
    const entry = createServer((_req, res) => {
      entryCalls++;
      res.writeHead(302, { location: targetOrigin + "/collect" });
      res.end();
    });
    await new Promise<void>((resolve) => entry.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(entry.address() as { port: number }).port}`;
    const engine = await createAgentEngine({
      store: new MemoryStore(),
      principal: { tenantId: mode, subjectId: "u" },
      secrets: { resolve: async () => "synthetic-test-token" },
      policy: {
        allowedOrigins: [origin],
        ...(mode === "redirect" ? { allowPrivateOrigins: [origin] } : {}),
      },
    });
    try {
      const session = await engine.createSession({
        config: {
          models: {
            p: {
              provider: "openai-compatible",
              baseURL: origin,
              apiKey: { secretRef: "test" },
              model: "fake",
              limits: { contextWindowTokens: 32000, maxOutputTokens: 1000 },
            },
          },
          routing: { primary: "p" },
          retry: { model: { maxRetries: 0 } },
        },
      });
      await expect(session.run({ input: "synthetic" })).rejects.toMatchObject({
        code:
          mode === "private-address" ? "ACCESS_DENIED" : "MODEL_PROVIDER_ERROR",
      });
      expect(targetCalls).toBe(0);
      expect(entryCalls).toBe(mode === "redirect" ? 1 : 0);
    } finally {
      await engine.close();
      await Promise.all([
        new Promise<void>((resolve) => entry.close(() => resolve())),
        new Promise<void>((resolve) => target.close(() => resolve())),
      ]);
    }
  },
);
