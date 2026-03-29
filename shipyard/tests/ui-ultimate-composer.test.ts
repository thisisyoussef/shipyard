import { describe, expect, it } from "vitest";

import {
  resolveHumanFeedbackBehavior,
  resolveWorkbenchComposerBehavior,
} from "../ui/src/ultimate-composer.js";

const idleUltimateState = {
  active: false,
  phase: "idle" as const,
  currentBrief: null,
  turnCount: 0,
  pendingFeedbackCount: 0,
  startedAt: null,
  lastCycleSummary: null,
};

const runningUltimateState = {
  active: true,
  phase: "running" as const,
  currentBrief: "Keep improving the dashboard forever.",
  turnCount: 3,
  pendingFeedbackCount: 1,
  startedAt: "2026-03-29T00:00:00.000Z",
  lastCycleSummary: "Cycle 3 tightened the hero spacing.",
};

describe("ultimate composer behavior", () => {
  it("arms the next workbench send as an ultimate start when the toggle is active", () => {
    expect(
      resolveWorkbenchComposerBehavior({
        connectionState: "ready",
        ultimateState: idleUltimateState,
        armed: true,
      }),
    ).toMatchObject({
      mode: "ultimate-start",
      submitLabel: "Start ultimate",
      showCancelAction: false,
      togglePressed: true,
      toggleDisabled: false,
      modeSummary: expect.stringContaining(
        "Next send will start ultimate mode",
      ),
    });
  });

  it("treats an active ultimate run as feedback mode instead of cancel mode", () => {
    expect(
      resolveWorkbenchComposerBehavior({
        connectionState: "agent-busy",
        ultimateState: runningUltimateState,
        armed: false,
      }),
    ).toMatchObject({
      mode: "ultimate-feedback",
      submitLabel: "Queue feedback",
      showCancelAction: false,
      togglePressed: true,
      toggleDisabled: true,
      modeSummary: expect.stringContaining(
        "Next send queues feedback for the active ultimate loop",
      ),
    });
  });

  it("keeps non-ultimate busy turns on the normal cancel path", () => {
    expect(
      resolveWorkbenchComposerBehavior({
        connectionState: "agent-busy",
        ultimateState: idleUltimateState,
        armed: false,
      }),
    ).toMatchObject({
      mode: "cancel",
      submitLabel: "Cancel turn",
      showCancelAction: true,
    });
  });

  it("switches the dedicated human-feedback page copy when the loop is active", () => {
    expect(
      resolveHumanFeedbackBehavior({
        ultimateState: idleUltimateState,
      }),
    ).toMatchObject({
      submitLabel: "Run instruction",
      helpText: expect.stringContaining(
        "Shipyard will treat this like a normal browser instruction",
      ),
    });

    expect(
      resolveHumanFeedbackBehavior({
        ultimateState: runningUltimateState,
      }),
    ).toMatchObject({
      submitLabel: "Queue feedback",
      helpText: expect.stringContaining(
        "active ultimate loop",
      ),
    });
  });
});
