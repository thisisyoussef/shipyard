# Feature Spec

## Metadata
- Story ID: PTM-S04
- Story Title: Automatic Background Enrichment
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase Target Manager

## Problem Statement

The current target-manager flow still treats enrichment as an explicit follow-up action. In the CLI, users have to remember to run `target enrich`. In the browser workbench, the header still tells users to "Run enrichment" and exposes a dedicated enrichment button. That adds avoidable friction and means a new target can be selected successfully but still be missing the richer `TargetProfile` context Shipyard wants from the first turn.

## Story Objectives

- Objective 1: Start enrichment automatically after target creation or target switching whenever the newly active target has no saved profile and enough context exists to enrich it without another browser prompt.
- Objective 2: Make browser enrichment feel like background work rather than a separate user chore.
- Objective 3: Remove the dedicated browser enrichment button and replace it with passive status messaging.
- Objective 4: Keep a safe manual recovery/debug path for re-enrichment in the CLI.

## User Stories

- As a user creating a new target, I want Shipyard to analyze it automatically so I can start working without learning another setup step.
- As a user switching to an existing target, I want Shipyard to enrich missing project context on its own when possible.
- As a browser user, I want the workbench to show passive analysis progress instead of asking me to click an enrichment button.
- As an operator, I want a manual CLI fallback for re-enrichment if automatic enrichment fails or if I intentionally want to refresh a profile.

## Acceptance Criteria

- [x] AC-1: After `target create` in the CLI or `target:create_request` in the browser, Shipyard automatically starts enrichment when the newly selected target has no saved `TargetProfile`.
- [x] AC-2: After switching to an existing target with no saved profile, Shipyard automatically starts enrichment when there is enough project context to do so without asking the browser user for more input.
- [x] AC-3: In the browser workbench, target switch/create completion is emitted before enrichment finishes, and enrichment progress continues through streamed state updates without blocking the user from seeing the active target.
- [x] AC-4: The target enrichment state model can represent a background lifecycle that includes at least `queued`, `started`, `in-progress`, `complete`, and `error`, with human-readable status messages.
- [x] AC-5: The target header and related workbench copy no longer instruct users to manually "Run enrichment."
- [x] AC-6: The browser workbench no longer renders a dedicated `Enrich target` or `Retry enrichment` button in the header.
- [x] AC-7: If the active target already has a saved profile, Shipyard does not automatically re-enrich it on every switch by default.
- [x] AC-8: The CLI `target enrich` command remains available as a manual recovery/debug path.
- [x] AC-9: When automatic enrichment cannot run without additional context, such as an already-empty target with no files and no stored description, Shipyard keeps the target usable and surfaces a passive explanatory status instead of blocking the browser flow on a prompt.
- [x] AC-10: Tests cover CLI auto-enrichment, browser auto-enrichment, and the absence of the browser enrichment button in the target header UI.

## Edge Cases

- Target already has `profile.json`: switching should load it immediately and skip automatic enrichment.
- Browser switches targets rapidly: stale enrichment updates must not overwrite the newly active target's status.
- Automatic enrichment fails mid-stream: the browser shows a passive error state without bringing back the primary enrichment button.
- A greenfield target created in the browser has no files yet: automatic enrichment should reuse the creation description instead of waiting for files to exist.
- A previously existing empty target has no files and no description: Shipyard should not invent context or block the target switch; it should surface a passive "not enough context yet" state.

## Non-Functional Requirements

- Performance: target switching and target creation should remain responsive in the browser and should not wait on enrichment completion before updating the active target UI.
- Observability: traces or runtime logs should distinguish automatic enrichment from manual CLI re-enrichment.
- Reliability: automatic enrichment must not corrupt or overwrite a profile belonging to a different target after a fast target switch.
- Backwards compatibility: existing `target enrich` CLI behavior stays valid even though it is no longer the default browser path.

## UI Requirements (if applicable)

- The target header should show passive enrichment status only: queued, analyzing, ready, or failed.
- The workbench should remove the dedicated header CTA for enrichment and treat enrichment as part of the target lifecycle.
- If enrichment is unavailable because more context is needed, the UI should explain that state in plain language without forcing a modal prompt.

## Out of Scope

