# Task Breakdown

## Story
- Story ID: P7-S01
- Story Title: Planner Subagent and ExecutionSpec Artifact

## Execution Notes
- Keep the planner read-only and artifact-focused.
- Preserve the lightweight path for trivial or exact-path requests.
- Validate planner output locally before any coordinator logic consumes it.
- Prefer a compact schema over a giant product-spec document.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - durable handoff for long-running work
  - traceable harness routing
- Planned stories in this pack:
  - P7-S01 Planner Subagent and ExecutionSpec Artifact
  - P7-S02 Evaluation Plan and Multi-Check Verifier
  - P7-S03 Browser Evaluator for Previewable Targets
  - P7-S04 Long-Run Handoff Artifacts and Reset Routing
  - P7-S05 Adaptive Coordinator Routing and Trace Calibration
- Why this story set is cohesive: planner, evaluator, browser QA, and handoff all depend on a shared contract for what the run is trying to achieve.
- Coverage check: P7-S01 advances the pack's planning-contract objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for `ExecutionSpec` parsing, planner invocation, malformed output rejection, and trivial-path bypass heuristics. | must-have | no | `pnpm --dir shipyard test -- tests/planner-subagent.test.ts` |
| T002 | Add the `ExecutionSpec` artifact type plus planner parsing helpers and any minimal heuristic helpers needed for broad vs lightweight routing. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Implement the read-only planner prompt and isolated planner invocation path in `shipyard/src/agents/planner.ts`. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/planner-subagent.test.ts` |
| T004 | Add planner-route metadata coverage, sync nearby docs if the contract shape changes, and keep the current `TaskPlan` path as the explicit fallback. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `execution spec validation rejects malformed planner JSON`
  - [ ] `planner routing helper skips trivial exact-path instructions`
- T002 tests:
  - [ ] `execution spec preserves deliverables, acceptance criteria, and verification intent`
- T003 tests:
  - [ ] `planner returns a valid execution spec from a broad request`
  - [ ] `planner stays read-only and does not expose write tools`
- T004 tests:
  - [ ] `planner route metadata is recorded when planning is used`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
