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

  it("syncs the production OpenAI defaults before deploying to Railway", async () => {
    const workflow = await readFile(railwayWorkflowPath, "utf8");

    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).toContain("Missing OPENAI_API_KEY GitHub secret");
    expect(workflow).toContain("railway variable set OPENAI_API_KEY --stdin");
    expect(workflow).toContain("SHIPYARD_MODEL_PROVIDER=openai");
    expect(workflow).toContain("SHIPYARD_OPENAI_MODEL=gpt-5.4");
  });
});
