#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const shipyardRoot = path.join(repoRoot, "shipyard");
const requireFromShipyard = createRequire(path.join(shipyardRoot, "package.json"));
const defaultPreviewHost = process.env.PAPER_IMPORT_PREVIEW_HOST?.trim() || "127.0.0.1";
const defaultPreviewPort = parsePositiveInteger(
  process.env.PAPER_IMPORT_PREVIEW_PORT,
  4173,
);
const defaultCodexModel = process.env.CODEX_PAPER_IMPORT_MODEL?.trim() || "";
const defaultTimeoutMs = parsePositiveInteger(
  process.env.PAPER_IMPORT_TIMEOUT_MS,
  2 * 60 * 1_000,
);
const defaultArtboardPrefix =
  process.env.PAPER_IMPORT_ARTBOARD_PREFIX?.trim() || "Shipyard import";
const defaultOutputDirectory = path.join(
  repoRoot,
  ".ai",
  "state",
  "paper-import",
  "latest",
);
const previewProductId = "/projects/craft-vision";

const previewSurfaceDefinitions = [
  {
    id: "dashboard-my-products",
    title: "Dashboard / My products",
    artboardSuffix: "Dashboard / My products",
    description: "The Shipyard dashboard on the My products tab.",
    hash: "#/",
    query: { dashboardTab: "my-products" },
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "dashboard-recent",
    title: "Dashboard / Recent",
    artboardSuffix: "Dashboard / Recent",
    description: "The Shipyard dashboard on the Recent tab.",
    hash: "#/",
    query: { dashboardTab: "recent" },
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "dashboard-starred",
    title: "Dashboard / Starred",
    artboardSuffix: "Dashboard / Starred",
    description: "The Shipyard dashboard on the Starred tab.",
    hash: "#/",
    query: { dashboardTab: "starred" },
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "editor-preview",
    title: "Editor / Preview",
    artboardSuffix: "Editor / Preview",
    description:
      "The Shipyard editor route focused on the Preview workspace tab.",
    hash: `#/editor/${encodeURIComponent(previewProductId)}`,
    query: { editorTab: "preview" },
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "editor-code",
    title: "Editor / Code",
    artboardSuffix: "Editor / Code",
    description: "The Shipyard editor route focused on the Code workspace tab.",
    hash: `#/editor/${encodeURIComponent(previewProductId)}`,
    query: { editorTab: "code" },
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "editor-files",
    title: "Editor / Files",
    artboardSuffix: "Editor / Files",
    description:
      "The Shipyard editor route focused on the Files workspace tab.",
    hash: `#/editor/${encodeURIComponent(previewProductId)}`,
    query: { editorTab: "files" },
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "board",
    title: "Board",
    artboardSuffix: "Board",
    description: "The Shipyard board route with the live Kanban surface.",
    hash: "#/board",
    query: {},
    viewport: { width: 1440, height: 1024 },
  },
  {
    id: "human-feedback",
    title: "Human feedback",
    artboardSuffix: "Human feedback",
    description:
      "The dedicated human-feedback route for feeding the running ultimate loop.",
    hash: "#/human-feedback",
    query: {},
    viewport: { width: 1440, height: 1024 },
  },
];

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/import-ui-to-paper.mjs [options]",
    "",
    "What it does:",
    "  - starts the Shipyard preview harness on /preview.html",
    "  - captures a deterministic screen catalog with Playwright",
    "  - imports those screens into the currently open Paper file through Codex",
    "",
    "Options:",
    "  --paper-file-name     Require the currently open Paper file to match this exact name",
    "  --allow-any-paper-file  Skip the open-file name guard",
    "  --capture-only        Capture screenshots and summaries without writing to Paper",
    "  --surface             Limit the run to one or more named surfaces (repeatable)",
    "  --output-dir          Output directory for screenshots and run summaries",
    "  --artboard-prefix     Prefix for new Paper artboards",
    "  --host                Preview host (default: 127.0.0.1)",
    "  --port                Preview port (default: 4173)",
    "  --model               Optional Codex model override",
    "  --timeout-ms          Per-Codex-run timeout in milliseconds",
    "  --dry-run             Print the resolved run plan as JSON and exit",
    "  --help, -h            Show this help",
    "",
    "Example:",
    '  node scripts/import-ui-to-paper.mjs --paper-file-name "Shipyard UI"',
  ].join("\n"));
}

