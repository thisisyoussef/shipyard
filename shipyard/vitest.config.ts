import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The suite includes long-lived CLI and local runtime integration tests.
    // Keep file-level parallelism off so `pnpm test` stays deterministic.
    fileParallelism: false,
    root: packageRoot,
  },
});
