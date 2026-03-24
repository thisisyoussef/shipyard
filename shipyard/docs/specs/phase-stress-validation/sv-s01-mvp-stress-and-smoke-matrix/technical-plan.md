# Technical Plan

## Metadata
- Story ID: SV-S01
- Story Title: MVP Stress and Smoke Matrix
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/tests/cli-loop.test.ts`
  - `shipyard/tests/tooling.test.ts`
  - `shipyard/tests/context-envelope.test.ts`
  - `shipyard/tests/ui-runtime.test.ts`
  - optional new focused integration test files for graph/fallback runtime and trace validation
  - optional helper script or npm script to run the matrix in one step
- Public interfaces/contracts:
  - no changes to user-facing engine contracts are required
  - the story may add a named validation command such as `pnpm --dir shipyard test:smoke` or a repo script that documents the matrix entrypoint
- Data flow summary: existing runtime and UI surfaces are driven through repeated instructions and explicit failure cases, then assertions are grouped by requirement rather than by internal module.

## Pack Cohesion and Sequencing

- Higher-level pack objectives:
  - confidence in repeated-use behavior
  - explicit requirement coverage
  - demo-readiness under stress
- Story ordering rationale: a single requirement matrix is more valuable than isolated follow-up tests because the hard part is validating the seams between subsystems.
- Whole-pack success signal: one suite answers whether the MVP promises still hold.

## Architecture Decisions

- Decision: treat the suite as a requirement matrix, not just more unit tests.
- Decision: keep fast deterministic smoke coverage separate from deeper stress checks that may be slower or more stateful.
- Decision: reuse current runtime entrypoints and UI protocol instead of mocking the whole engine.
- Rationale: the real risk is regression at integration seams, so the suite should exercise the real paths users and demos rely on.

## Requirement Matrix

- Persistent loop:
  - smoke: multiple instructions in one process, with `status` between turns
  - stress: longer turn sequence plus restart and resume
- Surgical editing:
  - smoke: successful unique-anchor edit
  - stress: repeated edits to one file, stale-read rejection, ambiguous anchor rejection, not-found rejection, large-diff rejection
- Context injection:
  - smoke: injected context appears in turn behavior and session summary
  - stress: multi-turn context carry-forward and bounded rolling summary
- Browser UI:
  - smoke: local UI instruction, streamed events, visible completion
  - stress: reconnect or error case with session state recovery
- Tracing:
  - smoke: one successful trace emitted
  - stress: one failure trace emitted and linked to the failed turn path

## Dependency Plan

- Existing dependencies used: Vitest, current CLI/UI test helpers, current local trace support, current LangSmith integration path.
- New dependencies proposed (if any):
  - none by default
- Risk and mitigation:
  - Risk: the suite becomes slow and flaky if every scenario is browser-heavy.
  - Mitigation: keep most coverage at the CLI/runtime layer and reserve only the highest-value flows for UI smoke.

## Test Strategy

- Unit tests:
  - bounded rolling summary behavior
  - requirement-matrix helper formatting if one is introduced
- Integration tests:
  - multi-turn CLI persistence and resume under repeated usage
  - graph and fallback runtime coverage
  - UI session and streamed event smoke checks
- Manual or soak checks:
  - one longer local operator run in terminal mode
  - one longer local operator run in `--ui` mode with an intentional error and recovery
- Failure-mode coverage mapping:
  - stale read
  - ambiguous anchor
  - not-found anchor
  - large rewrite rejection
  - missing-file runtime failure
  - browser reconnect or error state

## Rollout and Risk Mitigation

- Rollback strategy: keep any new matrix runner additive so existing tests remain independently runnable.
- Observability checks: test output and failure messages should name the requirement category that failed.
- Maintenance note: when new MVP promises are added, the matrix should gain a row instead of spawning a disconnected test story.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