function asArray(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeJsonOutput(contents) {
  const trimmed = contents.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const maxCapturedChars = 200_000;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const append = (current, chunk) => {
      const next = `${current}${chunk.toString()}`;
      return next.length > maxCapturedChars
        ? next.slice(-maxCapturedChars)
        : next;
    };

    const timeout = setTimeout(() => {
      timedOut = true;

      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }

      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 5_000).unref();
    }, timeoutMs);

    const finalizeError = (message) => {
      const error = new Error(message);
      error.stdout = stdout;
      error.stderr = stderr;
      error.timedOut = timedOut;
      reject(error);
    };

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      if (timedOut) {
        finalizeError(
          `Command timed out after ${timeoutMs}ms.\nstderr (tail):\n${stderr}`,
        );
        return;
      }

      finalizeError(
        `Command exited with code ${String(code)}${signal ? ` (signal ${signal})` : ""}.\nstderr (tail):\n${stderr}`,
      );
    });
  });
}

function normalizeSurfaceIds(surfaceIds) {
  const requestedIds = asArray(surfaceIds).map((value) => value.trim()).filter(Boolean);

  if (requestedIds.length === 0) {
    return previewSurfaceDefinitions.map((surface) => surface.id);
  }

  const knownIds = new Set(previewSurfaceDefinitions.map((surface) => surface.id));
  const unknownIds = requestedIds.filter((surfaceId) => !knownIds.has(surfaceId));

  if (unknownIds.length > 0) {
    throw new Error(
      `Unknown surface id(s): ${unknownIds.join(", ")}. Valid values: ${previewSurfaceDefinitions.map((surface) => surface.id).join(", ")}.`,
    );
  }

  return requestedIds;
}

function createPreviewUrl(host, port, hash, query) {
  const parameters = new URLSearchParams(query);
  const queryString = parameters.toString();

  return `http://${host}:${port}/preview.html${queryString ? `?${queryString}` : ""}${hash}`;
}

function createSurfaceRunPlan({
  outputDirectory,
  artboardPrefix,
  host,
  port,
  surfaceIds,
}) {
  const screenshotsDirectory = path.join(outputDirectory, "screenshots");
  const summariesDirectory = path.join(outputDirectory, "surface-results");
  const htmlDirectory = path.join(outputDirectory, "html");

  return surfaceIds.map((surfaceId) => {
    const definition = previewSurfaceDefinitions.find((candidate) => candidate.id === surfaceId);

    if (!definition) {
      throw new Error(`Could not resolve surface definition for ${surfaceId}.`);
    }

    return {
      ...definition,
      artboardName: `${artboardPrefix} / ${definition.artboardSuffix}`,
      previewUrl: createPreviewUrl(host, port, definition.hash, definition.query),
      screenshotPath: path.join(screenshotsDirectory, `${definition.id}.png`),
      htmlPath: path.join(htmlDirectory, `${definition.id}.html`),
      resultPath: path.join(summariesDirectory, `${definition.id}.json`),
    };
  });
}

async function runCodexJson({
  prompt,
  schema,
  outputPath,
  images = [],
  model,
  timeoutMs,
  bypass,
  sandbox,
}) {
  const temporaryDirectory = await mkdtemp(
    path.join(repoRoot, ".tmp-paper-import-schema-"),
  );
  const schemaPath = path.join(temporaryDirectory, "schema.json");

  try {
    await writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf8");

    const args = [
      "exec",
      "-C",
      repoRoot,
      "--ephemeral",
      "-o",
      outputPath,
      "--output-schema",
      schemaPath,
    ];

    if (bypass) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("-s", sandbox ?? "read-only");
    }

    if (model) {
      args.push("-m", model);
    }

    for (const imagePath of images) {
      args.push("-i", imagePath);
    }

    args.push(prompt);

    try {
      await runCommand("codex", args, {
        cwd: repoRoot,
        timeoutMs,
      });
    } catch (error) {
      if (await pathExists(outputPath)) {
        try {
          return JSON.parse(normalizeJsonOutput(await readFile(outputPath, "utf8")));
        } catch {
          // fall through to the original process error if the output file is incomplete
        }
      }

      throw error;
    }

    return JSON.parse(normalizeJsonOutput(await readFile(outputPath, "utf8")));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function inspectPaperFile({
  outputDirectory,
  model,
  timeoutMs,
}) {
  const resultPath = path.join(outputDirectory, "paper-file.json");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["available", "fileName", "pageName", "artboardCount", "detail"],
    properties: {
      available: { type: "boolean" },
      fileName: { type: ["string", "null"] },
      pageName: { type: ["string", "null"] },
      artboardCount: { type: ["integer", "null"] },
      detail: { type: ["string", "null"] },
    },
  };
  const prompt = [
    "Use the paper MCP server if available. Read-only only.",
    "Call paper.get_basic_info exactly once if Paper is available.",
    "Return JSON matching the schema.",
    "If Paper is unavailable, return available=false with null file/page/artboard values and a short detail string.",
  ].join("\n");

  return runCodexJson({
    prompt,
    schema,
    outputPath: resultPath,
    model,
    timeoutMs,
    bypass: false,
    sandbox: "read-only",
  });
}

