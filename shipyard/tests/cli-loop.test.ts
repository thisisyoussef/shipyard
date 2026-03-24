import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { SessionState } from "../src/engine/state.js";

const createdDirectories: string[] = [];
const appRoot = fileURLToPath(new URL("..", import.meta.url));

interface RunningCli {
  child: ChildProcessWithoutNullStreams;
  output: {
    stdout: string;
    stderr: string;
    combined: string;
  };
  waitForStateChange: (timeoutMs: number) => Promise<void>;
}

const LIVE_RUNTIME_ENV = {
  ANTHROPIC_API_KEY: "",
  SHIPYARD_RUNTIME_MODE: "fallback",
} satisfies Record<string, string>;
const CLI_TEST_TIMEOUT_MS = 30_000;
const OUTPUT_WAIT_TIMEOUT_MS = 10_000;
const SESSION_WAIT_TIMEOUT_MS = 7_500;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function startCli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): RunningCli {
  const stateChangeListeners = new Set<() => void>();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "./src/bin/shipyard.ts", ...args],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        ...envOverrides,
      },
      stdio: "pipe",
    },
  );
  const output = {
    stdout: "",
    stderr: "",
    combined: "",
  };
  const notifyStateChange = () => {
    for (const listener of [...stateChangeListeners]) {
      listener();
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk;
    output.combined += chunk;
    notifyStateChange();
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    output.stderr += chunk;
    output.combined += chunk;
    notifyStateChange();
  });

  child.on("exit", () => {
    notifyStateChange();
  });

  return {
    child,
    output,
    waitForStateChange(timeoutMs) {
      return new Promise((resolve) => {
        const onStateChange = () => {
          cleanup();
          resolve();
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timer);
          stateChangeListeners.delete(onStateChange);
        };

        stateChangeListeners.add(onStateChange);
      });
    },
  };
}

interface WaitForTextOptions {
  cursor?: number;
  label?: string;
  timeoutMs?: number;
}

interface WaitForSessionStateOptions {
  label?: string;
  timeoutMs?: number;
}

function findOutputMatch(
  output: string,
  expected: string | RegExp,
): { index: number; length: number } | null {
  if (typeof expected === "string") {
    const index = output.indexOf(expected);

    if (index === -1) {
      return null;
    }

    return {
      index,
      length: expected.length,
    };
  }

  const index = output.search(expected);

  if (index === -1) {
    return null;
  }

  const match = output.slice(index).match(expected);

  return {
    index,
    length: match?.[0]?.length ?? 0,
  };
}

function describeExpectation(expected: string | RegExp): string {
  return typeof expected === "string" ? JSON.stringify(expected) : expected.toString();
}

function renderOutputSinceCursor(
  runner: RunningCli,
  cursor: number,
): string {
  const output = runner.output.combined.slice(cursor).trimEnd();
  return output || "(no new output)";
}

async function waitForPrompt(
  runner: RunningCli,
  cursor = 0,
  label = "CLI prompt",
): Promise<number> {
  return waitForText(runner, "shipyard > ", {
    cursor,
    label,
  });
}

