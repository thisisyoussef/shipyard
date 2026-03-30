# Feature Spec

## Metadata
- Story ID: P5-S01
- Story Title: Local Preview Runtime and Auto Refresh
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 5 local preview

## Problem Statement

Shipyard can already inspect a target, edit files, and show tool activity, but
the user still has to leave Shipyard to start the target project and see the
result. For previewable targets, that gap makes the browser workbench feel like
an observer instead of the natural place to iterate. Shipyard needs a local
preview runtime that can start the target automatically when it makes sense and
keep the visible result fresh after edits land.

## Story Objectives

- Objective 1: Detect when a target has a local preview surface that Shipyard
  can run safely.
- Objective 2: Launch and supervise one preview process per active session.
- Objective 3: Keep the rendered result current after Shipyard edits, while
  making unsupported targets explicit instead of ambiguous.

## User Stories

- As a Shipyard user, I want the target project to run locally inside the same
  browser workflow so I can immediately see the result of the latest change.
- As a Shipyard user, I want the preview to refresh or rebuild after edits so I
  do not have to restart the target manually after each turn.

## Acceptance Criteria

- [x] AC-1: Target discovery classifies preview capability from existing
  framework and script signals, and records why preview is available or not.
- [x] AC-2: When preview is available, the browser runtime starts one
  supervised local preview process automatically and surfaces its URL, status,
  and recent log output.
- [x] AC-3: Shipyard prefers target-native watch/HMR behavior when present; if
  native refresh is unavailable, it triggers the smallest safe fallback such as
  reload, rebuild, or restart after edits.
- [x] AC-4: The preview lifecycle is visible and recoverable in the workbench,
  including starting, running, refreshing, exited, unavailable, and error
  states.
- [x] AC-5: Port conflicts, missing dependencies, startup failures, and
  unexpected exits are reported clearly without blocking the rest of the agent
  session.
- [x] AC-6: Manual verification covers a previewable browser target and a
  target where preview is not applicable.

## Edge Cases

- No `dev`/`start`/preview script exists even though the repo is JavaScript or
  TypeScript.
- The target framework serves a dev server but does not print a URL in a
  predictable format.
- The preferred preview port is already occupied.
- The preview process exits after startup or hangs without becoming healthy.
- The target supports HMR for browser edits but not for generated asset or
  config changes.
- The target is not a browser application, so preview should be explicitly
  unavailable.

## Non-Functional Requirements

- Security: preview stays local-only and binds to loopback by default.
- Reliability: session shutdown or restart must clean up the preview process.
- Performance: preview supervision must not block instruction execution or UI
  event streaming.
- Observability: recent preview logs, health state, and restart reason should
  be visible in the workbench.

## UI Requirements (if applicable)

- Required states: unavailable, idle, starting, running, refreshing, error,
  and exited.
- Accessibility contract: preview status, URL, and restart errors remain
  keyboard and screen-reader accessible.
- Design token contract: preview surfaces should reuse the current workbench
  system instead of introducing a disconnected mini-app style.
- Visual-regression snapshot states: unavailable target, healthy preview,
  restarting preview, and startup failure.

## Out of Scope

- Deployment, tunneling, or remote sharing of the preview.
- Supporting every framework or package manager in the first pass.
- Replacing a target's native HMR/client code with a Shipyard-specific runtime.
- General-purpose terminal multiplexing beyond preview lifecycle needs.

## Done Definition

- Previewable targets can launch locally from Shipyard and expose a visible
  result.
- The workbench makes preview health and failure modes obvious.
- Preview remains current after edits without repeated manual restarts when the
  target supports a local refresh path.

## Code References

- [`../../../../src/context/discovery.ts`](../../../../src/context/discovery.ts):
  infers preview capability, captures the resolved command, and keeps
  unsupported targets explicit instead of guessing.
- [`../../../../src/preview/contracts.ts`](../../../../src/preview/contracts.ts):
  decides when scratch targets should begin from the starter-canvas path and
  seeds the initial preview state accordingly.
