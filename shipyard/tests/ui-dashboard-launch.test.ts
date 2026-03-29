import { describe, expect, it } from "vitest";

import {
  createDashboardHeroLaunch,
  matchesDashboardLaunchCompletion,
} from "../ui/src/dashboard-launch.js";

describe("dashboard launch helpers", () => {
  it("derives a deterministic hero launch payload and preserves the draft", () => {
    const launch = createDashboardHeroLaunch(
      "Build a kanban board for weekly release planning.",
      {
        now: "2026-03-28T12:15:00.000Z",
        requestId: "dashboard-launch-1",
      },
    );

    expect(launch).toMatchObject({
      kind: "hero-create",
      requestId: "dashboard-launch-1",
      promptDraft: "Build a kanban board for weekly release planning.",
      createdName: "Kanban Board Weekly Release",
      startedAt: "2026-03-28T12:15:00.000Z",
      request: {
        type: "target:create_request",
        requestId: "dashboard-launch-1",
        name: "Kanban Board Weekly Release",
        description: "Build a kanban board for weekly release planning.",
        scaffoldType: "react-ts",
      },
    });
  });

  it("falls back to a safe workspace name when the prompt has no usable words", () => {
    expect(createDashboardHeroLaunch("build it", { requestId: "launch-2" })).toMatchObject({
      createdName: "Workspace",
      request: {
        name: "Workspace",
      },
    });
  });

  it("matches launch completions by request id only", () => {
    const launch = createDashboardHeroLaunch("Build a dashboard", {
      requestId: "launch-3",
    });

    expect(
      matchesDashboardLaunchCompletion(launch, {
        requestId: "launch-3",
        success: true,
      }),
    ).toBe(true);
    expect(
      matchesDashboardLaunchCompletion(launch, {
        requestId: "launch-4",
        success: true,
      }),
    ).toBe(false);
    expect(
      matchesDashboardLaunchCompletion(launch, {
        requestId: undefined,
        success: true,
      }),
    ).toBe(false);
  });
});
