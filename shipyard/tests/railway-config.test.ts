import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface RailwayConfig {
  build?: {
    buildCommand?: string;
  };
  deploy?: {
    startCommand?: string;
    healthcheckPath?: string;
  };
}

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const railwayConfigPath = path.resolve(testsDirectory, "../railway.json");

describe("railway config", () => {
  it("runs build and start commands from the shipyard app root", async () => {
    const config = JSON.parse(
      await readFile(railwayConfigPath, "utf8"),
    ) as RailwayConfig;

    expect(config.build?.buildCommand).toBe(
      "pnpm install --frozen-lockfile && pnpm build",
    );
    expect(config.deploy?.startCommand).toBe("pnpm start -- --ui");
    expect(config.deploy?.healthcheckPath).toBe("/api/health");
  });
});