async function inspectPaperArtboards({
  outputDirectory,
  model,
  timeoutMs,
}) {
  const resultPath = path.join(outputDirectory, "paper-artboards.json");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["available", "fileName", "artboards", "detail"],
    properties: {
      available: { type: "boolean" },
      fileName: { type: ["string", "null"] },
      artboards: {
        type: "array",
        items: { type: "string" },
      },
      detail: { type: ["string", "null"] },
    },
  };
  const prompt = [
    "Use the paper MCP server if available. Read-only only.",
    "Call paper.get_basic_info exactly once if Paper is available.",
    "Return JSON matching the schema with the open file name and the list of artboard names only.",
    "If Paper is unavailable, return available=false, fileName=null, artboards=[], and a short detail string.",
  ].join("\n");

  return runCodexJson({
    prompt,
    schema,
    outputPath: resultPath,
    model,
    timeoutMs,
    bypass: false,
    sandbox: "read-only",
  });
}

function buildImageImportHtml(surface, imageSource) {
  return [
    `<div style="width:${surface.viewport.width}px;height:${surface.viewport.height}px;overflow:hidden;background:#050816;">`,
    `<img src="${imageSource}" alt="${surface.title}" style="display:block;width:100%;height:100%;object-fit:cover;" />`,
    "</div>",
  ].join("");
}

function buildPaperImportPrompt(surface, paperFileName, htmlMarkup) {
  const fileGuardInstruction = paperFileName
    ? `- Before making changes, verify that paper.get_basic_info.fileName is exactly "${paperFileName}". If it does not match, make no changes and return status "skipped" with a clear mismatch note.`
    : "- Use the currently open Paper file returned by paper.get_basic_info.";

  return [
    `Import the current Shipyard surface "${surface.title}" into Paper as a screenshot-backed artboard.`,
    "",
    "Requirements:",
    fileGuardInstruction,
    `- Create exactly one new artboard named "${surface.artboardName}" at ${surface.viewport.width}x${surface.viewport.height}.`,
    "- Use only paper MCP tools. Do not run shell commands, do not start nested codex sessions, and do not call unrelated external tools.",
    "- If a placement helper is available in the Paper tool set, use it before creating the artboard. If it is not available, inspect the existing artboards from paper.get_basic_info and choose a clearly non-overlapping placement manually.",
    "- Insert the exact HTML provided below into the new artboard with paper.write_html in insert-children mode.",
    "- Do not call paper.get_fill_image, paper.get_screenshot, or other verification tools that would dump large image payloads. Once the artboard is created and the HTML is written, return the structured result immediately.",
    "- Keep the imported screenshot exactly as provided. Do not redesign, reinterpret, or crop it.",
    "- Do not modify, replace, or delete any existing artboards or nodes.",
    `- Surface context: ${surface.description}`,
    "- Exact HTML to insert:",
    htmlMarkup,
    "- Return JSON matching the schema with status imported, skipped, or error.",
  ].join("\n");
}

async function importSurfaceToPaper({
  surface,
  outputDirectory,
  paperFileName,
  model,
  timeoutMs,
  baselineArtboards,
}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["status", "surfaceId", "artboardName", "fileName", "notes"],
    properties: {
      status: {
        type: "string",
        enum: ["imported", "skipped", "error"],
      },
      surfaceId: { type: "string" },
      artboardName: { type: "string" },
      fileName: { type: ["string", "null"] },
      notes: { type: "string" },
    },
  };

  const screenshotFileUrl = pathToFileURL(surface.screenshotPath).href;
  const htmlMarkup = buildImageImportHtml(surface, screenshotFileUrl);

  await writeFile(surface.htmlPath, `${htmlMarkup}\n`, "utf8");

  const prompt = buildPaperImportPrompt(surface, paperFileName, htmlMarkup);
  try {
    const rawResult = await runCodexJson({
      prompt,
      schema,
      outputPath: surface.resultPath,
      model,
      timeoutMs,
      bypass: true,
    });

    return {
      ...rawResult,
      surfaceId: surface.id,
      screenshotPath: surface.screenshotPath,
      previewUrl: surface.previewUrl,
    };
  } catch (error) {
    const paperState = await inspectPaperArtboards({
      outputDirectory,
      model,
      timeoutMs: Math.min(timeoutMs, 30_000),
    });
    const artboardExists = paperState.artboards.includes(surface.artboardName);
    const artboardWasAlreadyPresent = baselineArtboards.includes(surface.artboardName);
    const timeoutDetected =
      error instanceof Error &&
      /timed out|ETIMEDOUT/iu.test(error.message);

    if (paperState.available && artboardExists && !artboardWasAlreadyPresent) {
      return {
        status: "imported",
        surfaceId: surface.id,
        artboardName: surface.artboardName,
        fileName: paperState.fileName,
        notes: timeoutDetected
          ? "Codex timed out while preparing the final summary, but the new Paper artboard exists."
          : "Codex exited before returning structured JSON, but the new Paper artboard exists.",
        screenshotPath: surface.screenshotPath,
        previewUrl: surface.previewUrl,
      };
    }

    throw error;
  }
}

