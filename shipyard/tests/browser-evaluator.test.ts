import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PreviewState } from "../src/artifacts/types.js";
import {
  createBrowserEvaluationTargetFromPreviewState,
  normalizeBrowserEvaluationPlan,
  runBrowserEvaluator,
} from "../src/agents/browser-evaluator.js";
import { discoverTarget } from "../src/context/discovery.js";
import { createPreviewSupervisor } from "../src/preview/supervisor.js";
import { scaffoldPreviewableTarget } from "./support/preview-target.js";

const createdDirectories: string[] = [];

function createPreviewServerContents(html: string): string {
  return `import { createServer } from "node:http";

const args = process.argv.slice(2);

function readFlag(name, fallback) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

const host = readFlag("--host", "127.0.0.1");
const port = Number.parseInt(readFlag("--port", "4173"), 10);
const server = createServer((_request, response) => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(${JSON.stringify(html)});
});

server.listen(port, host, () => {
  console.log("VITE v5.0.8 ready in 145 ms");
  console.log(\`Local: http://\${host}:\${port}/\`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`;
}

function createInteractivePreviewHtml(): string {
  return `<!doctype html>
<html>
  <body>
    <h1>Preview Ready</h1>
    <button data-action="show-result" type="button">Show result</button>
    <div data-result-root></div>
    <script>
      const button = document.querySelector('[data-action="show-result"]');
      const resultRoot = document.querySelector("[data-result-root]");

      button?.addEventListener("click", () => {
        if (!resultRoot) {
          return;
        }

        resultRoot.innerHTML = '<p data-result="done">Done</p>';
      });
    </script>
  </body>
</html>`;
}

