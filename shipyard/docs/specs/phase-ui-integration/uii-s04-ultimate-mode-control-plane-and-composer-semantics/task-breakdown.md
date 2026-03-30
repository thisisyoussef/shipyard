# Task Breakdown

## Story
- Story ID: UII-S04
- Story Title: Ultimate Mode Control Plane and Composer Semantics

## Execution Notes
- Keep typed ultimate controls additive and command-compatible.
- Make send semantics obvious in the UI; do not rely on invisible mode shifts.
- Persist/broadcast the same state the badge needs to render truthfully.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for typed ultimate contracts, reducer updates, composer send-mode behavior, and reconnect/reload state recovery. | must-have | no | `pnpm --dir shipyard test -- tests/ultimate-mode.test.ts tests/ui-runtime.test.ts tests/ui-view-models.test.ts` |
| T002 | Add additive `ultimate:toggle`, `ultimate:feedback`, and `ultimate:state` contracts plus persisted `ultimateState` in the workbench snapshot. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement server-side control-plane bridging from typed actions to the existing ultimate runtime and broadcast truthful state updates during start/feedback/stop/reconnect. | blocked-by:T001,T002 | no | focused runtime/ultimate tests |
| T004 | Wire composer toggle, badge dropdown, and human-feedback page to the typed control plane with explicit notices and fallback command parity. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T005 | Update docs and audit notes for ultimate-mode UI semantics and deferred coordinator work. | blocked-by:T004 | yes | `git diff --check` |

## TDD Mapping

- T001 tests:
  - [x] typed ultimate messages validate and reject malformed payloads
  - [x] reducer applies `ultimate:state` snapshots correctly
  - [x] composer send action changes meaning clearly between idle and active modes
- T002 tests:
  - [x] session snapshots carry ultimate state on reload
- T003 tests:
  - [x] feedback queues on the active loop
  - [x] stop requests surface a truthful stopping state
  - [x] pause requests preserve the standing brief and restore a paused snapshot
- T004 tests:
  - [x] human-feedback page still reaches the active loop
  - [x] paused mode returns the composer to normal instructions for quick edits

## Implementation Evidence

- T001: `shipyard/tests/ui-ultimate-composer.test.ts`,
  `shipyard/tests/ui-events.test.ts`,
  `shipyard/tests/ui-view-models.test.ts`, and
  `shipyard/tests/ui-human-feedback-page.test.ts`
- T002: `shipyard/src/ui/contracts.ts` and
  `shipyard/src/ui/workbench-state.ts`
- T003: `shipyard/src/ui/server.ts`,
  `shipyard/src/engine/ultimate-mode.ts`, and
  `shipyard/tests/ui-runtime.test.ts`
- T004: `shipyard/ui/src/use-workbench-controller.ts`,
  `shipyard/ui/src/ultimate-composer.ts`,
  `shipyard/ui/src/panels/ComposerPanel.tsx`,
  `shipyard/ui/src/shell/NavBar.tsx`,
  `shipyard/ui/src/shell/UltimateBadge.tsx`,
  `shipyard/ui/src/shell/UltimateToggle.tsx`, and
  `shipyard/ui/src/HumanFeedbackPage.tsx`
- Representative snippet:
  ```ts
  if (input.ultimateState.phase === "paused") {
    return {
      mode: "ultimate-paused",
      submitLabel: "Run instruction",
    };
  }
  ```
- T005: this story pack plus `shipyard/docs/specs/phase-ui-integration/README.md`

## Completion Criteria
- [x] All must-have tasks complete
- [x] Acceptance criteria mapped to completed tasks
- [x] Ultimate mode is startable, observable, and stoppable from the UI
- [x] Text-command fallback remains intact
- [x] Reload/reconnect restores truthful ultimate state
