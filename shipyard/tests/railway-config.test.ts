import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface RailwayConfig {
  build?: {
    builder?: string | null;
    buildCommand?: string | null;
  };
  deploy?: {
    startCommand?: string | null;
    healthcheckPath?: string;
  };
}

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const railwayConfigPath = path.resolve(testsDirectory, "../railway.json");
const railwayWorkflowPath = path.resolve(
  testsDirectory,
  "../../.github/workflows/railway-main-deploy.yml",
);
const railwayDeployScriptPath = path.resolve(
  testsDirectory,
  "../../.github/scripts/railway-ci-deploy.sh",
);
const railwayDockerfilePath = path.resolve(testsDirectory, "../Dockerfile");

describe("railway config", () => {
  it("pins hosted Railway deploys to the checked-in Dockerfile runtime", async () => {
    const config = JSON.parse(
      await readFile(railwayConfigPath, "utf8"),
    ) as RailwayConfig;

    expect(config.build?.builder).toBe("DOCKERFILE");
    expect(config.build?.buildCommand).toBeNull();
    expect(config.deploy?.startCommand).toBe(
      "node --env-file-if-exists=.env ./dist/bin/shipyard.js --ui",
    );
    expect(config.deploy?.healthcheckPath).toBe("/api/health");
  });

  it("keeps the hosted runtime image to compiled output, built-in skills, and production dependencies", async () => {
    const dockerfile = await readFile(railwayDockerfilePath, "utf8");

    expect(dockerfile).toContain("FROM node:20-bookworm-slim AS build");
    expect(dockerfile).toContain("ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1");
    expect(dockerfile).toContain("RUN pnpm build && pnpm prune --prod");
    expect(dockerfile).toContain("COPY --from=build /app/node_modules ./node_modules");
    expect(dockerfile).toContain("COPY --from=build /app/dist ./dist");
    expect(dockerfile).toContain("COPY --from=build /app/skills ./skills");
    expect(dockerfile).toContain(
      'CMD ["node", "--env-file-if-exists=.env", "./dist/bin/shipyard.js", "--ui"]',
    );
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
    expect(workflow).toContain("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1");
    expect(workflow).toContain("SHIPYARD_MODEL_PROVIDER=anthropic");
    expect(workflow).toContain("SHIPYARD_ANTHROPIC_MODEL=claude-opus-4-6");
    expect(workflow).toContain("bash .github/scripts/railway-ci-deploy.sh");
  });

  it("retries transient or post-build Railway deploy handoff failures", async () => {
    const script = await readFile(railwayDeployScriptPath, "utf8");

    expect(script).toContain('max_attempts="${RAILWAY_DEPLOY_MAX_ATTEMPTS:-3}"');
    expect(script).toContain('base_retry_delay_seconds="${RAILWAY_DEPLOY_RETRY_DELAY_SECONDS:-15}"');
    expect(script).toContain("failed to pull/unpack image");
    expect(script).toContain("DEADLINE_EXCEEDED");
    expect(script).toContain("built in [0-9]");
    expect(script).toContain("--verbose");
    expect(script).toContain("Railway deploy failed before a retriable post-build handoff; not retrying.");
  });
});
