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
- [`../../../../src/ui/server.ts`](../../../../src/ui/server.ts): creates the
  session-scoped preview supervisor, persists `preview:state`, and broadcasts
  lifecycle updates to the browser workbench.
- [`../../../../ui/src/ShipyardWorkbench.tsx`](../../../../ui/src/ShipyardWorkbench.tsx):
  mounts the preview surface in the UIV3 main stack so it stays visible beside
  composer and activity.
- [`../../../../ui/src/panels/PreviewPanel.tsx`](../../../../ui/src/panels/PreviewPanel.tsx):
  renders preview status, the direct navigation link, the inline iframe for
  running previews, and explicit unavailable/error notes.
- [`../../../../ui/src/panels/panels.css`](../../../../ui/src/panels/panels.css):
  styles the preview card and direct-link treatment using the shared workbench
  token system.
- [`../../../../tests/ui-workbench.test.ts`](../../../../tests/ui-workbench.test.ts),
  [`../../../../tests/ui-runtime.test.ts`](../../../../tests/ui-runtime.test.ts),
  and [`../../../../tests/manual/phase5-local-preview-smoke.ts`](../../../../tests/manual/phase5-local-preview-smoke.ts):
  cover the running/unavailable UI states, runtime preview streaming, and direct
  URL loading during manual smoke verification.

## Representative Snippets

```ts
if (
  typeof scripts.dev === "string" &&
  /\bvite(?:\s|$)/.test(scripts.dev) &&
  "vite" in dependencies
) {
  const runner = resolvePreviewRunner(packageManager);

  return {
    status: "available",
    kind: "dev-server",
    runner,
    scriptName: "dev",
    command: formatPreviewCommand(runner, "dev"),
    reason: "Detected a Vite dev script and dependency signal.",
    autoRefresh: "native-hmr",
  };
}
```

```ts
const createPreviewBridge = () =>
  createPreviewSupervisor({
    targetDirectory: sessionState.targetDirectory,
    capability: sessionState.discovery.previewCapability,
    async onState(previewState) {
      sessionState.workbenchState = applyBackendMessage(
        sessionState.workbenchState,
        { type: "preview:state", preview: previewState },
      );
      await broadcast({ type: "preview:state", preview: previewState });
    },
  });
```

```tsx
<div className="preview-link-row">
  <div className="preview-link-copy">
    <span className="preview-link-label">Direct link</span>
    <code className="preview-url">{preview.url}</code>
  </div>
  <a
    className="target-inline-action preview-open-link"
    href={preview.url ?? undefined}
    target="_blank"
    rel="noreferrer"
  >
    Open preview
  </a>
</div>
```
