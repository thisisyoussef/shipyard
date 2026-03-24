import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
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
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function startCli(args: string[]): RunningCli {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "./src/bin/shipyard.ts", ...args],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: "pipe",
    },
  );
  const output = {
    stdout: "",
    stderr: "",
    combined: "",
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk;
    output.combined += chunk;
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    output.stderr += chunk;
    output.combined += chunk;
  });

  return { child, output };
}

async function waitForText(
  runner: RunningCli,
  text: string | RegExp,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found =
      typeof text === "string"
        ? runner.output.combined.includes(text)
        : text.test(runner.output.combined);

    if (found) {
      return;
    }

    if (runner.child.exitCode !== null) {
      throw new Error(
        `Shipyard exited early while waiting for ${String(text)}.\n\n${runner.output.combined}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    `Timed out waiting for ${String(text)}.\n\n${runner.output.combined}`,
  );
}

function sendLine(runner: RunningCli, line: string): void {
  runner.child.stdin.write(`${line}\n`);
}

async function stopCli(runner: RunningCli): Promise<void> {
  if (runner.child.exitCode === null) {
    runner.child.stdin.end();
    await once(runner.child, "exit");
  }
}

async function waitForProcessExit(runner: RunningCli): Promise<void> {
  if (runner.child.exitCode !== null) {
    return;
  }

  await once(runner.child, "exit");
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
  timeoutMs = 5_000,
): Promise<SessionState> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const state = await readSessionFile(targetDirectory, sessionId);

      if (predicate(state)) {
        return state;
      }
    } catch {
      // The file may not be written yet; keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    `Timed out waiting for session ${sessionId} to satisfy the expected state.`,
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
      const runner = startCli(["--target", targetDirectory]);

      try {
        await waitForText(runner, "Started new session");
        await waitForText(runner, "Detected greenfield target.");
        await waitForText(runner, 'Type "help" for commands.');

        const sessionId = extractSessionId(runner.output.combined);

        sendLine(runner, "status");
        await waitForText(runner, '"turnCount": 0');

        sendLine(runner, "create a README");
        await waitForText(runner, 'Turn 1 planned in phase "code".');

        const firstSnapshot = await waitForSessionState(
          targetDirectory,
          sessionId,
          (state) => state.turnCount === 1,
        );
        expect(firstSnapshot.turnCount).toBe(1);
        expect(firstSnapshot.discovery.isGreenfield).toBe(true);

        sendLine(runner, "status");
        await waitForText(runner, '"turnCount": 1');

        sendLine(runner, "add a package.json");
        await waitForText(runner, 'Turn 2 planned in phase "code".');

        const secondSnapshot = await waitForSessionState(
          targetDirectory,
          sessionId,
          (state) => state.turnCount === 2,
        );
        expect(secondSnapshot.turnCount).toBe(2);
        expect(secondSnapshot.rollingSummary).toContain("Turn 1: create a README");
        expect(secondSnapshot.rollingSummary).toContain("Turn 2: add a package.json");

        sendLine(runner, "exit");
        await waitForText(runner, "Shipyard session closed.");
        await waitForProcessExit(runner);
      } finally {
        await stopCli(runner);
      }
    },
    20_000,
  );

  it(
    "resumes an existing session and keeps the prior turn count",
    async () => {
      const targetDirectory = await createTempDirectory("shipyard-cli-resume-");
      const firstRun = startCli(["--target", targetDirectory]);
      let sessionId = "";

      try {
        await waitForText(firstRun, "Started new session");
        await waitForText(firstRun, 'Type "help" for commands.');
        sessionId = extractSessionId(firstRun.output.combined);

        sendLine(firstRun, "inspect the repo");
        await waitForText(firstRun, 'Turn 1 planned in phase "code".');
        sendLine(firstRun, "exit");
        await waitForText(firstRun, "Shipyard session closed.");
        await waitForProcessExit(firstRun);
      } finally {
        await stopCli(firstRun);
      }

      const resumedRun = startCli([
        "--target",
        targetDirectory,
        "--session",
        sessionId,
      ]);

      try {
        await waitForText(resumedRun, `Resumed session ${sessionId} (1 turn)`);
        await waitForText(resumedRun, 'Type "help" for commands.');
        sendLine(resumedRun, "status");
        await waitForText(resumedRun, '"turnCount": 1');

        const resumedSnapshot = await waitForSessionState(
          targetDirectory,
          sessionId,
          (state) => state.turnCount === 1,
        );
        expect(resumedSnapshot.turnCount).toBe(1);
        expect(resumedSnapshot.sessionId).toBe(sessionId);

        sendLine(resumedRun, "exit");
        await waitForText(resumedRun, "Shipyard session closed.");
        await waitForProcessExit(resumedRun);
      } finally {
        await stopCli(resumedRun);
      }
    },
    20_000,
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

      const runner = startCli(["--target", targetDirectory]);

      try {
        await waitForText(runner, "Detected existing target.");
        await waitForText(runner, "Language: typescript");
        await waitForText(runner, "Framework: React");
        await waitForText(runner, "Package manager: unknown");
        await waitForText(runner, 'Type "help" for commands.');

        sendLine(runner, "exit");
        await waitForText(runner, "Shipyard session closed.");
        await waitForProcessExit(runner);
      } finally {
        await stopCli(runner);
      }
    },
    20_000,
  );
});
