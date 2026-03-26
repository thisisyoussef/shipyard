# Technical Plan

## Metadata
- Story ID: RTH-S05
- Story Title: Long-Run Graph and Follow-Up Smoke Coverage
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/tests/manual/phase3-live-loop-smoke.ts` or a new richer manual smoke script beside it
  - `shipyard/tests/manual/README.md`
  - shared helpers such as `shipyard/src/engine/live-verification.ts`
  - runtime docs or stress-validation docs that index the new smoke path
- Public interfaces/contracts:
  - rerunnable manual smoke command or script contract
  - transcript or artifact output contract for scenario diagnostics
  - graph-mode multi-turn live-smoke scenario definitions
- Data flow summary: the smoke provisions a temp target, runs a write-heavy graph-mode turn, persists the session, sends a follow-up turn against the same target and session, and writes out transcripts, artifacts, and trace or stop-reason evidence for each scenario.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - realistic regression coverage for long-running write-heavy sessions
  - visible acceptance evidence for compaction, budget, and routing fixes
- Story ordering rationale: this story lands last because it should prove the earlier runtime hardening work instead of compensating for missing fixes.
- Gaps/overlap check: this story owns live regression coverage only; it does not implement compaction, provider recovery, or routing changes itself.
- Whole-pack success signal: contributors can run one opt-in live smoke and know whether Shipyard survives the exact class of session that was previously failing.

## Architecture Decisions
- Decision: test the actual graph-mode turn executor and same-session follow-up flow instead of only the raw loop in isolation.
- Alternatives considered:
  - keep the current tiny raw-loop greeting smoke
  - add only more unit tests
  - rely only on stress-matrix documentation without a live harness
- Rationale: the failing behavior sits in graph-mode continuation and write-heavy sessions, so the smoke must reach that path directly.

## Data Model / API Contracts
- Request shape:
  - scenario instruction set for an initial write-heavy turn and one follow-up turn
  - optional budget overrides or prerequisites for the live run
- Response shape:
  - scenario result summary
  - transcript path, artifact paths, and trace URL or stop-reason summary
- Storage/index changes:
  - temp target directories and session artifacts kept for inspection
  - optional doc updates in stress-validation or manual-test indexes

## Dependency Plan
- Existing dependencies used: live-verification helpers, current runtime entry points, transcript collectors, and session persistence.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the smoke becomes too brittle or too expensive to rerun.
  - Mitigation: keep it manual, bounded to a few high-value scenarios, and explicit about prerequisites and artifacts.

## Test Strategy
- Unit tests:
  - not the primary value of this story; focus unit work only where the smoke helpers themselves need coverage
- Integration tests:
  - graph-mode initial turn writes a meaningful amount of code or scaffold output
  - same-session follow-up continues against the existing session and target
  - artifact capture records the scenario outcome and failure diagnostics
- E2E or smoke tests:
  - one large-write or scaffold-heavy scenario
  - one follow-up continuation scenario
  - optional fallback control scenario if useful for comparison
- Edge-case coverage mapping:
  - missing API key
  - graph-mode unavailable or explicit fallback
  - live failure with preserved artifacts
  - scenario that still escalates into explorer or planner

## Rollout and Risk Mitigation
- Rollback strategy: keep the new smoke isolated to manual-test surfaces so it can be revised without destabilizing the default unit-test suite.
- Feature flags/toggles: not required beyond existing Anthropic credentials and any runtime-budget env overrides.
- Observability checks: the smoke output should include scenario name, tool calls or route summary, session/transcript paths, and trace URL or stop-reason details.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
