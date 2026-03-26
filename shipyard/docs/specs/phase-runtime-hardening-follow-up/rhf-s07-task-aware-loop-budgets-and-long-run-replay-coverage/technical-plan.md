# Technical Plan

## Metadata
- Story ID: RHF-S07
- Story Title: Task-Aware Loop Budgets and Long-Run Replay Coverage
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/raw-loop.ts`
  - coordinator or turn-selection logic that can classify narrow vs broad greenfield work
  - replay or smoke coverage such as `shipyard/tests/graph-runtime.test.ts` and `shipyard/tests/manual/phase3-live-loop-smoke.ts`
- Public interfaces/contracts:
  - acting-budget selection policy and any config overrides
  - logs or trace metadata that record the chosen budget and why
- Data flow summary: before the acting loop starts, the runtime classifies the task using discovery, planning, and recent-work evidence, chooses a bounded acting budget, runs the loop with that budget, and records the choice in replay or smoke artifacts that cover broad greenfield scenarios.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - keep narrow work cheap
  - give broad greenfield builds enough room once earlier fixes land
  - prove the whole pack with realistic replay coverage
- Story ordering rationale: this story is last on purpose because it should only land after history churn, prompt policy, handoff quality, continuation semantics, and bootstrap routing are already corrected.
- Gaps/overlap check: this story owns task-aware budget sizing and replay proof only; continuation semantics remain in `RHF-S05`.
- Whole-pack success signal: a bigger acting budget becomes the final multiplier on a stable runtime instead of a bandage over reread churn.

## Architecture Decisions
- Decision: derive acting-loop budgets from task shape and recent evidence, not one global constant.
- Alternatives considered:
  - raise the default to `50` for every task
  - keep `25` for every task forever
  - let the provider or operator choose budgets implicitly without runtime heuristics
- Rationale: Shipyard needs a fast default for narrow edits and a larger bounded path for broad app construction, with evidence that the bigger budget is actually productive.

## Data Model / API Contracts
- Request shape:
  - existing turn request plus internal acting-budget choice
- Response shape:
  - runtime metadata records chosen acting budget and classification inputs
- Storage/index changes:
  - optional trace or replay metadata for acting-budget selection

## Dependency Plan
- Existing dependencies used: graph runtime, raw-loop options, discovery, task planning signals, continuation state, and smoke or replay tests.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: broad-budget heuristics accidentally apply to narrow work.
  - Mitigation: keep heuristics explicit, log the reason, and add counterexample coverage for narrow exact-path turns.

## Test Strategy
- Unit tests:
  - acting-budget selection keeps narrow work at the default limit
  - broad bootstrap-ready or greenfield tasks receive the larger bounded limit
- Integration tests:
  - same-session follow-ups with recent touched-file evidence can still stay on the narrow budget when scope is tight
  - continuation resumes inherit the correct budget classification
- E2E or smoke tests:
  - Trello or Jira-style replay or manual smoke confirms progress without the old reread spiral
  - long-run smoke records chosen acting budget and continuation behavior
- Edge-case coverage mapping:
  - broad request that collapses into a narrow scoped follow-up
  - continuation after threshold handoff
  - blocked-file path with large budget still failing closed

## Rollout and Risk Mitigation
- Rollback strategy: keep budget selection centralized so the runtime can fall back to one default if a regression appears.
- Feature flags/toggles: optional config override for the larger broad-build budget if rollout tuning is needed.
- Observability checks: traces and replay artifacts should show task classification, chosen acting budget, continuation count, and whether rereads still occurred.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
