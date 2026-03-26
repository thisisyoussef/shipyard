# Phase Target Manager: Story Pack

- Pack: Target Manager
- Estimate: 5-7 hours
- Date: 2026-03-24
- Status: Implemented

## Pack Objectives

1. Let users select an existing target from a configurable targets directory or create a new one from scratch, so launching Shipyard no longer requires a pre-existing `--target` path.
2. Enrich every target with an AI-generated project profile (description, stack, architecture, complexity, suggested AGENTS.md, task ideas) so the coding agent has richer context from the first turn.
3. Allow target switching at any point during a session without losing prior session state.
4. Make enrichment automatic from the default user experience so new targets do not require a separate "enrich" step in the browser workbench.
5. Let the browser workbench keep multiple target-bound project runtimes open at once so one busy project does not block opening, creating, or resuming another target.

## Shared Constraints

- All four target manager tools are registered in the standard tool registry and follow the existing `ToolDefinition` contract.
- The target manager phase reuses `executeInstructionTurn()` — no parallel execution infrastructure.
- CLI-triggered or CLI-auto-started enrichment may still run inline, but browser-triggered enrichment should feel backgrounded from the user's perspective once a target is active.
- Existing `--target <path>` behavior is fully backward compatible. The new flow only activates when `--target` is omitted.
- `TargetProfile` is persisted as `<target>/.shipyard/profile.json` and survives across sessions.
- The code phase system prompt may reference `TargetProfile` fields for better context but does not depend on them.
- Scaffold templates for `create_target` are minimal and opinionated — just enough structure for the agent to build on, not full framework starters.
- Manual CLI re-enrichment remains available as an operator/debug escape hatch even if the browser no longer exposes a dedicated enrich button.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| PTM-S01 | Target Manager Tools & Data Model | Build the 4 tools (`list_targets`, `select_target`, `create_target`, `enrich_target`), the `TargetProfile` type, and `profile.json` persistence. Pure backend — no UI or CLI changes. | Existing tool registry, discovery module |
| PTM-S02 | CLI Integration & Runtime Switching | Make `--target` optional, add `--targets-dir`, add `target` REPL command, wire up session save/load on switch. Terminal-complete. | PTM-S01 |
| PTM-S03 | Browser Workbench Target UI | Add WebSocket contracts for target manager events, target header bar, switch dropdown, creation dialog, and enrichment progress indicator. Both surfaces complete. | PTM-S01, PTM-S02 |
| PTM-S04 | Automatic Background Enrichment | Start enrichment automatically after create/switch when a target lacks a profile, remove the browser enrich button, and keep progress passive in the workbench UX. | PTM-S02, PTM-S03 |
| PTM-S05 | Multi-Project Browser Workspaces | Keep one isolated browser runtime per target, add a project board for fast activation, and allow new/open target flows while another target is still busy. | PTM-S02, PTM-S03, PTM-S04 |

## Sequencing Rationale

- `PTM-S01` lands first because the tools and data model are the foundation everything else calls into. Testable in isolation with unit tests against the tool registry.
- `PTM-S02` adds the terminal experience on top of S01. This makes the feature usable end-to-end in the REPL without needing the browser.
- `PTM-S03` adds the richer browser surface last, since it depends on both the tools and the session switching logic being proven.
- `PTM-S04` follows the base browser flow because it intentionally changes the user experience from explicit enrichment to automatic/background enrichment and needs both surfaces to exist first.
- `PTM-S05` follows after PTM-S04 because it reuses the shipped browser target manager, session persistence, and background enrichment contracts instead of replacing them.

## Whole-Pack Success Signal

- A user can launch `shipyard` with no `--target` flag and be guided to pick or create a target.
- Enrichment produces a useful `TargetProfile` that the code phase can reference for better planning.
- A user mid-session can type `target switch` to change targets without losing prior session state.
- Newly created or newly selected targets without a saved profile are enriched automatically.
- The browser workbench shows the active target, allows switching via the UI, and treats enrichment as passive background work instead of a separate button-driven action.
- The browser workbench can keep multiple targets open concurrently, activate an already-open target instantly, and open or create another target without forcing the current project run to stop first.
- All existing `--target <path>` behavior is unchanged (backward compatible).

