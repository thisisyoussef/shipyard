# Task Breakdown

## Story
- Story ID: P6-S02
- Story Title: Verifier Subagent

## Execution Notes
- Keep the verifier command-only.
- Summarize command output instead of forwarding huge logs everywhere.
- Fail closed on any requested non-command tool.
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
- Coverage check: P6-S02 advances the pack's verification-contract objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for isolated invocation, command-only allowlist behavior, and `VerificationReport` validation. | must-have | no | `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts` |
| T002 | Implement the verifier prompt, allowlist, and raw-loop-backed isolated invocation path in `shipyard/src/agents/verifier.ts`. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Validate final output as `VerificationReport` JSON and fail closed on unauthorized tool requests or malformed responses. | blocked-by:T002 | yes | `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts` |
| T004 | Add passing, failing, and timeout command smoke coverage over a temp repo and sync nearby docs if delivered behavior narrows the contract. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Contract

- Public API surface:
  - `runVerifierSubagent(...)`
  - `VERIFIER_TOOL_NAMES`
  - report parsing/validation helper(s) exported for direct unit coverage
- Handoff artifact path: `.ai/state/tdd-handoff/p6-s02/`
- Focused RED/GREEN command: `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts`
- Property tests: not required
- Mutation gate: skipped because the helper script is not present in this repo; record the skip in the handoff metadata

## TDD Mapping

- T001 tests:
  - [ ] `verifier uses only the run_command allowlist and fails closed on unauthorized tool requests`
  - [ ] `verifier does not inherit prior assistant or user history`
- T002 tests:
  - [ ] `verifier runs a passing command and returns a structured report`
- T003 tests:
  - [ ] `verifier rejects malformed final report JSON`
  - [ ] `verifier returns a structured failure report for a failing command`
- T004 tests:
  - [ ] `verifier returns a structured failure report for a timed out command`

## Completion Criteria

- Verifier can execute commands and report results without raw-log dependency.
- Output is structured enough for coordinator decision-making.
- Acceptance criteria are mapped to green tests.
- Manual TDD handoff artifacts are present on disk for the story.
