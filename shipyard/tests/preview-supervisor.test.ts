import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PreviewState } from "../src/artifacts/types.js";
import { discoverTarget } from "../src/context/discovery.js";
import { createPreviewSupervisor } from "../src/preview/supervisor.js";
import { scaffoldPreviewableTarget } from "./support/preview-target.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function waitForState(
  supervisor: ReturnType<typeof createPreviewSupervisor>,
  predicate: (state: PreviewState) => boolean,
  timeoutMs = 5_000,
): Promise<PreviewState> {
  const existingState = supervisor.getState();

  if (predicate(existingState)) {
    return existingState;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    const nextState = supervisor.getState();

    if (predicate(nextState)) {
      return nextState;
    }
  }

  throw new Error("Timed out waiting for the expected preview state.");
}

describe("preview supervisor", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("starts once, refreshes through native HMR, and shuts down cleanly", async () => {
    const targetDirectory = await createTempDirectory("shipyard-preview-run-");
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "preview-supervisor-demo",
    });

    const discovery = await discoverTarget(targetDirectory);
    const states: PreviewState[] = [];
    const supervisor = createPreviewSupervisor({
      targetDirectory,
      capability: discovery.previewCapability,
      onState(state) {
        states.push(state);
      },
    });

    try {
      await Promise.all([supervisor.start(), supervisor.start()]);

      const runningState = await waitForState(
        supervisor,
        (state) => state.status === "running" && state.url !== null,
      );

      const startingTransitions = states.filter((state, index) =>
        state.status === "starting" &&
        states[index - 1]?.status !== "starting"
      );

      expect(startingTransitions).toHaveLength(1);
      expect(runningState).toMatchObject({
        status: "running",
        summary: "Preview is running on loopback.",
      });
      expect(runningState.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
      expect(runningState.logTail.join("\n")).toContain("VITE v5.0.8 ready");

      const previewResponse = await fetch(runningState.url ?? "");
      expect(previewResponse.ok).toBe(true);
      await expect(previewResponse.text()).resolves.toContain("Preview Ready");

      await supervisor.refresh("Edited package.json after the turn finished.");
      const refreshedState = await waitForState(
        supervisor,
        (state) =>
          state.status === "running" &&
          state.lastRestartReason !== null,
      );

      expect(states.some((state) => state.status === "refreshing")).toBe(true);
      expect(refreshedState.lastRestartReason).toContain("Refresh requested");
    } finally {
      await supervisor.stop();
    }

    const exitedState = await waitForState(
      supervisor,
      (state) => state.status === "exited",
    );
    expect(exitedState.summary).toContain("stopped");
  });

  it("serves a starter canvas for scratch targets without a preview command", async () => {
    const targetDirectory = await createTempDirectory("shipyard-preview-scratch-");
    const discovery = await discoverTarget(targetDirectory);
    const supervisor = createPreviewSupervisor({
      targetDirectory,
      capability: discovery.previewCapability,
      starterCanvasOnUnavailable: true,
    });

    try {
      await supervisor.start();

      const runningState = await waitForState(
        supervisor,
        (state) => state.status === "running" && state.url !== null,
      );

      expect(supervisor.isStarterCanvasActive()).toBe(true);
      expect(runningState.summary).toContain("Starter canvas");
      expect(runningState.logTail).toEqual([]);

      const response = await fetch(runningState.url ?? "");
      expect(response.ok).toBe(true);
      await expect(response.text()).resolves.toContain(
        'data-shipyard-starter-canvas="true"',
      );
    } finally {
      await supervisor.stop();
    }
  });

  it("surfaces startup failures clearly before the preview becomes healthy", async () => {
    const targetDirectory = await createTempDirectory("shipyard-preview-fail-");
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "preview-supervisor-fail-start",
      mode: "fail-start",
    });

    const discovery = await discoverTarget(targetDirectory);
    const supervisor = createPreviewSupervisor({
      targetDirectory,
      capability: discovery.previewCapability,
      startupTimeoutMs: 2_000,
    });

    let failedState: PreviewState = supervisor.getState();

    try {
      await supervisor.start();
      failedState = supervisor.getState();
    } finally {
      await supervisor.stop();
    }

    expect(failedState.summary).toContain("failed");
    expect(failedState.logTail.join("\n")).toContain(
      "Preview boot failed before the server became healthy.",
    );
  });

  it("falls back to a starter canvas on first-boot preview failures when enabled", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-preview-fallback-",
    );
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "preview-supervisor-fallback",
      mode: "fail-start",
    });

    const discovery = await discoverTarget(targetDirectory);
    const supervisor = createPreviewSupervisor({
      targetDirectory,
      capability: discovery.previewCapability,
      startupTimeoutMs: 2_000,
      starterCanvasOnStartupFailure: true,
    });

    try {
      await supervisor.start();

      const runningState = await waitForState(
        supervisor,
        (state) => state.status === "running" && state.url !== null,
      );

      expect(supervisor.isStarterCanvasActive()).toBe(true);
      expect(runningState.summary).toContain("Starter canvas");
      expect(runningState.logTail).toEqual([]);

      const response = await fetch(runningState.url ?? "");
      expect(response.ok).toBe(true);
      await expect(response.text()).resolves.toContain(
        'data-shipyard-starter-canvas="true"',
      );
    } finally {
      await supervisor.stop();
    }
  });

  it("surfaces unexpected exits after a healthy start", async () => {
    const targetDirectory = await createTempDirectory("shipyard-preview-exit-");
    await scaffoldPreviewableTarget({
      targetDirectory,
      name: "preview-supervisor-exit",
      mode: "exit-after-ready",
    });

    const discovery = await discoverTarget(targetDirectory);
    const supervisor = createPreviewSupervisor({
      targetDirectory,
      capability: discovery.previewCapability,
    });

    await supervisor.start();

    const exitedState = await waitForState(
      supervisor,
      (state) => state.status === "exited",
    );

    expect(exitedState.summary).toContain("exited unexpectedly");
    expect(exitedState.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
  });
});
