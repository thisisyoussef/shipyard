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
const railwayWorkflowPath = path.resolve(
  testsDirectory,
  "../../.github/workflows/railway-main-deploy.yml",
);

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

  it("syncs the production Anthropic defaults before deploying to Railway", async () => {
    const workflow = await readFile(railwayWorkflowPath, "utf8");

    expect(workflow).toContain("ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
    expect(workflow).toContain("Missing ANTHROPIC_API_KEY GitHub secret");
    expect(workflow).toContain("railway variable set ANTHROPIC_API_KEY --stdin");
    expect(workflow).toContain("SHIPYARD_GITHUB_TOKEN: ${{ secrets.SHIPYARD_GITHUB_TOKEN }}");
    expect(workflow).toContain("railway variable set GITHUB_TOKEN --stdin");
    expect(workflow).toContain("railway variable set VERCEL_TOKEN --stdin");
    expect(workflow).toContain("SHIPYARD_TARGETS_DIR=/app/workspace");
    expect(workflow).toContain("SHIPYARD_UI_HOST=0.0.0.0");
    expect(workflow).toContain("SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1");
    expect(workflow).toContain("SHIPYARD_MODEL_PROVIDER=anthropic");
    expect(workflow).toContain("SHIPYARD_ANTHROPIC_MODEL=claude-opus-4-6");
  });
});
