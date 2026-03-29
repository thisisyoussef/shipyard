import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Command } from "commander";

import {
  createMissionPaths,
  loadMissionConfig,
} from "../src/mission-control/config.js";
import { formatEnvFile, loadEnvironmentFiles } from "../src/mission-control/env.js";
import {
  collectRecoveredRuntimeEnv,
  summarizeRecoveredRuntimeEnv,
} from "../src/mission-control/runtime-env.js";

function parseArgs(argv: string[]) {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();
  program
    .name("ultimate-mission-launch-agent")
    .requiredOption("--config <path>", "Path to the mission config JSON")
    .option("--print-only", "Only write files and print instructions", false)
    .parse(normalizedArgv, { from: "user" });

  return program.opts<{ config: string; printOnly: boolean }>();
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function sanitizeLaunchLabel(value: string): string {
  return value.replace(/[^A-Za-z0-9.-]/gu, "-");
}

function plistArray(values: string[]): string {
  return values
    .map((value) => `    <string>${xmlEscape(value)}</string>`)
    .join("\n");
}

function buildLaunchAgentPlist(options: {
  label: string;
  programArguments: string[];
  workingDirectory: string;
  stdoutPath: string;
  stderrPath: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(options.label)}</string>
  <key>ProgramArguments</key>
  <array>
${plistArray(options.programArguments)}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(options.workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xmlEscape(options.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(options.stderrPath)}</string>
</dict>
</plist>
`;
}

function runLaunchctl(args: string[]): void {
  execFileSync("launchctl", args, {
    stdio: "ignore",
  });
}

async function writeMissionConfigEnvFile(options: {
  configPath: string;
  envFilePath: string;
}): Promise<void> {
  const rawConfig = JSON.parse(await readFile(options.configPath, "utf8")) as {
    environment?: { envFiles?: string[] };
  };
  const envFiles = rawConfig.environment?.envFiles ?? [];

  if (!envFiles.includes(options.envFilePath)) {
    rawConfig.environment = {
      ...(rawConfig.environment ?? {}),
      envFiles: [...envFiles, options.envFilePath],
    };
    await writeFile(
      options.configPath,
      `${JSON.stringify(rawConfig, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const configPath = path.resolve(process.cwd(), args.config);
  const config = await loadMissionConfig(configPath);
  const paths = createMissionPaths(configPath);
  const launchDirectory = path.join(paths.missionDirectory, "launchd");
  const launchEnvPath = path.join(launchDirectory, "mission.bootstrap.env");
  const wrapperPath = path.join(launchDirectory, "run-watchdog.sh");
  const launchAgentLogPath = path.join(paths.logsDirectory, "launch-agent.log");
  const launchAgentErrorPath = path.join(paths.logsDirectory, "launch-agent.error.log");
  const label = `com.shipyard.mission.${sanitizeLaunchLabel(config.sessionId)}`;
  const launchdUid = process.getuid?.() ?? os.userInfo().uid;
  const plistPath = path.join(
    os.homedir(),
    "Library",
    "LaunchAgents",
    `${label}.plist`,
  );
  const loadedEnvironment = await loadEnvironmentFiles(config.environment.envFiles);
  const launchSecrets = {
    ...loadedEnvironment.env,
    ...collectRecoveredRuntimeEnv(loadedEnvironment.env),
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? "en_US.UTF-8",
    PATH:
      process.env.PATH ??
      "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  };

  await mkdir(paths.logsDirectory, { recursive: true });
  await mkdir(launchDirectory, { recursive: true });
  await mkdir(path.dirname(plistPath), { recursive: true });

  await writeFile(launchEnvPath, formatEnvFile(launchSecrets), { mode: 0o600 });
  await writeMissionConfigEnvFile({
    configPath,
    envFilePath: launchEnvPath,
  });

  const wrapper = `#!/bin/zsh
set -euo pipefail
cd ${shellEscape(config.shipyardDirectory)}
if [[ -f ${shellEscape(launchEnvPath)} ]]; then
  set -a
  source ${shellEscape(launchEnvPath)}
  set +a
fi
exec ${shellEscape(process.execPath)} --env-file-if-exists=.env --import tsx ./scripts/ultimate-mission-watchdog.ts -- --config ${shellEscape(configPath)}
`;

  await writeFile(wrapperPath, wrapper, { mode: 0o700 });
  await chmod(wrapperPath, 0o700);

  const plist = buildLaunchAgentPlist({
    label,
    programArguments: [wrapperPath],
    workingDirectory: config.shipyardDirectory,
    stdoutPath: launchAgentLogPath,
    stderrPath: launchAgentErrorPath,
  });
  await writeFile(plistPath, plist, { mode: 0o644 });

  if (!args.printOnly) {
    const domainTarget = `gui/${String(launchdUid)}/${label}`;
    try {
      runLaunchctl(["bootout", domainTarget]);
    } catch {
      // Fresh install is expected to fail bootout.
    }
    runLaunchctl(["bootstrap", `gui/${String(launchdUid)}`, plistPath]);
    runLaunchctl(["kickstart", "-k", domainTarget]);
  }

  process.stdout.write(
    [
      `Launch agent ${args.printOnly ? "prepared" : "installed"} for ${config.sessionId}.`,
      `Label: ${label}`,
      `Plist: ${plistPath}`,
      `Wrapper: ${wrapperPath}`,
      `Bootstrap env: ${launchEnvPath}`,
      `Recovered launch secrets: ${summarizeRecoveredRuntimeEnv(launchSecrets)}.`,
    ].join("\n") + "\n",
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
