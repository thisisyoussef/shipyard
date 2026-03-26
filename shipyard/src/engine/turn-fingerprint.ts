import type {
  BrowserEvaluationStatus,
  HarnessRouteSummary,
  PlanningMode,
  PreviewState,
} from "../artifacts/types.js";

export type RuntimeSurface = "cli" | "ui";
export type FingerprintPresence = "yes" | "no";
export type RuntimePhaseName = "code" | "target-manager";

export interface TurnExecutionFingerprint {
  surface: RuntimeSurface;
  phase: RuntimePhaseName;
  planningMode: PlanningMode;
  targetProfile: FingerprintPresence;
  preview: FingerprintPresence;
  previewStatus: PreviewState["status"];
  browserEval: FingerprintPresence;
  browserEvaluationStatus: BrowserEvaluationStatus | "not_run";
  model: string;
  modelProvider: string | null;
  modelName: string | null;
}

function toFingerprintPresence(value: boolean): FingerprintPresence {
  return value ? "yes" : "no";
}

function formatModelLabel(options: {
  modelProvider: string | null;
  modelName: string | null;
}): string {
  if (options.modelProvider && options.modelName) {
    return `${options.modelProvider}/${options.modelName}`;
  }

  if (options.modelProvider) {
    return `${options.modelProvider}/unknown`;
  }

  if (options.modelName) {
    return options.modelName;
  }

  return "unknown";
}

export function createTurnExecutionFingerprint(options: {
  surface: RuntimeSurface;
  phase: RuntimePhaseName;
  planningMode: PlanningMode;
  targetProfile: unknown;
  previewState: PreviewState;
  harnessRoute: HarnessRouteSummary;
  modelProvider: string | null;
  modelName: string | null;
}): TurnExecutionFingerprint {
  return {
    surface: options.surface,
    phase: options.phase,
    planningMode: options.planningMode,
    targetProfile: toFingerprintPresence(Boolean(options.targetProfile)),
    preview: toFingerprintPresence(options.previewState.status === "running"),
    previewStatus: options.previewState.status,
    browserEval: toFingerprintPresence(options.harnessRoute.usedBrowserEvaluator),
    browserEvaluationStatus: options.harnessRoute.browserEvaluationStatus,
    model: formatModelLabel({
      modelProvider: options.modelProvider,
      modelName: options.modelName,
    }),
    modelProvider: options.modelProvider,
    modelName: options.modelName,
  };
}

export function formatTurnExecutionFingerprint(
  fingerprint: TurnExecutionFingerprint,
): string {
  return [
    `surface=${fingerprint.surface}`,
    `phase=${fingerprint.phase}`,
    `planningMode=${fingerprint.planningMode}`,
    `targetProfile=${fingerprint.targetProfile}`,
    `preview=${fingerprint.preview}`,
    `browserEval=${fingerprint.browserEval}`,
    `model=${fingerprint.model}`,
  ].join(" ");
}