async function waitForUrl(url, timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until the preview server is ready or timeout expires
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  }

  throw new Error(`Timed out waiting for preview server at ${url}.`);
}

async function startPreviewServer(host, port) {
  const previewUrl = `http://${host}:${port}/preview.html`;
  const child = spawn(
    "pnpm",
    [
      "--dir",
      "shipyard",
      "exec",
      "vite",
      "--host",
      host,
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );
  let stdout = "";
  let stderr = "";

  const readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out starting the preview harness.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, 15_000);

    function clearAndResolve() {
      clearTimeout(timer);
      resolve(undefined);
    }

    function handleFailure(code) {
      clearTimeout(timer);
      reject(
        new Error(
          `Preview harness exited before becoming ready (code ${String(code)}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }

    child.on("exit", handleFailure);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();

      if (
        stdout.includes(previewUrl) ||
        /ready in/iu.test(stdout)
      ) {
        child.off("exit", handleFailure);
        clearAndResolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();

      if (
        stderr.includes(previewUrl) ||
        /ready in/iu.test(stderr)
      ) {
        child.off("exit", handleFailure);
        clearAndResolve();
      }
    });
  });

  await readyPromise;
  await waitForUrl(previewUrl);

  return {
    child,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill("SIGTERM");

      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) {
            child.kill("SIGKILL");
          }
          resolve(undefined);
        }, 5_000);

        child.once("exit", () => {
          clearTimeout(timer);
          resolve(undefined);
        });
      });
    },
  };
}

async function captureSurfaceScreenshots(surfaces) {
  const { chromium } = requireFromShipyard("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    for (const surface of surfaces) {
      const context = await browser.newContext({
        viewport: surface.viewport,
      });
      const page = await context.newPage();

      await page.goto(surface.previewUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: surface.screenshotPath,
        fullPage: false,
      });

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function writeRunSummary({
  outputDirectory,
  paperInfo,
  captureOnly,
  allowAnyPaperFile,
  paperFileName,
  surfaces,
  results,
}) {
  const summaryPath = path.join(outputDirectory, "summary.md");
  const summaryJsonPath = path.join(outputDirectory, "summary.json");
  const summaryJson = {
    paper: paperInfo,
    captureOnly,
    allowAnyPaperFile,
    paperFileName,
    surfaces: surfaces.map((surface) => ({
      id: surface.id,
      artboardName: surface.artboardName,
      previewUrl: surface.previewUrl,
      screenshotPath: relativeToRepo(surface.screenshotPath),
    })),
    results,
  };
  const lines = [
    "# Paper UI Import",
    "",
    `- Capture only: ${captureOnly ? "yes" : "no"}`,
    `- Paper file guard: ${allowAnyPaperFile ? "allow any open file" : paperFileName ?? "none"}`,
    `- Open Paper file: ${paperInfo?.fileName ?? "not checked"}`,
    "",
    "## Surfaces",
  ];

  for (const surface of surfaces) {
    const result = results.find((candidate) => candidate.surfaceId === surface.id);

    lines.push(
      `- ${surface.id}: ${result?.status ?? "captured"} — ${surface.artboardName}`,
    );
    lines.push(`  screenshot: ${relativeToRepo(surface.screenshotPath)}`);

    if (result?.notes) {
      lines.push(`  notes: ${result.notes}`);
    }
  }

  await writeFile(summaryJsonPath, `${JSON.stringify(summaryJson, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "paper-file-name": { type: "string" },
      "allow-any-paper-file": { type: "boolean" },
      "capture-only": { type: "boolean" },
      surface: { type: "string", multiple: true },
      "output-dir": { type: "string" },
      "artboard-prefix": { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      model: { type: "string" },
      "timeout-ms": { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const captureOnly = Boolean(values["capture-only"]);
  const allowAnyPaperFile = Boolean(values["allow-any-paper-file"]);
  const paperFileName = values["paper-file-name"]?.trim() || null;

  if (paperFileName && allowAnyPaperFile) {
    throw new Error(
      "Choose either --paper-file-name or --allow-any-paper-file, not both.",
    );
  }

  if (!values["dry-run"] && !captureOnly && !paperFileName && !allowAnyPaperFile) {
    throw new Error(
      "Actual Paper imports require either --paper-file-name or --allow-any-paper-file.",
    );
  }

  const outputDirectory = path.resolve(
    repoRoot,
    values["output-dir"]?.trim() || defaultOutputDirectory,
  );
  const host = values.host?.trim() || defaultPreviewHost;
  const port = parsePositiveInteger(values.port, defaultPreviewPort);
  const artboardPrefix = values["artboard-prefix"]?.trim() || defaultArtboardPrefix;
  const model = values.model?.trim() || defaultCodexModel;
  const timeoutMs = parsePositiveInteger(values["timeout-ms"], defaultTimeoutMs);
  const surfaceIds = normalizeSurfaceIds(values.surface);
  const surfaces = createSurfaceRunPlan({
    outputDirectory,
    artboardPrefix,
    host,
    port,
    surfaceIds,
  });

  if (values["dry-run"]) {
    console.log(
      JSON.stringify(
        {
          paperFileName,
          allowAnyPaperFile,
          captureOnly,
          outputDirectory: relativeToRepo(outputDirectory),
          previewServer: { host, port },
          surfaces: surfaces.map((surface) => ({
            id: surface.id,
            artboardName: surface.artboardName,
            previewUrl: surface.previewUrl,
            screenshotPath: relativeToRepo(surface.screenshotPath),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  await mkdir(path.join(outputDirectory, "screenshots"), { recursive: true });
  await mkdir(path.join(outputDirectory, "surface-results"), { recursive: true });
  await mkdir(path.join(outputDirectory, "html"), { recursive: true });

  let previewServer = null;
  let paperInfo = null;
  let paperState = null;
  const results = [];

  try {
    if (!captureOnly) {
      paperInfo = await inspectPaperFile({
        outputDirectory,
        model,
        timeoutMs,
      });

      if (!paperInfo.available) {
        throw new Error(
          `Paper is not available: ${paperInfo.detail ?? "no detail returned"}.`,
        );
      }

      if (paperFileName && paperInfo.fileName !== paperFileName) {
        throw new Error(
          `Open Paper file mismatch. Expected "${paperFileName}" but found "${paperInfo.fileName ?? "unknown"}".`,
        );
      }

      paperState = await inspectPaperArtboards({
        outputDirectory,
        model,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
    }

    previewServer = await startPreviewServer(host, port);
    console.log(`Preview harness ready at http://${host}:${port}/preview.html`);

    await captureSurfaceScreenshots(surfaces);
    console.log(`Captured ${surfaces.length} preview surface(s).`);

    if (!captureOnly) {
      for (const surface of surfaces) {
        console.log(`Importing ${surface.id} into Paper…`);
        const result = await importSurfaceToPaper({
          surface,
          outputDirectory,
          paperFileName,
          model,
          timeoutMs,
          baselineArtboards: paperState?.artboards ?? [],
        });
        results.push(result);
        console.log(`${surface.id}: ${result.status}`);

        paperState = await inspectPaperArtboards({
          outputDirectory,
          model,
          timeoutMs: Math.min(timeoutMs, 30_000),
        });
      }
    }
  } finally {
    if (previewServer) {
      await previewServer.stop();
    }
  }

  await writeRunSummary({
    outputDirectory,
    paperInfo,
    captureOnly,
    allowAnyPaperFile,
    paperFileName,
    surfaces,
    results,
  });

  const errorResults = results.filter((result) => result.status === "error");

  if (errorResults.length > 0) {
    throw new Error(
      `Paper import completed with ${errorResults.length} error surface(s). See ${relativeToRepo(path.join(outputDirectory, "summary.md"))}.`,
    );
  }

  console.log(
    captureOnly
      ? `Captured ${surfaces.length} surface(s). Summary: ${relativeToRepo(path.join(outputDirectory, "summary.md"))}`
      : `Imported ${surfaces.length} surface(s) into Paper. Summary: ${relativeToRepo(path.join(outputDirectory, "summary.md"))}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