- Automatic profile staleness detection or re-enrichment based on file diffs.
- Bulk re-enrichment across many targets.
- Deleting profiles or target cleanup.
- Using the new profile data to change coordinator/planner routing. That belongs in later harness work.

## Done Definition

- New targets and unprofiled switched targets are enriched automatically when possible.
- The browser no longer asks the user to click an enrich button.
- CLI users still have a manual `target enrich` fallback for recovery/debugging.

## Code References

- [`../../../../src/engine/target-enrichment.ts`](../../../../src/engine/target-enrichment.ts):
  centralizes the automatic-enrichment planner and capability gate so CLI and
  browser flows share the same `run-now` / `skip-existing-profile` /
  `needs-description` decisions.
- [`../../../../src/engine/target-command.ts`](../../../../src/engine/target-command.ts)
  and [`../../../../src/engine/loop.ts`](../../../../src/engine/loop.ts):
  auto-start enrichment after CLI create, switch, and tool-selected target
  changes while preserving the explicit `target enrich` recovery path.
- [`../../../../src/ui/contracts.ts`](../../../../src/ui/contracts.ts),
  [`../../../../src/ui/server.ts`](../../../../src/ui/server.ts), and
  [`../../../../src/ui/workbench-state.ts`](../../../../src/ui/workbench-state.ts):
  add the `queued` lifecycle state, background browser auto-enrichment on
  create/switch/initial sync, stale-run guards, and passive agent-status text.
- [`../../../../src/ui/target-manager.ts`](../../../../src/ui/target-manager.ts),
  [`../../../../ui/src/TargetHeader.tsx`](../../../../ui/src/TargetHeader.tsx),
  [`../../../../ui/src/EnrichmentIndicator.tsx`](../../../../ui/src/EnrichmentIndicator.tsx),
  [`../../../../ui/src/App.tsx`](../../../../ui/src/App.tsx), and
  [`../../../../ui/src/ShipyardWorkbench.tsx`](../../../../ui/src/ShipyardWorkbench.tsx):
  remove the browser enrich CTA chain and render passive status-only messaging
  on the current split-pane workbench UI.
- [`../../../../tests/target-auto-enrichment.test.ts`](../../../../tests/target-auto-enrichment.test.ts),
  [`../../../../tests/ui-runtime.test.ts`](../../../../tests/ui-runtime.test.ts),
  [`../../../../tests/ui-view-models.test.ts`](../../../../tests/ui-view-models.test.ts),
  and [`../../../../tests/ui-workbench.test.ts`](../../../../tests/ui-workbench.test.ts):
  cover planner behavior, CLI/browser auto-enrichment, stale background guards,
  queued status handling, and the missing-button UI contract.

## Representative Snippets

```ts
export function planAutomaticEnrichment(
  input: AutomaticEnrichmentPlanInput,
): AutomaticEnrichmentPlan {
  if (input.targetProfile) {
    return { kind: "skip-existing-profile" };
  }

  const trimmedDescription = input.creationDescription?.trim() || undefined;

  if (hasProjectContext(input.discovery) || trimmedDescription) {
    return {
      kind: "run-now",
      queuedMessage: DEFAULT_QUEUED_MESSAGE,
      userDescription: trimmedDescription,
    };
  }

  return {
    kind: "needs-description",
    message: NEEDS_DESCRIPTION_MESSAGE,
  };
}
```

```ts
await broadcastEnrichmentProgress("queued", plan.queuedMessage);
await logTargetEnrichment({
  targetPath,
  trigger: "automatic",
  status: "queued",
  message: plan.queuedMessage,
  reason: options.reason,
});
void runBrowserTargetEnrichment({
  targetPath,
  trigger: "automatic",
  userDescription: plan.userDescription,
  reason: options.reason,
});
```

```tsx
function createStatusLabel(
  props: EnrichmentIndicatorProps,
): string {
  if (props.message) {
    return props.message;
  }

  if (props.status === "complete" || props.hasProfile) {
    return "Ready";
  }

  if (props.status === "error") {
    return "Analysis unavailable";
  }

  if (
    props.status === "queued" ||
    props.status === "started" ||
    props.status === "in-progress"
  ) {
    return "Analyzing target...";
  }

  return "Analysis pending";
}
```