- [`../../../../src/engine/state.ts`](../../../../src/engine/state.ts):
  persists the starter-canvas-aware preview state into new or resumed browser
  sessions so scratch targets do not flash failure details on connect.
- [`../../../../src/preview/supervisor.ts`](../../../../src/preview/supervisor.ts):
  falls back to a loopback starter canvas for scratch targets or first-boot
  preview failures, while preserving the existing real-preview lifecycle once a
  healthy target-native preview is available.
- [`../../../../src/ui/server.ts`](../../../../src/ui/server.ts): creates the
  session-scoped preview supervisor, persists `preview:state`, re-runs
  discovery after edit events, promotes the session from starter canvas to a
  real preview when the target becomes previewable, and now queues
  refresh-complete archive snapshots into sidecar git repos without blocking
  the active turn.
- [`../../../../src/tools/target-manager/release-archive.ts`](../../../../src/tools/target-manager/release-archive.ts):
  mirrors refreshed targets into dedicated git repos under
  `.shipyard-target-releases`, writes release metadata and a shared target
  index, and keeps preview-driven recovery points outside the live target repo.
- [`../../../../ui/src/ShipyardWorkbench.tsx`](../../../../ui/src/ShipyardWorkbench.tsx):
  mounts the preview surface in the UIV3 main stack so it stays visible beside
  composer and activity.
- [`../../../../ui/src/panels/PreviewPanel.tsx`](../../../../ui/src/panels/PreviewPanel.tsx):
  renders preview status, the direct navigation link, the inline iframe for
  running previews, and explicit unavailable/error notes.
- [`../../../../ui/src/panels/panels.css`](../../../../ui/src/panels/panels.css):
  styles the preview card and direct-link treatment using the shared workbench
  token system.
- [`../../../../tests/preview-supervisor.test.ts`](../../../../tests/preview-supervisor.test.ts)
  and [`../../../../tests/ui-runtime.test.ts`](../../../../tests/ui-runtime.test.ts):
  cover starter-canvas fallback, first-boot preview failures, scratch-target
  promotion into a real preview, the existing running/unavailable UI states,
  and preview-refresh archive snapshots.

## Representative Snippets

```ts
if (shouldUseStarterCanvasForScratchTarget(options)) {
  return createStarterCanvasIdleState();
}

return createPreviewStateFromCapability(options.discovery.previewCapability);
```

```ts
const createPreviewBridge = () =>
  createPreviewSupervisor({
    targetDirectory: sessionState.targetDirectory,
    capability: sessionState.discovery.previewCapability,
    starterCanvasOnUnavailable: shouldUseStarterCanvasForScratchTarget({
      activePhase: sessionState.activePhase,
      discovery: sessionState.discovery,
    }),
    starterCanvasOnStartupFailure: sessionState.activePhase === "code",
    onState: publishPreviewState,
  });
```

```ts
const nextDiscovery = await discoverTarget(sessionState.targetDirectory);
const previewCapabilityChanged = !hasSamePreviewCapability(
  previousPreviewCapability,
  nextDiscovery.previewCapability,
);

sessionState.discovery = nextDiscovery;

if (
  previewCapabilityChanged ||
  (
    nextDiscovery.previewCapability.status === "available" &&
    previewSupervisor.isStarterCanvasActive()
  )
) {
  await restartPreviewSupervisor({ silent: true });
  return;
}
```

```ts
if (
  previousPreviewState.status !== "running" &&
  previewState.status === "running" &&
  previewState.lastRestartReason?.includes("Refresh requested")
) {
  const task = project.releaseArchiveTail.then(() =>
    captureTargetReleaseArchive({
      archiveRoot: project.targetReleaseArchiveRoot,
      targetDirectory: project.sessionState.targetDirectory,
      targetsDirectory: project.sessionState.targetsDirectory,
      sessionId: project.sessionState.sessionId,
      turnCount: project.sessionState.turnCount,
      previewState,
      discovery: project.sessionState.discovery,
      targetProfile: project.sessionState.targetProfile,
    })
  );
}
```
