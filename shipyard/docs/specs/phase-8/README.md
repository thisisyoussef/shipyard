# Phase 8: Spec-Driven Operator Workflow Story Pack

- Pack: Phase 8 Spec-Driven Operator Workflow
- Estimate: 10-14 hours
- Date: 2026-03-25
- Status: Drafted for implementation

## Pack Objectives

1. Let Shipyard load on-disk specs and briefs without depending on manual paste-only context injection.
2. Add a user-facing planning mode that turns broad requests into persisted, reviewable task queues.
3. Let the operator advance a plan one task at a time with `next` / `continue` while progress survives across sessions.
4. Reuse and deepen existing scaffold infrastructure for greenfield bootstrap instead of spending tokens on boilerplate file creation.

## Shared Constraints

- Reuse the existing context envelope, tool registry, session persistence, and `.shipyard/` storage patterns rather than inventing a separate sidecar runtime.
- Reuse Phase 7 planner work where applicable. Do not introduce a second, untyped planning system that competes with `ExecutionSpec`.
- Reuse the existing target-manager scaffold system where possible. Do not add a duplicate scaffolding implementation with divergent templates.
- Keep operator review in the loop. Bulk `implement_all` automation is explicitly out of scope for this pack.
- Do not stuff long raw specs into the rolling summary. Specs should be loaded intentionally and attached through scoped receipts, references, or turn context.
- `run_command` already owns bounded output and up-to-120-second timeouts; this pack should not add a separate dependency-install tool unless later evidence proves the current command tool is insufficient.
- Shipyard stays generic to repository workflows. Avoid project-specific “Ship” hard-coding in tools, prompts, or scaffold templates.

## Consultant Triage

| Consultant Feature | Existing Similar Surface | Decision | Reasoning |
|---|---|---|---|
| Spec ingestion tool | `read_file`, injected-context text area, context receipts | Keep, but adapt | Useful gap: Shipyard can read files, but it cannot treat spec documents as named, reusable context sources. The adaptation is a `load_spec` path that works with scoped receipts instead of relying on paste-only UX. |
| Task breakdown / `plan:` mode | lightweight `TaskPlan`, Phase 7 `ExecutionSpec` planner | Keep, but adapt | The user-facing plan mode is valuable. The consultant’s “not a typed artifact system” direction is not. The story should reuse the richer planner direction and persist an operator task queue under `.shipyard/plans/`. |
| Task runner / `next` | session persistence, loop commands, planned task queue from prior story | Keep, but adapt | Strong fit for Shipyard. This turns reviewable plans into resumable work. `implement_all` is intentionally discarded because it cuts against the operator-in-the-loop goal. |
| Project scaffolder | `create_target`, scaffold catalog, target-manager create flow | Keep, but adapt | A brand-new `scaffold_project` tool would duplicate existing target-manager scaffolding. The useful part is extending the shared scaffold catalog and optionally exposing a bootstrap path for already-selected empty targets. |
| Dependency installer | `run_command` already supports 120-second timeouts and bounded output | Discard for now | The consultant’s premise is stale relative to Shipyard’s actual command tool. This is not a new story unless real install pain shows up in traces. |
| Multi-file edit orchestration via session-summary string | `TaskPlan.plannedSteps`, rolling summary, Phase 7 planning/handoff stories | Absorb, do not split into a separate ad hoc system | The need is real, but the proposed mechanism is too crude. The useful part belongs in persisted active-task context/checklists attached to the plan runner and later handoff artifacts. |

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P8-S01 | Spec Loader and Named Context Sources | Add a read-only `load_spec` workflow that turns on-disk spec files into named, reusable context sources without manual paste. | Phase 2 tool registry, Phase 4 context envelope |
| P8-S02 | Plan Mode and Persisted Task Queue | Add a user-facing `plan:` mode that converts broad requests into a persisted task queue, reusing richer planner output instead of free-form notes. | P8-S01, Phase 7 `P7-S01` |
| P8-S03 | Next-Task Runner and Active Task Carry-Forward | Add `next` / `continue` execution against the persisted task queue and keep the active task checklist visible to future turns. | P8-S02 |
| P8-S04 | Shared Scaffold Presets and Empty-Target Bootstrap | Extend the existing scaffold system with richer generic workspace presets and a reusable bootstrap path for empty targets. | Phase Target Manager `PTM-S01`, `PTM-S02` |

## Sequencing Rationale

- `P8-S01` lands first because the later plan and task-runner stories need a first-class way to load spec documents without paste-only UX.
- `P8-S02` follows because the operator-facing plan mode should reuse spec loading and should align with Phase 7’s richer planner direction instead of inventing a parallel planner later.
- `P8-S03` lands after planning because `next` / `continue` only make sense once there is a persisted task queue to execute against.
- `P8-S04` is adjacent rather than foundational: it improves greenfield bootstrap using existing scaffold infrastructure, but it does not block the spec-driven operator workflow.

## Whole-Pack Success Signal

- An operator can keep spec documents on disk, load them by path, and reference them by stable names instead of repeatedly pasting them into the UI.
- A broad request can be turned into a persisted, reviewable task queue without immediately starting code execution.
- The operator can run one pending task at a time with `next` / `continue`, and Shipyard remembers which task is in flight or completed across sessions.
- Empty targets can be bootstrapped through shared scaffold presets instead of burning turns on repetitive boilerplate file creation.

## Implementation Evidence

### Code References

- N/A. This landing adds a new planning pack under `shipyard/docs/specs/phase-8/` and updates the spec-pack index only.

### Representative Snippets

- N/A. No runtime or product-code implementation landed as part of this docs-only planning pass.
