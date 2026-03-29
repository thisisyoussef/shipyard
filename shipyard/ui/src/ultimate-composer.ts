import type {
  UltimateUiStateViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

export type WorkbenchComposerMode =
  | "instruction"
  | "ultimate-start"
  | "ultimate-feedback"
  | "ultimate-stopping"
  | "cancel";

export interface WorkbenchComposerBehavior {
  mode: WorkbenchComposerMode;
  submitLabel: string;
  placeholder: string;
  keyboardHint: string;
  modeSummary: string;
  showCancelAction: boolean;
  submitDisabled: boolean;
  togglePressed: boolean;
  toggleDisabled: boolean;
}

export interface HumanFeedbackBehavior {
  submitLabel: string;
  helpText: string;
  submitDisabled: boolean;
}

function hasActiveUltimateLoop(
  ultimateState: UltimateUiStateViewModel,
): boolean {
  return ultimateState.active;
}

export function shouldShowUltimateBadge(
  ultimateState: UltimateUiStateViewModel,
): boolean {
  return ultimateState.phase !== "idle";
}

export function formatUltimatePhaseLabel(
  phase: UltimateUiStateViewModel["phase"],
): string {
  switch (phase) {
    case "running":
      return "Running";
    case "stopping":
      return "Stopping";
    case "error":
      return "Needs attention";
    default:
      return "Idle";
  }
}

export function resolveWorkbenchComposerBehavior(input: {
  connectionState: WorkbenchConnectionState;
  ultimateState: UltimateUiStateViewModel;
  armed: boolean;
}): WorkbenchComposerBehavior {
  if (input.ultimateState.phase === "stopping") {
    return {
      mode: "ultimate-stopping",
      submitLabel: "Stopping...",
      placeholder:
        "Ultimate mode is shutting down after the current cycle finishes.",
      keyboardHint: "Waiting for the active ultimate cycle to stop",
      modeSummary:
        "Ultimate mode is stopping. Wait for Shipyard to finish the current cycle before starting another loop.",
      showCancelAction: false,
      submitDisabled: true,
      togglePressed: true,
      toggleDisabled: true,
    };
  }

  if (hasActiveUltimateLoop(input.ultimateState)) {
    const pendingFeedbackCount = input.ultimateState.pendingFeedbackCount;
    const pendingSummary =
      pendingFeedbackCount > 0
        ? ` There ${pendingFeedbackCount === 1 ? "is" : "are"} already ${String(pendingFeedbackCount)} queued note${pendingFeedbackCount === 1 ? "" : "s"}.`
        : "";

    return {
      mode: "ultimate-feedback",
      submitLabel: "Queue feedback",
      placeholder:
        "Send feedback to the running ultimate loop without interrupting its current cycle.",
      keyboardHint: "Cmd+Enter to queue feedback",
      modeSummary:
        `Next send queues feedback for the active ultimate loop.${pendingSummary}`,
      showCancelAction: false,
      submitDisabled: false,
      togglePressed: true,
      toggleDisabled: true,
    };
  }

  if (input.connectionState === "agent-busy") {
    return {
      mode: "cancel",
      submitLabel: "Cancel turn",
      placeholder:
        "Shipyard is busy with a standard turn. Submit now to interrupt it cleanly.",
      keyboardHint: "Cmd+Enter to cancel the active turn",
      modeSummary:
        "A standard Shipyard turn is running. Submit will interrupt it instead of queuing a new instruction.",
      showCancelAction: true,
      submitDisabled: false,
      togglePressed: input.armed,
      toggleDisabled: true,
    };
  }

  if (input.armed) {
    return {
      mode: "ultimate-start",
      submitLabel: "Start ultimate",
      placeholder:
        "Describe the standing brief you want ultimate mode to keep pursuing.",
      keyboardHint: "Cmd+Enter to start ultimate mode",
      modeSummary:
        "Next send will start ultimate mode with this brief and keep looping until you stop it.",
      showCancelAction: false,
      submitDisabled: false,
      togglePressed: true,
      toggleDisabled: false,
    };
  }

  return {
    mode: "instruction",
    submitLabel: "Run instruction",
    placeholder:
      "Ask Shipyard to inspect a file, explain the current diff, or map the next change.",
    keyboardHint: "Cmd+Enter to send",
    modeSummary:
      "Next send runs a normal Shipyard instruction.",
    showCancelAction: false,
    submitDisabled: false,
    togglePressed: false,
    toggleDisabled: false,
  };
}

export function resolveHumanFeedbackBehavior(input: {
  ultimateState: UltimateUiStateViewModel;
}): HumanFeedbackBehavior {
  if (input.ultimateState.phase === "stopping") {
    return {
      submitLabel: "Stopping...",
      helpText:
        "Ultimate mode is stopping after the current cycle, so Shipyard is not accepting more loop feedback right now.",
      submitDisabled: true,
    };
  }

  if (hasActiveUltimateLoop(input.ultimateState)) {
    return {
      submitLabel: "Queue feedback",
      helpText:
        "Press Cmd/Ctrl+Enter to queue the note for the active ultimate loop.",
      submitDisabled: false,
    };
  }

  return {
    submitLabel: "Run instruction",
    helpText:
      "Press Cmd/Ctrl+Enter to send the note. If ultimate mode is not active, Shipyard will treat this like a normal browser instruction instead.",
    submitDisabled: false,
  };
}
