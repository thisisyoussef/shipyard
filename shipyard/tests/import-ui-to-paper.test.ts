import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDirectory, "..", "..");
const importUiToPaperPath = path.join(repoRoot, "scripts", "import-ui-to-paper.mjs");

interface PreviewSurfaceDryRun {
  id: string;
  artboardName: string;
  previewUrl: string;
  screenshotPath: string;
}

interface ImportUiToPaperDryRun {
  allowAnyPaperFile: boolean;
  captureOnly: boolean;
  outputDirectory: string;
  paperFileName: string | null;
  previewServer: {
    host: string;
    port: number;
  };
  surfaces: PreviewSurfaceDryRun[];
}

async function runImporterDryRun(args: string[]) {
  const result = await execFile("node", [importUiToPaperPath, "--dry-run", ...args], {
    cwd: repoRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(result.stdout) as ImportUiToPaperDryRun;
}

describe("import-ui-to-paper", () => {
  it("describes the requested preview surfaces and Paper guard in dry-run mode", async () => {
    const result = await runImporterDryRun([
      "--paper-file-name",
      "Shipyard UI",
      "--output-dir",
      ".ai/state/test-paper-import",
      "--surface",
      "editor-preview",
      "--surface",
      "human-feedback",
    ]);

    expect(result.paperFileName).toBe("Shipyard UI");
    expect(result.allowAnyPaperFile).toBe(false);
    expect(result.captureOnly).toBe(false);
    expect(result.outputDirectory).toBe(".ai/state/test-paper-import");
    expect(result.previewServer).toEqual({
      host: "127.0.0.1",
      port: 4173,
    });
    expect(result.surfaces).toEqual([
      {
        id: "editor-preview",
        artboardName: "Shipyard import / Editor / Preview",
        previewUrl:
          "http://127.0.0.1:4173/preview.html?editorTab=preview#/editor/%2Fprojects%2Fcraft-vision",
        screenshotPath:
          ".ai/state/test-paper-import/screenshots/editor-preview.png",
      },
      {
        id: "human-feedback",
        artboardName: "Shipyard import / Human feedback",
        previewUrl:
          "http://127.0.0.1:4173/preview.html#/human-feedback",
        screenshotPath:
          ".ai/state/test-paper-import/screenshots/human-feedback.png",
      },
    ]);
  });

  it("can dry-run the full catalog without requiring a Paper file guard when capture-only is set", async () => {
    const result = await runImporterDryRun([
      "--capture-only",
      "--allow-any-paper-file",
      "--output-dir",
      ".ai/state/test-paper-capture",
    ]);

    expect(result.paperFileName).toBeNull();
    expect(result.allowAnyPaperFile).toBe(true);
    expect(result.captureOnly).toBe(true);
    expect(result.surfaces.map((surface) => surface.id)).toEqual([
      "dashboard-my-products",
      "dashboard-recent",
      "dashboard-starred",
      "editor-preview",
      "editor-code",
      "editor-files",
      "board",
      "human-feedback",
    ]);
  });
});
