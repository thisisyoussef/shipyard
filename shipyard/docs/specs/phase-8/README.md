# Phase 8: Spec-Driven Operator Workflow Story Pack

- Pack: Phase 8 Spec-Driven Operator Workflow
- Estimate: 10-14 hours
- Date: 2026-03-25
- Status: In progress (`P8-S01`, `P8-S02`, and `P8-S04` implemented; `P8-S03` still planned)

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

- `shipyard/src/tools/load-spec.ts`: `P8-S01` lands the new read-only
  `load_spec` workflow with deterministic directory expansion, stable `spec:`
  refs, explicit truncation markers, and clear skip reasons for non-text or
  oversized files.
- `shipyard/src/tools/index.ts` and `shipyard/src/phases/code/index.ts`:
  register `load_spec` and expose it on the normal code-phase tool surface.
- `shipyard/src/phases/code/prompts.ts`: updates the default code-phase
  guidance so spec-driven work prefers `load_spec`.
- `shipyard/tests/spec-loader.test.ts`: validates the story contract end to
  end.

- `P8-S04`: [`../../src/tools/target-manager/scaffolds.ts`](../../src/tools/target-manager/scaffolds.ts),
  [`../../src/tools/target-manager/scaffold-materializer.ts`](../../src/tools/target-manager/scaffold-materializer.ts),
  [`../../src/tools/target-manager/bootstrap-target.ts`](../../src/tools/target-manager/bootstrap-target.ts),
  [`../../src/phases/code/prompts.ts`](../../src/phases/code/prompts.ts), and
  [`../../tests/scaffold-bootstrap.test.ts`](../../tests/scaffold-bootstrap.test.ts)
  add the richer workspace preset, shared empty-target bootstrap path, and
  regression coverage.

- `shipyard/src/plans/store.ts`, `shipyard/src/plans/turn.ts`, and
  `shipyard/src/engine/state.ts`: `P8-S02` add the typed persisted task queue,
  `.shipyard/plans/` storage helpers, and the planning-only executor.
- `shipyard/src/engine/loop.ts`, `shipyard/src/ui/server.ts`, and
  `shipyard/src/agents/planner.ts`: `P8-S02` route `plan:` through the
  planning-only path in both operator surfaces and let the planner use
  `load_spec`.
- `shipyard/tests/plan-mode.test.ts` and `shipyard/tests/loop-runtime.test.ts`:
  validate persisted queue storage, spec-ref capture, and terminal routing for
  `plan:`.

- `P8-S03`: N/A in this changeset.

### Representative Snippets

- `P8-S01` stable-ref shape:

  ```ts
  function createSpecRef(relativePath: string): string {
    return `spec:${stripFileExtension(relativePath)}`;
  }
  ```

- `P8-S01` code-phase tool exposure:

  ```ts
  export const CODE_PHASE_TOOL_NAMES = [
    "read_file",
    "load_spec",
    "write_file",
  ];
  ```

- `P8-S04` default scaffold:

```ts
const DEFAULT_BOOTSTRAP_SCAFFOLD_TYPE: ScaffoldType = "ts-pnpm-workspace";
```

- `P8-S04` turn-state refresh after bootstrap:

```ts
if (toolName === "bootstrap_target" && isBootstrapTargetData(resultData)) {
  sessionState.discovery = context.result.data.discovery;
}
```

- `P8-S02` task queue storage:

```ts
export function getPlanFilePath(
  targetDirectory: string,
  planId: string,
): string {
  return path.join(getPlanDirectory(targetDirectory), `${planId}.json`);
}
```

- `P8-S02` planning-only routing:

```ts
if (isPlanModeInstruction(line)) {
  const planResult = await executePlanTurn({
    sessionState: state,
    runtimeState,
    instruction: line,
    signal: turnController.signal,
  });
}
```
