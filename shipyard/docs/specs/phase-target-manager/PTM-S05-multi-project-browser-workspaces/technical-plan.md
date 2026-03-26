# Technical Plan

## Metadata
- Story ID: PTM-S05
- Story Title: Multi-Project Browser Workspaces
- Author: Codex
- Date: 2026-03-26

## Proposed Design

- Components/modules affected:
  - `shipyard/src/ui/contracts.ts` — add project-board summary and open/activate
    message contracts.
  - `shipyard/src/ui/server.ts` — replace the single mutable browser runtime
    with a small registry of per-target project runtimes.
  - `shipyard/src/ui/workbench-state.ts` — preserve active-project identity and
    route detailed state to the correct project snapshot.
  - `shipyard/src/ui/target-manager.ts` — adapt the target list into
    open-or-activate semantics and project-board summaries.
  - `shipyard/ui/src/ShipyardWorkbench.tsx` plus new UI components for the
    project board.
  - `shipyard/tests/ui-runtime.test.ts`, `shipyard/tests/ui-view-models.test.ts`,
    `shipyard/tests/ui-workbench.test.ts` — runtime, reducer, and rendering
    coverage.
- Public interfaces/contracts:
  - project board state describing open projects, active project id, target
    identity, and status summary
  - browser messages for activating a project and opening or creating a target
    into a project runtime
  - active-project keyed session snapshot routing
- Data flow summary:
  1. UI runtime starts with one initial project runtime: either an existing code
     target or a target-manager entry workspace.
  2. The browser receives the active project snapshot plus a project-board
     summary for all open projects.
  3. Opening an existing target checks the registry by target path; if it
     exists, the server activates it, otherwise it creates a new project runtime.
  4. Creating a new target scaffolds the target, opens a new project runtime,
     and activates it without cancelling other projects.
  5. Each project runtime keeps its own controller, preview supervisor, deploy
     state, target enrichment, and session persistence; only the active project
     streams detailed updates to the visible workbench.

## Pack Cohesion and Sequencing

- Higher-level pack objectives:
  - selectable targets
  - runtime switching
  - browser target management
  - automatic background enrichment
  - concurrent browser multi-project operation
- Story ordering rationale: PTM-S05 builds directly on the shipped target
  manager and background enrichment flows, turning them into isolated per-target
  browser runtimes instead of replacing those contracts.
- Gaps/overlap check: this story handles multi-project browser operation only.
  It intentionally stops short of the generalized isolated task board planned in
  phase 10.
- Whole-pack success signal: one Shipyard browser runtime can hold multiple
  open targets, each with isolated durable state, while preserving one writer
  per target and the existing target-manager entry flow.

## Architecture Decisions

- Decision: keep one browser runtime per target path and dedupe by target path.
  - Alternatives considered:
    - keep the current global singleton and just queue target actions
    - allow multiple runtimes per same target
  - Rationale: queueing would not satisfy the user goal of multiple projects at
    once, while multiple writers on the same target would violate the safety
    model.

- Decision: only the active project streams detailed workbench updates; all
  projects publish lightweight summary updates to the project board.
  - Alternatives considered:
    - stream every project's detailed events into one reducer
    - fully isolate state per socket instead of per server runtime
  - Rationale: scoped detailed updates are the smallest change that preserves
    current workbench architecture and prevents background projects from
    clobbering the visible transcript.

- Decision: treat browser "switch target" as "activate existing project or open
  a target-backed project runtime."
  - Rationale: once multiple projects can stay open, replacing one global
    target no longer matches the user model.

## Data Model / API Contracts

- Request shape:
  - `project:activate_request`
  - `target:switch_request`
  - `target:create_request` returning/activating a project runtime
- Response shape:
  - project-board summary state
  - active-project snapshot state
  - target open/create completion tied to a project id
- Storage/index changes:
  - no new on-disk schema required for the first slice
  - reuse target-local `.shipyard/sessions` persistence per open project

## Dependency Plan

- Existing dependencies used: session persistence, target-manager tools,
  preview supervisor, deploy summary sync, auto-enrichment planner, React view
  model layer, WebSocket event stream.
- New dependencies proposed: none.
- Risk and mitigation:
  - Risk: background project updates overwrite active UI state.
  - Mitigation: route detailed reducer events through an active-project key and
    keep non-active updates at summary level only.
  - Risk: preview supervisors leak processes.
  - Mitigation: keep supervisor ownership inside each project runtime and stop
    them during runtime teardown.

## Test Strategy

- Unit tests:
  - project board reducer behavior and active-project keyed snapshots
  - dedupe rules for already-open targets
- Integration tests:
  - open/create another target while one project is busy
  - activate an already-open target without duplicating runtimes
  - background project updates do not overwrite the active project snapshot
- E2E or smoke tests:
  - browser workbench renders the project board and preserves active-project
    state across activation changes
- Edge-case coverage mapping:
  - no target selected on startup
  - same target reopened
  - background enrichment on non-active project
  - background deploy status on non-active project

## UI Implementation Plan

- Behavior logic modules:
  - server-side runtime registry helpers
  - workbench state routing helpers keyed by active project id
- Component structure:
  - compact project board strip
  - updated target switcher/create surfaces
  - keyed active-project workbench shell
- Accessibility implementation plan:
  - tab or roving-button semantics for project activation
  - explicit active-state labels
  - keyboard open/create flow remains reachable
- Visual regression capture plan:
  - target-manager-only state
  - one ready project plus one busy background project
  - active project switch with restored preview metadata

## Rollout and Risk Mitigation

- Rollback strategy: if the registry abstraction fails validation, fall back to
  the current singleton runtime and keep the new story docs as planned work.
- Feature flags/toggles: not required for the first implementation slice if
  tests and build pass.
- Observability checks: include project/target identity in runtime transitions
  and preserve per-target trace ownership.

## Implementation Evidence

- Code references:
  - `shipyard/src/ui/contracts.ts`: adds the `project:activate_request`
    frontend message, the `projects:state` backend message, and the persisted
    project-board schema carried through the workbench snapshot.
  - `shipyard/src/ui/workbench-state.ts`: tracks `projectBoard` separately from
    the active transcript so background project summaries can update without
    clobbering the visible turn detail.
  - `shipyard/src/ui/server.ts`: replaces the single browser runtime with a
    per-target runtime registry, keeps one writer per target path, routes
    detailed websocket updates only for the active project, and allows
    create/open/activate flows while another project is busy.
  - `shipyard/ui/src/ProjectBoard.tsx`, `shipyard/ui/src/ShipyardWorkbench.tsx`,
    and `shipyard/ui/src/App.tsx`: add the open-project board, wire activation
    requests, and keep the target switcher/create flow as the entry point for
    opening more workspaces.
  - `shipyard/tests/ui-runtime.test.ts`, `shipyard/tests/ui-view-models.test.ts`,
    and `shipyard/tests/ui-workbench.test.ts`: cover concurrent open/create
    behavior, reducer isolation, and rendered project-board summaries.
- Representative snippets:

```ts
const existingProject = projectRuntimes.get(resolvedTargetPath);

if (existingProject) {
  existingProject.sessionState.lastActiveAt = new Date().toISOString();
  return {
    project: existingProject,
    reused: true,
  };
}
```

```ts
await emitProjectMessage(project, {
  type: "target:state",
  state: nextTargetManagerState,
});
await saveSessionState(project.sessionState);
```

```tsx
<ProjectBoard
  projectBoard={props.projectBoard}
  onActivateProject={props.onActivateProject}
  onOpenTargets={() => setTargetSwitcherOpen(true)}
/>
```

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
