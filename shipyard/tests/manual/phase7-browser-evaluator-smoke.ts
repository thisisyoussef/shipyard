import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PreviewState } from "../../src/artifacts/types.js";
import {
  createBrowserEvaluationTargetFromPreviewState,
  runBrowserEvaluator,
} from "../../src/agents/browser-evaluator.js";
import { discoverTarget } from "../../src/context/discovery.js";
import { createPreviewSupervisor } from "../../src/preview/supervisor.js";
import { scaffoldPreviewableTarget } from "../support/preview-target.js";

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

async function waitForState(
  supervisor: ReturnType<typeof createPreviewSupervisor>,
  predicate: (state: PreviewState) => boolean,
  timeoutMs = 5_000,
): Promise<PreviewState> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = supervisor.getState();

    if (predicate(state)) {
      return state;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error("Timed out waiting for preview state.");
}

async function main(): Promise<void> {
  const targetDirectory = await mkdtemp(
    path.join(tmpdir(), "shipyard-phase7-browser-evaluator-"),
  );

  try {
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "phase7-browser-evaluator",
    });
    await writeFile(
      path.join(targetDirectory, "preview-server.mjs"),
      createPreviewServerContents(createInteractivePreviewHtml()),
      "utf8",
    );

    const discovery = await discoverTarget(targetDirectory);
    const supervisor = createPreviewSupervisor({
      targetDirectory,
      capability: discovery.previewCapability,
    });

    try {
      await supervisor.start();

      const runningState = await waitForState(
        supervisor,
        (state) => state.status === "running" && state.url !== null,
      );
      const report = await runBrowserEvaluator({
        summary: "Smoke-test the interactive preview.",
        target: createBrowserEvaluationTargetFromPreviewState(runningState),
        steps: [
          {
            id: "load",
            label: "Load preview",
            kind: "load",
          },
          {
            id: "button",
            label: "Wait for the action button",
            kind: "wait_for_selector",
            selector: '[data-action="show-result"]',
          },
          {
            id: "click",
            label: "Click the action button",
            kind: "click",
            selector: '[data-action="show-result"]',
          },
          {
            id: "done",
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

      assert.equal(report.status, "passed");
      assert.equal(report.failure, null);
      assert.equal(report.consoleMessages.length, 0);
      assert.equal(report.pageErrors.length, 0);

      console.log(
        JSON.stringify(
          {
            status: report.status,
            previewUrl: report.previewUrl,
            summary: report.summary,
            steps: report.steps.map((step) => ({
              id: step.stepId,
              status: step.status,
            })),
          },
          null,
          2,
        ),
      );
    } finally {
      await supervisor.stop();
    }
  } finally {
    await rm(targetDirectory, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
