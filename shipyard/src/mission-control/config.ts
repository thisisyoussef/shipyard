import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const envSchema = z.record(z.string(), z.string());

const sidecarSchema = z.object({
  name: z.string().min(1),
  cwd: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: envSchema.optional(),
  healthUrl: z.string().url(),
  port: z.number().int().positive().optional(),
  takePortOwnership: z.boolean().optional(),
});

const missionConfigSchema = z.object({
  version: z.literal(1),
  missionId: z.string().min(1),
  shipyardDirectory: z.string().min(1),
  targetDirectory: z.string().min(1),
  sessionId: z.string().min(1),
  environment: z
    .object({
      envFiles: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  ui: z.object({
    host: z.string().optional(),
    port: z.number().int().positive(),
    accessToken: z.string().optional(),
    takePortOwnership: z.boolean().optional(),
    env: envSchema.optional(),
  }),
  ultimate: z.object({
    briefPath: z.string().min(1),
    stickyFeedbackPath: z.string().min(1),
    ensureCooldownMs: z.number().int().positive().optional(),
  }),
  supervision: z
    .object({
      pollIntervalMs: z.number().int().positive().optional(),
      backupIntervalMs: z.number().int().positive().optional(),
      missingHealthGraceMs: z.number().int().positive().optional(),
      minimumRestartGapMs: z.number().int().positive().optional(),
      busyStallMs: z.number().int().positive().optional(),
      softMemoryLimitMb: z.number().int().positive().optional(),
      hardMemoryLimitMb: z.number().int().positive().optional(),
      retainSessionBackups: z.number().int().positive().optional(),
      retainHandoffBackups: z.number().int().positive().optional(),
      sidecarMissingHealthGraceMs: z.number().int().positive().optional(),
    })
    .optional(),
  sidecars: z.array(sidecarSchema).optional(),
});

export interface MissionSidecarConfig extends Omit<z.infer<typeof sidecarSchema>, "cwd" | "env"> {
  cwd: string;
  env: Record<string, string>;
  takePortOwnership: boolean;
}

export interface MissionConfig {
  version: 1;
  missionId: string;
  shipyardDirectory: string;
  targetDirectory: string;
  sessionId: string;
  environment: {
    envFiles: string[];
  };
  ui: {
    host: string;
    port: number;
    accessToken: string;
    takePortOwnership: boolean;
    env: Record<string, string>;
  };
  ultimate: {
    briefPath: string;
    stickyFeedbackPath: string;
    ensureCooldownMs: number;
  };
  supervision: {
    pollIntervalMs?: number;
    backupIntervalMs?: number;
    missingHealthGraceMs?: number;
    minimumRestartGapMs?: number;
    busyStallMs?: number;
    softMemoryLimitMb?: number;
    hardMemoryLimitMb?: number;
    retainSessionBackups?: number;
    retainHandoffBackups?: number;
    sidecarMissingHealthGraceMs?: number;
  };
  sidecars: MissionSidecarConfig[];
}

export interface MissionPaths {
  missionDirectory: string;
  logsDirectory: string;
  backupsDirectory: string;
  sessionBackupsDirectory: string;
  handoffBackupsDirectory: string;
  quarantineDirectory: string;
  statePath: string;
  controlLogPath: string;
  uiLogPath: string;
}

export function resolveMaybeRelative(baseDirectory: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDirectory, value);
}

export async function loadMissionConfig(configPath: string): Promise<MissionConfig> {
  const configDirectory = path.dirname(configPath);
  const parsed = missionConfigSchema.parse(
    JSON.parse(await readFile(configPath, "utf8")),
  );

  return {
    version: 1,
    missionId: parsed.missionId,
    shipyardDirectory: resolveMaybeRelative(
      configDirectory,
      parsed.shipyardDirectory,
    ),
    targetDirectory: resolveMaybeRelative(
      configDirectory,
      parsed.targetDirectory,
    ),
    sessionId: parsed.sessionId,
    environment: {
      envFiles: (parsed.environment?.envFiles ?? []).map((envFile) =>
        resolveMaybeRelative(configDirectory, envFile),
      ),
    },
    ui: {
      host: parsed.ui.host ?? "127.0.0.1",
      port: parsed.ui.port,
      accessToken: parsed.ui.accessToken?.trim() ?? "",
      takePortOwnership: parsed.ui.takePortOwnership ?? false,
      env: parsed.ui.env ?? {},
    },
    ultimate: {
      briefPath: resolveMaybeRelative(configDirectory, parsed.ultimate.briefPath),
      stickyFeedbackPath: resolveMaybeRelative(
        configDirectory,
        parsed.ultimate.stickyFeedbackPath,
      ),
      ensureCooldownMs: parsed.ultimate.ensureCooldownMs ?? 30_000,
    },
    supervision: parsed.supervision ?? {},
    sidecars: (parsed.sidecars ?? []).map((sidecar) => ({
      ...sidecar,
      cwd: resolveMaybeRelative(configDirectory, sidecar.cwd),
      env: sidecar.env ?? {},
      takePortOwnership: sidecar.takePortOwnership ?? false,
    })),
  };
}

export function createMissionPaths(configPath: string): MissionPaths {
  const missionDirectory = path.dirname(configPath);
  const logsDirectory = path.join(missionDirectory, "logs");
  const backupsDirectory = path.join(missionDirectory, "backups");

  return {
    missionDirectory,
    logsDirectory,
    backupsDirectory,
    sessionBackupsDirectory: path.join(backupsDirectory, "sessions"),
    handoffBackupsDirectory: path.join(backupsDirectory, "handoffs"),
    quarantineDirectory: path.join(backupsDirectory, "quarantine"),
    statePath: path.join(missionDirectory, "mission-state.json"),
    controlLogPath: path.join(logsDirectory, "mission-control.log"),
    uiLogPath: path.join(logsDirectory, "ui-runtime.log"),
  };
}
