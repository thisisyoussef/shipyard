import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const BROAD_RUNTIME_TEST_FILES = [
  "tests/raw-loop.test.ts",
  "tests/turn-runtime.test.ts",
  "tests/graph-runtime.test.ts",
  "tests/planner-subagent.test.ts",
  "tests/explorer-subagent.test.ts",
  "tests/verifier-subagent.test.ts",
  "tests/plan-mode.test.ts",
  "tests/ui-runtime.test.ts",
  "tests/manual/phase5-local-preview-smoke.ts",
] as const;

describe("provider-neutral test harness guard", () => {
  it("keeps broad runtime suites free of provider SDK wire imports", async () => {
    for (const relativePath of BROAD_RUNTIME_TEST_FILES) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      const contents = await readFile(absolutePath, "utf8");

      expect(contents, relativePath).not.toMatch(/@anthropic-ai\/sdk/);
      expect(contents, relativePath).not.toMatch(
        /openai\/resources\/responses|openai\/resources\/shared/,
      );
    }
  });
});
