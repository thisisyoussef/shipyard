# Task Breakdown

## Story
- Story ID: P6-S01
- Story Title: Explorer Subagent

## Execution Notes
- Keep the explorer read-only.
- Favor structured outputs over narrative summaries.
- Fail closed on any requested non-read tool.
- Validate the final report locally before returning it to callers.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - split read-only discovery and verification away from the coordinator
  - make subagent contracts explicit and independently testable
  - preserve coordinator-only writes while adding narrower evidence paths
- Planned stories in this pack:
  - P6-S01 Explorer Subagent
  - P6-S02 Verifier Subagent
  - P6-S03 Coordinator Integration
- Why this story set is cohesive: it proves the discovery and verification contracts in isolation before the coordinator learns to depend on them.
- Coverage check: P6-S01 advances the pack's discovery-contract objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for isolated invocation, read-only allowlist behavior, and `ContextReport` validation. | must-have | no | `pnpm --dir shipyard test -- tests/explorer-subagent.test.ts` |
| T002 | Implement the explorer prompt, allowlist, and raw-loop-backed isolated invocation path in `shipyard/src/agents/explorer.ts`. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Validate final output as `ContextReport` JSON and fail closed on unauthorized tool requests or malformed responses. | blocked-by:T002 | yes | `pnpm --dir shipyard test -- tests/explorer-subagent.test.ts` |
| T004 | Add a focused broad-discovery smoke case over a temp repo and sync nearby docs if delivered behavior narrows the contract. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Contract

- Public API surface:
  - `runExplorerSubagent(...)`
  - `EXPLORER_TOOL_NAMES`
  - report parsing/validation helper(s) exported for direct unit coverage
- Handoff artifact path: `.ai/state/tdd-handoff/p6-s01/`
- Focused RED/GREEN command: `pnpm --dir shipyard test -- tests/explorer-subagent.test.ts`
- Property tests: not required
- Mutation gate: skipped because the helper script is not present in this repo; record the skip in the handoff metadata

## TDD Mapping

- T001 tests:
  - [ ] `explorer uses only the read-only tool allowlist and fails closed on unauthorized tool requests`
  - [ ] `explorer does not inherit prior assistant or user history`
- T002 tests:
  - [ ] `explorer runs a broad discovery question and returns structured findings`
- T003 tests:
  - [ ] `explorer rejects malformed final report JSON`
  - [ ] `explorer returns an empty findings array when discovery returns no matches`
- T004 tests:
  - [ ] `explorer broad-discovery smoke test uses real repo search output from a temp project`

## Completion Criteria

- Explorer can answer codebase questions with read-only tools only.
- Output is structured enough for the coordinator to consume directly.
- Acceptance criteria are mapped to green tests.
- Manual TDD handoff artifacts are present on disk for the story.
