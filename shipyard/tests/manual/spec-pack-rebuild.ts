import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { discoverTarget } from "../../src/context/discovery.js";
import { loadProjectRules } from "../../src/context/envelope.js";
import {
  createSessionState,
  ensureShipyardDirectories,
  loadSessionState,
  saveSessionState,
} from "../../src/engine/state.js";
import {
  createInstructionRuntimeState,
  executeInstructionTurn,
} from "../../src/engine/turn.js";

const DEFAULT_SPEC_MOUNT_PATH = ".shipyard/spec";
const DEFAULT_RESULT_FILE_NAME = "spec-pack-run-result.json";
const DEFAULT_PROMPT = `
You are a software factory rebuilding a product from a current-state spec pack.

SPEC_ROOT="${DEFAULT_SPEC_MOUNT_PATH}"

Treat SPEC_ROOT as the primary build contract.
Treat SPEC_ROOT as a target-relative, read-only mounted spec pack.
Use target-relative paths when calling load_spec or read_file on the pack.

Execution contract:
1. Start by reading SPEC_ROOT/README.md.
2. Read any additional spec files needed before making changes.
3. If the target is empty, bootstrap the narrowest fitting scaffold first.
4. Keep changes faithful to the spec pack rather than redesigning the product.
5. Continue through implementation and verification.
`.trim();

interface ParsedArgs {
  specRoot: string;
  instructionFilePath: string | null;
  instructionText: string | null;
  targetDirectory: string | null;
  sessionId: string | null;
  cleanup: boolean;
}

