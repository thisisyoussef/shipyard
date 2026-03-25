# Technical Plan

## Metadata
- Story ID: PTM-S04
- Story Title: Automatic Background Enrichment
- Author: Codex
- Date: 2026-03-25

## Proposed Design

- Components/modules affected:
  - `shipyard/src/engine/target-command.ts` — auto-start enrichment after CLI create/switch flows when a profile is missing
  - `shipyard/src/engine/state.ts` or a small target-manager helper module — determine whether automatic enrichment should run, skip, or defer
  - `shipyard/src/ui/server.ts` — start background enrichment after browser create/switch and, when needed, after initial browser state sync
  - `shipyard/src/ui/contracts.ts` — extend target enrichment state for background lifecycle signaling
  - `shipyard/src/ui/workbench-state.ts` — preserve and render queued/background enrichment state correctly
  - `shipyard/ui/src/EnrichmentIndicator.tsx` — convert from action-oriented control to passive status display
  - `shipyard/ui/src/TargetHeader.tsx` — remove "Run enrichment" language and button wiring
  - `shipyard/ui/src/App.tsx` — stop routing the header through an explicit enrich-button callback
  - `shipyard/tests/**` — CLI, UI-runtime, reducer, and component coverage for auto-enrichment

- Public interfaces/contracts:
  - `TargetEnrichmentState.status` expands to include `queued`
  - A new helper, for example `planAutomaticEnrichment(...)` or `autoEnrichTargetIfNeeded(...)`, decides whether enrichment should run immediately, be skipped, or surface a passive "needs more context" state
  - Trace/log payloads should identify whether enrichment was `automatic` or `manual`

- Data flow summary:
  1. User creates or switches to a target.
  2. Runtime completes the target activation flow immediately and publishes the new active target state.
  3. If the target already has a profile, Shipyard stops there.
  4. If the target has no profile and enough context is available, Shipyard marks enrichment as `queued` and starts enrichment automatically.
  5. Enrichment streams progress, saves `profile.json`, updates session state, and resolves to `complete` or `error`.
  6. If enrichment cannot run without more context, Shipyard records a passive explanatory status instead of opening another prompt in the browser.

## Architecture Decisions

- Decision: Keep `switchTarget()` as the pure session-transition primitive; automatic enrichment is layered on top of it instead of baked into the state transition.
  - Rationale: PTM-S02 intentionally kept switching side-effect free. PTM-S04 changes the default behavior, but it should do so through an orchestration helper rather than by making target switching itself harder to reason about.

- Decision: Browser auto-enrichment is backgrounded and must not delay the visible completion of create/switch actions.
  - Rationale: The user should see the new target immediately. Enrichment is context-building work, not a blocker to acknowledging the selected target.

- Decision: CLI auto-enrichment may still run inline after a create or switch because the terminal flow is already sequential and can prompt for a greenfield description when needed.
  - Rationale: The CLI has a natural way to gather missing input. The browser background path does not.

- Decision: Remove the primary enrichment CTA from the browser header, but keep `target enrich` in the CLI as the operator escape hatch.
  - Rationale: The default UX should be automatic, but Shipyard still needs a manual recovery path for failed or intentionally refreshed profiles.

## Dependency Plan

- Existing dependencies used: target-manager tools, session switching, current enrichment pipeline, UI contracts, reducer/view-model state, and existing trace logging.
- New dependencies proposed: none.

## Implementation Notes

- Add a small auto-enrichment planner helper that takes:
  - current target path
  - discovery snapshot
  - existing `TargetProfile`
  - optional creation description
  - runtime mode (`repl` or `ui`)
  and returns one of:
  - `run-now` with optional `userDescription`
  - `skip-existing-profile`
  - `skip-needs-more-context` with a passive user-facing message

- Browser flow changes:
  - After `target:switch_request` and `target:create_request`, broadcast the switched target immediately, then kick off automatic enrichment if the helper says `run-now`.
  - Consider the initial browser sync path as well so a freshly opened workbench can auto-enrich an already-selected target that still lacks a profile.
  - Guard progress updates against stale target identity so an old enrichment run cannot overwrite the active target after another switch.

- CLI flow changes:
  - After `handleTargetCreate()` and `target switch`, call the helper.
  - If the helper needs a description for a greenfield target and the CLI can ask, prompt inline and continue automatically.
  - Keep `target enrich` as a separate explicit command for recovery/debugging.

- UI changes:
  - `EnrichmentIndicator` becomes passive-only: status badge, spinner, or passive failure text.
  - `TargetHeader` copy should describe automatic analysis or missing context rather than telling the user to run enrichment.
  - Remove the direct enrichment callback chain from the main workbench header path.

## Test Strategy

- Unit: helper behavior for profiled targets, new greenfield targets with descriptions, and existing empty targets with insufficient context.
- Unit: reducer/view-model handling of `queued` and passive error states.
- UI unit/component: no explicit enrich button renders in the target header.
- Integration: browser create auto-starts enrichment after switch completion and streams progress.
- Integration: browser switch to a target with an existing profile skips auto-enrichment.
- Integration: CLI create/switch auto-enriches when a profile is missing.

## Implementation Evidence

- Code references:
  - `shipyard/src/engine/target-enrichment.ts`: ships the shared planner and
    runtime capability check used by both CLI and browser orchestration.
  - `shipyard/src/engine/target-command.ts` and `shipyard/src/engine/loop.ts`:
    auto-run enrichment after CLI create/switch and tool-selected target
    changes, while leaving `target enrich` intact for manual recovery.
  - `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/server.ts`, and
    `shipyard/src/ui/workbench-state.ts`: add `queued`, background enrichment on
    browser create/switch/initial sync, stale-run protection, and passive
    session status text.
  - `shipyard/src/ui/target-manager.ts`, `shipyard/ui/src/TargetHeader.tsx`,
    `shipyard/ui/src/EnrichmentIndicator.tsx`, `shipyard/ui/src/App.tsx`, and
    `shipyard/ui/src/ShipyardWorkbench.tsx`: remove the browser enrichment CTA
    chain and keep the new split-pane workbench on passive status-only copy.
  - `shipyard/tests/target-auto-enrichment.test.ts`,
    `shipyard/tests/ui-runtime.test.ts`, `shipyard/tests/ui-view-models.test.ts`,
    and `shipyard/tests/ui-workbench.test.ts`: prove the new planner, browser
    background lifecycle, stale-run guard, and no-button UI contract.
- Representative snippets:

```ts
if (
  !hasAutomaticTargetEnrichmentCapability(
    runtimeState.targetEnrichmentInvoker,
  )
) {
  await broadcastTargetState({
    status: "idle",
    message:
      "Automatic analysis is unavailable until target enrichment is configured.",
  });
  return;
}
```

```ts
if (isStaleEnrichmentRun(runId, options.targetPath)) {
  return;
}

sessionState.targetProfile = profile;
await broadcastTargetState({
  status: "complete",
  message: "Target profile saved.",
});
```

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
