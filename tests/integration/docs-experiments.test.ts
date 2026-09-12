import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  experiments,
  runDocsExperiment,
} from "../../examples/docs-site/experiments.js";
for (const example of experiments)
  for (const enabled of "option" in example ? [true, false] : [true])
    it(`docs experiment ${example.id}, enabled=${enabled}`, async () => {
      const result = await runDocsExperiment({
        id: example.id,
        enabled,
        requestId: randomUUID(),
      });
      expect(result.checks).toEqual(
        expect.arrayContaining([expect.objectContaining({ passed: true })]),
      );
      expect(result.checks).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ passed: false })]),
      );
      expect(result.passed).toBe(true);
      expect(JSON.stringify(result)).not.toContain("synthetic-no-credential");
    });