interface RunnerResultFile {
  specRoot: string;
  mountedSpecPath: string;
  targetDirectory: string;
  sessionId: string;
  status: "success" | "error" | "cancelled";
  summary: string;
  finalText: string;
  createdEntries: string[];
  turnCount: number;
  rollingSummary: string;
  eventLog: Array<Record<string, unknown>>;
}

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  pnpm manual:spec-pack -- --spec-root /abs/path/to/spec-pack [--instruction-file /abs/path/to/prompt.md]",
      "",
      "Options:",
      "  --spec-root <path>         Absolute or relative path to the external spec pack.",
      "  --instruction-file <path>  File containing the instruction to run.",
      "  --instruction <text>       Inline instruction text. Ignored if --instruction-file is set.",
      "  --target-dir <path>        Reuse a specific target directory instead of a temp target.",
      "  --session-id <id>          Resume an existing Shipyard session inside --target-dir.",
      "  --cleanup                  Remove the target directory after the run finishes.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  let specRoot: string | null = null;
  let instructionFilePath: string | null = null;
  let instructionText: string | null = null;
  let targetDirectory: string | null = null;
  let sessionId: string | null = null;
  let cleanup = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--") {
      continue;
    }

    if (current === "--spec-root") {
      specRoot = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (current === "--instruction-file") {
      instructionFilePath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (current === "--instruction") {
      instructionText = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (current === "--target-dir") {
      targetDirectory = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (current === "--session-id") {
      sessionId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (current === "--cleanup") {
      cleanup = true;
      continue;
    }

    if (current === "--help" || current === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!specRoot?.trim()) {
    throw new Error("Missing required --spec-root argument.");
  }

  return {
    specRoot,
    instructionFilePath,
    instructionText,
    targetDirectory,
    sessionId,
    cleanup,
  };
}

async function resolveInstruction(options: ParsedArgs): Promise<string> {
  if (options.instructionFilePath) {
    return readFile(path.resolve(options.instructionFilePath), "utf8");
  }

  if (options.instructionText?.trim()) {
    return options.instructionText;
  }

  if (options.sessionId) {
    return "Continue from the persisted handoff and finish the remaining task plan safely. Continue implementing the rebuild rather than stopping after more spec reading.";
  }

  return DEFAULT_PROMPT;
}

async function createTargetDirectory(requestedPath: string | null): Promise<string> {
  if (requestedPath) {
    const resolved = path.resolve(requestedPath);
    await mkdir(resolved, { recursive: true });
    return resolved;
  }

  return mkdtemp(path.join(tmpdir(), "shipyard-spec-pack-run-"));
}

async function mountSpecPack(
  targetDirectory: string,
  specRoot: string,
): Promise<string> {
  const resolvedSpecRoot = path.resolve(specRoot);
  const mountedSpecPath = path.join(targetDirectory, DEFAULT_SPEC_MOUNT_PATH);
  await mkdir(path.dirname(mountedSpecPath), { recursive: true });

  await rm(mountedSpecPath, { recursive: true, force: true });
  await symlink(resolvedSpecRoot, mountedSpecPath, "dir");

  return mountedSpecPath;
}

async function collectCreatedEntries(
  root: string,
  current = root,
  depth = 0,
  entries: string[] = [],
): Promise<string[]> {
  if (depth > 4 || entries.length >= 200) {
    return entries;
  }

  const children = await readdir(current, { withFileTypes: true });

  for (const child of children) {
    if (child.name === ".shipyard") {
      continue;
    }

    const absolutePath = path.join(current, child.name);
    const relativePath = path.relative(root, absolutePath) || ".";
    entries.push(relativePath + (child.isDirectory() ? "/" : child.isSymbolicLink() ? "@" : ""));

    if (child.isDirectory()) {
      await collectCreatedEntries(root, absolutePath, depth + 1, entries);
    }

    if (entries.length >= 200) {
      break;
    }
  }

  return entries;
}

function summarizeForLog(text: string, limit = 220): string {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const instruction = await resolveInstruction(args);
  const targetDirectory = await createTargetDirectory(args.targetDirectory);
  const mountedSpecPath = await mountSpecPack(targetDirectory, args.specRoot);
  await ensureShipyardDirectories(targetDirectory);

  const discovery = await discoverTarget(targetDirectory);
  const sessionState = args.sessionId
    ? await loadSessionState(targetDirectory, args.sessionId)
    : null;

  if (args.sessionId && sessionState === null) {
    throw new Error(
      `No saved session found for ${args.sessionId} in ${targetDirectory}.`,
    );
  }

  const activeSessionState = sessionState ?? createSessionState({
    sessionId: randomUUID(),
    targetDirectory,
    discovery,
  });
  activeSessionState.discovery = discovery;
  await saveSessionState(activeSessionState);

  const runtimeState = createInstructionRuntimeState({
    projectRules: await loadProjectRules(targetDirectory),
    baseInjectedContext: [
      `Spec pack is mounted read-only at ${DEFAULT_SPEC_MOUNT_PATH}.`,
      "Use target-relative paths when reading the external spec pack.",
    ],
  });

  const eventLog: Array<Record<string, unknown>> = [];
  const rememberEvent = (entry: Record<string, unknown>) => {
    eventLog.push({
      at: new Date().toISOString(),
      ...entry,
    });
  };

  console.log(`TARGET_DIR=${targetDirectory}`);
  console.log(`SESSION_ID=${activeSessionState.sessionId}`);
  console.log(`SPEC_MOUNT=${mountedSpecPath}`);
  console.log(`RESUMED_SESSION=${args.sessionId ? "yes" : "no"}`);
  console.log("RUN_STARTED");

  const result = await executeInstructionTurn({
    sessionState: activeSessionState,
    runtimeState,
    instruction,
    reporter: {
      onThinking(message) {
        console.log(`[thinking] ${summarizeForLog(message)}`);
        rememberEvent({
          type: "thinking",
          message,
        });
      },
      onToolCall(event) {
        console.log(`[tool-call] ${event.toolName}: ${event.summary}`);
        rememberEvent({
          type: "tool-call",
          callId: event.callId,
          toolName: event.toolName,
          summary: event.summary,
        });
      },
      onToolResult(event) {
        console.log(
          `[tool-result] ${event.toolName} ${event.success ? "ok" : "error"}: ${event.summary}`,
        );
        rememberEvent({
          type: "tool-result",
          callId: event.callId,
          toolName: event.toolName,
          success: event.success,
          summary: event.summary,
        });
      },
      onEdit(event) {
        console.log(`[edit] ${event.path}: ${event.summary}`);
        rememberEvent({
          type: "edit",
          path: event.path,
          summary: event.summary,
        });
      },
      onError(message) {
        console.log(`[error] ${message}`);
        rememberEvent({
          type: "error",
          message,
        });
      },
      onDone(event) {
        console.log(`[done] ${event.status}: ${event.summary}`);
        rememberEvent({
          type: "done",
          status: event.status,
          summary: event.summary,
        });
      },
    },
  });

  const createdEntries = await collectCreatedEntries(targetDirectory);
  const resultFilePath = path.join(
    targetDirectory,
    ".shipyard",
    DEFAULT_RESULT_FILE_NAME,
  );
  const resultFile: RunnerResultFile = {
    specRoot: path.resolve(args.specRoot),
    mountedSpecPath: DEFAULT_SPEC_MOUNT_PATH,
    targetDirectory,
    sessionId: activeSessionState.sessionId,
    status: result.status,
    summary: result.summary,
    finalText: result.finalText,
    createdEntries,
    turnCount: activeSessionState.turnCount,
    rollingSummary: activeSessionState.rollingSummary,
    eventLog,
  };
  await writeFile(resultFilePath, JSON.stringify(resultFile, null, 2), "utf8");

  console.log(`RESULT_FILE=${resultFilePath}`);
  console.log("RUN_FINISHED");

  if (args.cleanup) {
    await rm(targetDirectory, { recursive: true, force: true });
    console.log(`CLEANED_TARGET_DIR=${targetDirectory}`);
  }

  if (result.status !== "success") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.stack ?? error.message
    : String(error);
  console.error(`[spec-pack-run] failed\n${message}`);
  process.exitCode = 1;
});
