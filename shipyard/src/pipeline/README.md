# Pipeline Runtime

This folder holds Shipyard's explicit multi-phase pipeline lane.

## Purpose

- run named phase pipelines without forcing every instruction through a heavier workflow
- persist pipeline run state under `.shipyard/pipelines/`
- pause on required approval gates and resume deterministically after approve,
  edit, reject, skip, rerun, or back commands
- project a compact pipeline summary into the browser workbench snapshot so a
  later UI pack can render approval and progress state without redefining the
  runtime contract

## Files

- `contracts.ts`: typed pipeline, phase, approval, audit, and workbench-summary
  schemas
- `defaults.ts`: the current built-in `spec-driven-foundation` pipeline preset
- `store.ts`: target-local pipeline persistence helpers
- `turn.ts`: explicit `pipeline ...` command parsing plus execution/resume logic

## Command Surface

- `pipeline start <brief>`
- `pipeline status`
- `pipeline continue`
- `pipeline approve`
- `pipeline reject <feedback>`
- `pipeline edit <artifact body>`
- `pipeline skip [phase-id]`
- `pipeline rerun [phase-id]`
- `pipeline back [phase-id]`

## Notes

- P11-S02 focuses on the runtime contract only. It deliberately does not ship a
  polished approval UI.
- Advisory gates auto-continue in this phase; later UI work can layer richer
  countdown/interruption affordances on top of the same persisted state.