## Implementation Evidence

### Code References

- [`../../../src/tools/target-manager/create-target.ts`](../../../src/tools/target-manager/create-target.ts),
  [`../../../src/tools/target-manager/list-targets.ts`](../../../src/tools/target-manager/list-targets.ts),
  [`../../../src/tools/target-manager/select-target.ts`](../../../src/tools/target-manager/select-target.ts),
  [`../../../src/tools/target-manager/enrich-target.ts`](../../../src/tools/target-manager/enrich-target.ts),
  and [`../../../src/tools/target-manager/profile-io.ts`](../../../src/tools/target-manager/profile-io.ts):
  implement the target-manager tool surface, lightweight scaffold presets, and
  persisted `TargetProfile` storage under `.shipyard/profile.json`.
- [`../../../src/bin/shipyard.ts`](../../../src/bin/shipyard.ts),
  [`../../../src/engine/state.ts`](../../../src/engine/state.ts),
  [`../../../src/engine/target-command.ts`](../../../src/engine/target-command.ts),
  [`../../../src/engine/loop.ts`](../../../src/engine/loop.ts), and
  [`../../../src/engine/target-enrichment.ts`](../../../src/engine/target-enrichment.ts):
  make `--target` optional, preserve target-bound sessions, add CLI target
  switching, and automatically enrich unprofiled targets when context exists.
- [`../../../src/ui/contracts.ts`](../../../src/ui/contracts.ts),
  [`../../../src/ui/server.ts`](../../../src/ui/server.ts),
  [`../../../src/ui/target-manager.ts`](../../../src/ui/target-manager.ts), and
  [`../../../src/ui/workbench-state.ts`](../../../src/ui/workbench-state.ts):
  ship the browser target manager state, create/switch events, recovery on
  reload, passive background enrichment, stale-run protection, and the
  multi-project runtime registry plus project-board summaries.
- [`../../../ui/src/TargetHeader.tsx`](../../../ui/src/TargetHeader.tsx),
  [`../../../ui/src/TargetSwitcher.tsx`](../../../ui/src/TargetSwitcher.tsx),
  [`../../../ui/src/TargetCreationDialog.tsx`](../../../ui/src/TargetCreationDialog.tsx),
  [`../../../ui/src/EnrichmentIndicator.tsx`](../../../ui/src/EnrichmentIndicator.tsx),
  [`../../../ui/src/ProjectBoard.tsx`](../../../ui/src/ProjectBoard.tsx), and
  [`../../../ui/src/ShipyardWorkbench.tsx`](../../../ui/src/ShipyardWorkbench.tsx):
  surface the active target, switcher, creation dialog, passive enrichment
  status, and the open-project activation board on the split-pane workbench UI.
- [`../../../tests/target-manager.test.ts`](../../../tests/target-manager.test.ts),
  [`../../../tests/target-auto-enrichment.test.ts`](../../../tests/target-auto-enrichment.test.ts),
  [`../../../tests/ui-runtime.test.ts`](../../../tests/ui-runtime.test.ts), and
  [`../../../tests/ui-workbench.test.ts`](../../../tests/ui-workbench.test.ts):
  cover the tool contracts, CLI/browser switching, background auto-enrichment,
  reload recovery, no-button UI expectations, and concurrent open-project
  browser behavior.

### Representative Snippets

```ts
if (options.targetPath) {
  resolvedTargetPath = options.targetPath;
  discovery = await discoverTarget(resolvedTargetPath);
  targetProfile = await loadTargetProfile(resolvedTargetPath);
} else {
  resolvedTargetPath = resolvedTargetsDirectory;
  discovery = createTargetManagerDiscovery(resolvedTargetsDirectory);
}
```

```ts
const plan = planAutomaticEnrichment({
  discovery: sessionState.discovery,
  targetProfile: sessionState.targetProfile,
  creationDescription: options.creationDescription,
});

if (plan.kind === "skip-existing-profile") {
  return;
}
```

```tsx
<TargetHeader
  activePhase={activePhase}
  targetManager={props.targetManager}
  onOpenSwitcher={() => setTargetSwitcherOpen(true)}
/>
```