function createConsoleErrorPreviewHtml(): string {
  return `<!doctype html>
<html>
  <body>
    <h1>Preview Ready</h1>
    <script>
      console.error("Preview console error");
    </script>
  </body>
</html>`;
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function waitForState(
  supervisor: ReturnType<typeof createPreviewSupervisor>,
  predicate: (state: PreviewState) => boolean,
  timeoutMs = 5_000,
): Promise<PreviewState> {
  const existingState = supervisor.getState();

  if (predicate(existingState)) {
    return existingState;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    const nextState = supervisor.getState();

    if (predicate(nextState)) {
      return nextState;
    }
  }

  throw new Error("Timed out waiting for the expected preview state.");
}

async function overwriteHealthyPreviewServer(
  targetDirectory: string,
  html: string,
): Promise<void> {
  await writeFile(
    path.join(targetDirectory, "preview-server.mjs"),
    createPreviewServerContents(html),
    "utf8",
  );
}

async function startPreviewableTarget(targetDirectory: string): Promise<{
  supervisor: ReturnType<typeof createPreviewSupervisor>;
  runningState: PreviewState;
}> {
  const discovery = await discoverTarget(targetDirectory);
  const supervisor = createPreviewSupervisor({
    targetDirectory,
    capability: discovery.previewCapability,
  });

  await supervisor.start();

  return {
    supervisor,
    runningState: await waitForState(
      supervisor,
      (state) => state.status === "running" && state.url !== null,
    ),
  };
}

describe("browser evaluator", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("rejects malformed plans", () => {
    expect(() =>
      normalizeBrowserEvaluationPlan({
        summary: "Inspect the preview.",
        target: {
          status: "available",
          previewUrl: "https://example.com",
          reason: "Preview ready.",
        },
        steps: [
          {
            id: "load",
            label: "Load preview",
            kind: "load",
          },
        ],
      }),
    ).toThrow(/browser evaluation plan is invalid/i);
  });

  it("returns a structured not_applicable result when preview is unavailable", async () => {
    const plan = normalizeBrowserEvaluationPlan({
      summary: "Inspect the preview.",
      target: createBrowserEvaluationTargetFromPreviewState({
        status: "unavailable",
        summary: "No preview is available for this target.",
        url: null,
        logTail: [],
        lastRestartReason: null,
      }),
      steps: [
        {
          id: "load",
          label: "Load preview",
          kind: "load",
        },
        {
          id: "console",
          label: "Check console health",
          kind: "console",
        },
      ],
    });

    const report = await runBrowserEvaluator(plan);

    expect(report).toMatchObject({
      status: "not_applicable",
      previewUrl: null,
      summary: expect.stringContaining("No preview is available"),
      failure: null,
    });
    expect(report.steps.map((step) => step.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  });

  it("can load a preview URL, run an interaction, and return a passing report", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-browser-evaluator-pass-",
    );
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "browser-evaluator-pass",
    });
    await overwriteHealthyPreviewServer(
      targetDirectory,
      createInteractivePreviewHtml(),
    );

    const { supervisor, runningState } = await startPreviewableTarget(
      targetDirectory,
    );

    try {
      const plan = normalizeBrowserEvaluationPlan({
        summary: "Inspect the interactive preview.",
        target: createBrowserEvaluationTargetFromPreviewState(runningState),
        steps: [
          {
            id: "load",
            label: "Load preview",
            kind: "load",
          },
          {
            id: "ready-button",
            label: "Wait for action button",
            kind: "wait_for_selector",
            selector: '[data-action="show-result"]',
          },
          {
            id: "show-result",
            label: "Reveal the result",
            kind: "click",
            selector: '[data-action="show-result"]',
          },
          {
            id: "done-result",
            label: "Wait for the success marker",
            kind: "wait_for_selector",
            selector: '[data-result="done"]',
          },
          {
            id: "console",
            label: "Check console health",
            kind: "console",
          },
        ],
      });

      const report = await runBrowserEvaluator(plan);

      expect(report).toMatchObject({
        status: "passed",
        previewUrl: runningState.url,
        summary: expect.stringContaining("passed"),
        failure: null,
      });
      expect(report.steps.every((step) => step.status === "passed")).toBe(true);
      expect(report.consoleMessages).toEqual([]);
      expect(report.pageErrors).toEqual([]);
    } finally {
      await supervisor.stop();
    }
  }, 30_000);

  it("records console-error failures", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-browser-evaluator-console-",
    );
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "browser-evaluator-console",
    });
    await overwriteHealthyPreviewServer(
      targetDirectory,
      createConsoleErrorPreviewHtml(),
    );

    const { supervisor, runningState } = await startPreviewableTarget(
      targetDirectory,
    );

    try {
      const report = await runBrowserEvaluator({
        summary: "Inspect console health.",
        target: createBrowserEvaluationTargetFromPreviewState(runningState),
        steps: [
          {
            id: "load",
            label: "Load preview",
            kind: "load",
          },
          {
            id: "console",
            label: "Check console health",
            kind: "console",
          },
        ],
      });

      expect(report.status).toBe("failed");
      expect(report.failure).toMatchObject({
        stepId: "console",
        kind: "console",
      });
      expect(report.consoleMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "error",
            text: expect.stringContaining("Preview console error"),
          }),
        ]),
      );
    } finally {
      await supervisor.stop();
    }
  }, 30_000);

  it("records selector or action-step failures", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-browser-evaluator-selector-",
    );
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "browser-evaluator-selector",
    });
    await overwriteHealthyPreviewServer(
      targetDirectory,
      createInteractivePreviewHtml(),
    );

    const { supervisor, runningState } = await startPreviewableTarget(
      targetDirectory,
    );

    try {
      const report = await runBrowserEvaluator({
        summary: "Inspect action handling.",
        target: createBrowserEvaluationTargetFromPreviewState(runningState),
        steps: [
          {
            id: "load",
            label: "Load preview",
            kind: "load",
          },
          {
            id: "missing-click",
            label: "Click the missing action",
            kind: "click",
            selector: '[data-action="missing"]',
          },
          {
            id: "console",
            label: "Check console health",
            kind: "console",
          },
        ],
      });

      expect(report.status).toBe("failed");
      expect(report.failure).toMatchObject({
        stepId: "missing-click",
        kind: "step",
      });
      expect(report.steps.map((step) => step.status)).toEqual([
        "passed",
        "failed",
        "skipped",
      ]);
    } finally {
      await supervisor.stop();
    }
  }, 20_000);

  it("reports browser launch failures as infrastructure failures", async () => {
    const report = await runBrowserEvaluator(
      {
        summary: "Inspect the preview.",
        target: {
          status: "available",
          previewUrl: "http://127.0.0.1:4173/",
          reason: "Preview ready.",
        },
        steps: [
          {
            id: "load",
            label: "Load preview",
            kind: "load",
          },
          {
            id: "console",
            label: "Check console health",
            kind: "console",
          },
        ],
      },
      {
        browserLauncher: {
          launch: vi.fn().mockRejectedValueOnce(
            new Error("libglib-2.0.so.0: cannot open shared object file"),
          ),
        },
      },
    );

    expect(report.status).toBe("infrastructure_failed");
    expect(report.failure).toMatchObject({
      stepId: null,
      label: null,
      kind: "infrastructure",
      message: expect.stringContaining("libglib-2.0.so.0"),
    });
    expect(report.steps.map((step) => step.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  });

  it("persists bounded artifact references when configured", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-browser-evaluator-artifacts-",
    );
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "browser-evaluator-artifacts",
    });
    await overwriteHealthyPreviewServer(
      targetDirectory,
      createInteractivePreviewHtml(),
    );

    const artifactsDirectory = await createTempDirectory(
      "shipyard-browser-evaluator-output-",
    );
    const { supervisor, runningState } = await startPreviewableTarget(
      targetDirectory,
    );

    try {
      const report = await runBrowserEvaluator(
        {
          summary: "Capture failure artifacts.",
          target: createBrowserEvaluationTargetFromPreviewState(runningState),
          steps: [
            {
              id: "load",
              label: "Load preview",
              kind: "load",
            },
            {
              id: "missing-selector",
              label: "Wait for a missing selector",
              kind: "wait_for_selector",
              selector: '[data-result="missing"]',
              timeoutMs: 250,
            },
            {
              id: "console",
              label: "Check console health",
              kind: "console",
            },
          ],
        },
        {
          artifactsDirectory,
        },
      );

      expect(report.status).toBe("failed");
      expect(report.artifacts).toHaveLength(1);
      expect(report.artifacts[0]).toMatchObject({
        kind: "screenshot",
        stepId: "missing-selector",
        path: expect.stringMatching(/\.png$/),
      });
      await expect(access(report.artifacts[0]!.path)).resolves.toBeUndefined();
    } finally {
      await supervisor.stop();
    }
  }, 20_000);
});