async function waitForText(
  runner: RunningCli,
  text: string | RegExp,
  options: WaitForTextOptions = {},
): Promise<number> {
  const cursor = options.cursor ?? 0;
  const timeoutMs = options.timeoutMs ?? OUTPUT_WAIT_TIMEOUT_MS;
  const label = options.label ?? `output ${describeExpectation(text)}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const outputSinceCursor = runner.output.combined.slice(cursor);
    const match = findOutputMatch(outputSinceCursor, text);

    if (match) {
      return cursor + match.index + match.length;
    }

    if (runner.child.exitCode !== null) {
      throw new Error(
        `Shipyard exited early while waiting for ${label} (${describeExpectation(text)}).\n\nOutput since milestone:\n${renderOutputSinceCursor(runner, cursor)}`,
      );
    }

    await runner.waitForStateChange(Math.max(1, deadline - Date.now()));
  }

  throw new Error(
    `Timed out waiting for ${label} (${describeExpectation(text)}) after ${String(timeoutMs)}ms.\n\nOutput since milestone:\n${renderOutputSinceCursor(runner, cursor)}`,
  );
}

function sendLine(runner: RunningCli, line: string): void {
  runner.child.stdin.write(`${line}\n`);
}

async function stopCli(runner: RunningCli): Promise<void> {
  if (runner.child.exitCode === null) {
    runner.child.stdin.end();
    try {
      await waitForProcessExit(
        runner,
        "CLI process exit during cleanup",
        PROCESS_EXIT_TIMEOUT_MS,
      );
    } catch {
      runner.child.kill("SIGTERM");
      await waitForProcessExit(
        runner,
        "CLI process exit after SIGTERM cleanup",
        PROCESS_EXIT_TIMEOUT_MS,
      );
    }
  }
}

async function waitForProcessExit(
  runner: RunningCli,
  label = "CLI process exit",
  timeoutMs = PROCESS_EXIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (runner.child.exitCode !== null) {
      return;
    }

    await runner.waitForStateChange(Math.max(1, deadline - Date.now()));
  }

  throw new Error(
    `Timed out waiting for ${label} after ${String(timeoutMs)}ms.\n\nCombined output:\n${runner.output.combined.trimEnd() || "(no output)"}`,
  );
}

function extractSessionId(output: string): string {
  const match = output.match(
    /(?:Started new session|Resumed session)\s+([A-Za-z0-9_-]+)/,
  );

  if (!match?.[1]) {
    throw new Error(`Could not find a session ID in output.\n\n${output}`);
  }

  return match[1];
}

async function readSessionFile(
  targetDirectory: string,
  sessionId: string,
): Promise<SessionState> {
  const sessionPath = path.join(
    targetDirectory,
    ".shipyard",
    "sessions",
    `${sessionId}.json`,
  );
  const contents = await readFile(sessionPath, "utf8");
  return JSON.parse(contents) as SessionState;
}

async function waitForSessionState(
  targetDirectory: string,
  sessionId: string,
  predicate: (state: SessionState) => boolean,
  options: WaitForSessionStateOptions = {},
): Promise<SessionState> {
  const timeoutMs = options.timeoutMs ?? SESSION_WAIT_TIMEOUT_MS;
  const label = options.label ?? `session ${sessionId} state`;
  const deadline = Date.now() + timeoutMs;
  let lastState: SessionState | null = null;
  let lastReadError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const state = await readSessionFile(targetDirectory, sessionId);
      lastState = state;
      lastReadError = null;

      if (predicate(state)) {
        return state;
      }
    } catch (error) {
      // The file may not be written yet; keep polling until timeout.
      lastReadError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const details = lastState
    ? JSON.stringify(lastState, null, 2)
    : lastReadError
      ? `Last read error: ${lastReadError}`
      : "No session state was read before timeout.";

  throw new Error(
    `Timed out waiting for ${label} after ${String(timeoutMs)}ms.\n\n${details}`,
  );
}

describe("shipyard CLI loop", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it(
    "stays alive across instructions and persists the session after each turn",
    async () => {
      const targetDirectory = await createTempDirectory("shipyard-cli-greenfield-");
      const runner = startCli(["--target", targetDirectory], LIVE_RUNTIME_ENV);
      let cursor = 0;

      try {
        cursor = await waitForText(runner, "Started new session", {
          cursor,
          label: "startup session banner",
        });
        cursor = await waitForText(runner, "Detected greenfield target.", {
          cursor,
          label: "greenfield discovery banner",
        });
        cursor = await waitForText(runner, 'Type "help" for commands.', {
          cursor,
          label: "startup help hint",
        });
        cursor = await waitForPrompt(runner, cursor, "initial prompt");

        const sessionId = extractSessionId(runner.output.combined);

        sendLine(runner, "status");
        cursor = await waitForText(runner, '"turnCount": 0', {
          cursor,
          label: "status output after startup",
        });
        cursor = await waitForPrompt(runner, cursor, "prompt after startup status");

        sendLine(runner, "create a README");
        cursor = await waitForText(
          runner,
          'Turn 1 finished in phase "code" via graph runtime.',
          {
            cursor,
            label: "turn 1 completion summary",
          },
        );
        cursor = await waitForText(runner, "Turn 1 stopped: Missing ANTHROPIC_API_KEY", {
          cursor,
          label: "turn 1 final text",
        });

        const firstSnapshot = await waitForSessionState(
          targetDirectory,
          sessionId,
          (state) => state.turnCount === 1,
          {
            label: "session persistence after turn 1",
          },
        );
        expect(firstSnapshot.turnCount).toBe(1);
        expect(firstSnapshot.discovery.isGreenfield).toBe(true);
        cursor = await waitForPrompt(runner, cursor, "prompt after turn 1");

        sendLine(runner, "status");
        cursor = await waitForText(runner, '"turnCount": 1', {
          cursor,
          label: "status output after turn 1",
        });
        cursor = await waitForPrompt(runner, cursor, "prompt after status post-turn 1");

        sendLine(runner, "add a package.json");
        cursor = await waitForText(
          runner,
          'Turn 2 finished in phase "code" via graph runtime.',
          {
            cursor,
            label: "turn 2 completion summary",
          },
        );
        cursor = await waitForText(runner, "Turn 2 stopped: Missing ANTHROPIC_API_KEY", {
          cursor,
          label: "turn 2 final text",
        });

        const secondSnapshot = await waitForSessionState(
          targetDirectory,
          sessionId,
          (state) => state.turnCount === 2,
          {
            label: "session persistence after turn 2",
          },
        );
        expect(secondSnapshot.turnCount).toBe(2);
        expect(secondSnapshot.rollingSummary).toContain("Turn 1: create a README ->");
        expect(secondSnapshot.rollingSummary).toContain("Turn 2: add a package.json ->");
        cursor = await waitForPrompt(runner, cursor, "prompt after turn 2");

        sendLine(runner, "exit");
        cursor = await waitForText(runner, "Shipyard session closed.", {
          cursor,
          label: "session close text",
        });
        await waitForProcessExit(runner, "process exit after exit command");
      } finally {
        await stopCli(runner);
      }
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    "resumes an existing session and keeps the prior turn count",
    async () => {
      const targetDirectory = await createTempDirectory("shipyard-cli-resume-");
      const firstRun = startCli(["--target", targetDirectory], LIVE_RUNTIME_ENV);
      let sessionId = "";
      let firstCursor = 0;

      try {
        firstCursor = await waitForText(firstRun, "Started new session", {
          cursor: firstCursor,
          label: "initial session banner for resume setup",
        });
        firstCursor = await waitForText(firstRun, 'Type "help" for commands.', {
          cursor: firstCursor,
          label: "initial help hint for resume setup",
        });
        firstCursor = await waitForPrompt(
          firstRun,
          firstCursor,
          "initial prompt for resume setup",
        );
        sessionId = extractSessionId(firstRun.output.combined);

        sendLine(firstRun, "inspect the repo");
        firstCursor = await waitForText(
          firstRun,
          'Turn 1 finished in phase "code" via graph runtime.',
          {
            cursor: firstCursor,
            label: "resume setup turn completion summary",
          },
        );
        firstCursor = await waitForText(
          firstRun,
          "Turn 1 stopped: Missing ANTHROPIC_API_KEY",
          {
            cursor: firstCursor,
            label: "resume setup final text",
          },
        );
        firstCursor = await waitForPrompt(
          firstRun,
          firstCursor,
          "prompt after resume setup turn",
        );
        sendLine(firstRun, "exit");
        firstCursor = await waitForText(firstRun, "Shipyard session closed.", {
          cursor: firstCursor,
          label: "resume setup close text",
        });
        await waitForProcessExit(firstRun, "process exit after resume setup close");
      } finally {
        await stopCli(firstRun);
      }

      const resumedRun = startCli([
        "--target",
        targetDirectory,
        "--session",
        sessionId,
      ], LIVE_RUNTIME_ENV);
      let resumedCursor = 0;

      try {
        resumedCursor = await waitForText(
          resumedRun,
          `Resumed session ${sessionId} (1 turn)`,
          {
            cursor: resumedCursor,
            label: "resume banner",
          },
        );
        resumedCursor = await waitForText(resumedRun, 'Type "help" for commands.', {
          cursor: resumedCursor,
          label: "resume help hint",
        });
        resumedCursor = await waitForPrompt(
          resumedRun,
          resumedCursor,
          "prompt after resume",
        );
        sendLine(resumedRun, "status");
        resumedCursor = await waitForText(resumedRun, '"turnCount": 1', {
          cursor: resumedCursor,
          label: "resume status output",
        });
        resumedCursor = await waitForPrompt(
          resumedRun,
          resumedCursor,
          "prompt after resume status",
        );

        const resumedSnapshot = await waitForSessionState(
          targetDirectory,
          sessionId,
          (state) => state.turnCount === 1,
          {
            label: "persisted resumed session state",
          },
        );
        expect(resumedSnapshot.turnCount).toBe(1);
        expect(resumedSnapshot.sessionId).toBe(sessionId);

        sendLine(resumedRun, "exit");
        resumedCursor = await waitForText(resumedRun, "Shipyard session closed.", {
          cursor: resumedCursor,
          label: "resume run close text",
        });
        await waitForProcessExit(resumedRun, "process exit after resumed run close");
      } finally {
        await stopCli(resumedRun);
      }
    },
    CLI_TEST_TIMEOUT_MS,
  );

  it(
    "detects an existing project target",
    async () => {
      const targetDirectory = await createTempDirectory("shipyard-cli-existing-");
      await writeFile(
        path.join(targetDirectory, "package.json"),
        JSON.stringify(
          {
            name: "existing-app",
            dependencies: {
              react: "^19.0.0",
            },
            scripts: {
              test: "vitest run",
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        path.join(targetDirectory, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
        "utf8",
      );
      await writeFile(path.join(targetDirectory, "README.md"), "# Existing app\n", "utf8");

      const runner = startCli(["--target", targetDirectory], LIVE_RUNTIME_ENV);
      let cursor = 0;

      try {
        cursor = await waitForText(runner, "Detected existing target.", {
          cursor,
          label: "existing target discovery banner",
        });
        cursor = await waitForText(runner, "Language: typescript", {
          cursor,
          label: "existing target language line",
        });
        cursor = await waitForText(runner, "Framework: React", {
          cursor,
          label: "existing target framework line",
        });
        cursor = await waitForText(runner, "Package manager: unknown", {
          cursor,
          label: "existing target package manager line",
        });
        cursor = await waitForText(runner, 'Type "help" for commands.', {
          cursor,
          label: "existing target help hint",
        });
        cursor = await waitForPrompt(runner, cursor, "initial prompt for existing target");

        sendLine(runner, "exit");
        cursor = await waitForText(runner, "Shipyard session closed.", {
          cursor,
          label: "existing target close text",
        });
        await waitForProcessExit(runner, "process exit after existing target close");
      } finally {
        await stopCli(runner);
      }
    },
    CLI_TEST_TIMEOUT_MS,
  );
});
