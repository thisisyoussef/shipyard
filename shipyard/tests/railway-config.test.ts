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

interface ShipyardPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const railwayConfigPath = path.resolve(testsDirectory, "../railway.json");
const packageJsonPath = path.resolve(testsDirectory, "../package.json");
const railwayWorkflowPath = path.resolve(
  testsDirectory,
  "../../.github/workflows/railway-main-deploy.yml",
);
const railwayDeployScriptPath = path.resolve(
  testsDirectory,
  "../../.github/scripts/railway-ci-deploy.sh",
);
const railwayDockerfilePath = path.resolve(testsDirectory, "../Dockerfile");
const browserEvaluatorPath = path.resolve(
  testsDirectory,
  "../src/agents/browser-evaluator.ts",
);

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

  it("keeps Playwright out of production dependencies and lazy-loads browser evaluation", async () => {
    const packageJson = JSON.parse(
      await readFile(packageJsonPath, "utf8"),
    ) as ShipyardPackageJson;
    const browserEvaluator = await readFile(browserEvaluatorPath, "utf8");

    expect(packageJson.dependencies?.playwright).toBeUndefined();
    expect(packageJson.dependencies?.["@playwright/browser-chromium"]).toBeUndefined();
    expect(packageJson.devDependencies?.playwright).toBeDefined();
    expect(packageJson.devDependencies?.["@playwright/browser-chromium"]).toBeDefined();
    expect(browserEvaluator).toContain('const playwright = await import("playwright");');
    expect(browserEvaluator).toContain("Browser runtime unavailable:");
  });

  it("syncs the production OpenAI defaults before deploying to Railway", async () => {
    const workflow = await readFile(railwayWorkflowPath, "utf8");

    expect(workflow).toContain("packages: write");
    expect(workflow).toContain("uses: docker/login-action@v3");
    expect(workflow).toContain("uses: docker/build-push-action@v6");
    expect(workflow).toContain('image_repo="ghcr.io/${GITHUB_REPOSITORY,,}"');
    expect(workflow).toContain('export RAILWAY_IMAGE_REF="${{ steps.ghcr.outputs.image_ref }}"');
    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).toContain("Missing OPENAI_API_KEY GitHub secret");
    expect(workflow).toContain('if [ -n "${RAILWAY_API_TOKEN}" ]; then');
    expect(workflow).toContain('echo "RAILWAY_CONTROL_TOKEN_KIND=api" >> "${GITHUB_ENV}"');
    expect(workflow).toContain('echo "RAILWAY_CONTROL_TOKEN_KIND=project" >> "${GITHUB_ENV}"');
    expect(workflow).toContain("RAILWAY_CONTROL_TOKEN=${RAILWAY_API_TOKEN}");
    expect(workflow).toContain("RAILWAY_CONTROL_TOKEN=${RAILWAY_TOKEN}");
    expect(workflow).toContain("unset RAILWAY_TOKEN");
    expect(workflow).toContain("unset RAILWAY_API_TOKEN");
    expect(workflow).toContain('export RAILWAY_API_TOKEN="${RAILWAY_CONTROL_TOKEN}"');
    expect(workflow).toContain('export RAILWAY_TOKEN="${RAILWAY_CONTROL_TOKEN}"');
    expect(workflow).toContain("railway project link \\");
    expect(workflow).toContain("railway variable set OPENAI_API_KEY --stdin");
    expect(workflow).toContain("SHIPYARD_GITHUB_TOKEN: ${{ secrets.SHIPYARD_GITHUB_TOKEN }}");
    expect(workflow).toContain("railway variable set GITHUB_TOKEN --stdin");
    expect(workflow).toContain("railway variable set VERCEL_TOKEN --stdin");
    expect(workflow).toContain("RAILWAY_VOLUME_MOUNT_PATH=/app/workspace");
    expect(workflow).toContain("SHIPYARD_TARGETS_DIR=/app/workspace");
    expect(workflow).toContain("SHIPYARD_UI_HOST=0.0.0.0");
    expect(workflow).toContain("SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1");
    expect(workflow).toContain("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1");
    expect(workflow).toContain("SHIPYARD_MODEL_PROVIDER=openai");
    expect(workflow).toContain("SHIPYARD_OPENAI_MODEL=gpt-5.4");
    expect(workflow).not.toContain("SHIPYARD_MODEL_PROVIDER=anthropic");
    expect(workflow).toContain("bash .github/scripts/railway-ci-deploy.sh");
  });

  it("switches the live Railway service to a GHCR image and waits for a fresh deployment result", async () => {
    const script = await readFile(railwayDeployScriptPath, "utf8");

    expect(script).toContain('RAILWAY_DEPLOY_MAX_ATTEMPTS:-3');
    expect(script).toContain('RAILWAY_DEPLOY_RETRY_DELAY_SECONDS:-15');
    expect(script).toContain('RAILWAY_DEPLOY_LOG_FETCH_ATTEMPTS:-5');
    expect(script).toContain('RAILWAY_DEPLOY_LOG_FETCH_DELAY_SECONDS:-3');
    expect(script).toContain("failed to pull/unpack image");
    expect(script).toContain("failed to resolve reference");
    expect(script).toContain("dial tcp");
    expect(script).toContain("Failed to create deployment\\.");
    expect(script).toContain('RAILWAY_IMAGE_REF');
    expect(script).toContain('service_config["source"]');
    expect(script).toContain('deploy_config["startCommand"]');
    expect(script).toContain("railway environment config");
    expect(script).toContain("python -c");
    expect(script).toContain("railway environment edit");
    expect(script).toContain("railway service status");
    expect(script).toContain("Railway image deployment succeeded");
    expect(script).toContain("railway logs");
    expect(script).toContain("--build");
    expect(script).toContain('if should_retry_failure "${deploy_log_path}" "${build_log_path}"; then');
    expect(script).toContain("Railway deploy hit a transient image handoff failure. Retrying in");
    expect(script).toContain("Timed out waiting for Railway to report a fresh deployment");
  });
});
