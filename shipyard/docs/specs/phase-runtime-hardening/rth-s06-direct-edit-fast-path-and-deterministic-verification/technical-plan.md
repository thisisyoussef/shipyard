# Technical Plan

## Metadata
- Story ID: RTH-S06
- Story Title: Direct-Edit Fast Path and Deterministic Verification
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/live-verification.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - focused tests in `shipyard/tests/graph-runtime.test.ts`,
    `shipyard/tests/live-verification.test.ts`, and
    `shipyard/tests/langsmith-tracing.test.ts`
- Public interfaces/contracts:
  - fast-path eligibility helper for targeted UI or copy edits
  - graph-state evidence for a deterministic direct edit
  - harness-route metadata for acting mode and verification mode
  - trace lookup options for cheap vs default URL resolution
- Data flow summary: triage and planning keep classifying the task as
  lightweight, the act node attempts a bounded direct-edit pass when the task is
  eligible, the verify node proves the surgical edit deterministically and runs
  at most one direct command, and LangSmith uses a cheaper lookup budget for
  that same lane.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - cheap direct-edit happy path
  - deterministic verification before expensive helper loops
  - trace evidence that explains why a tiny edit stayed cheap
- Story ordering rationale: this story follows the continuation-routing and
  smoke work because those traces exposed the remaining latency cliff on tiny
  direct edits.
- Gaps/overlap check: this story hardens the shipped lightweight lane only; it
  does not replace Phase 10 routing or verification planning architecture.
- Whole-pack success signal: the runtime still has one general raw-loop path,
  but tiny targeted edits can bypass most of it safely.

## Architecture Decisions
- Decision: add a narrowly-scoped direct-edit fast path instead of trying to
  make the raw loop itself magically cheap for every request.
- Alternatives considered:
  - always keep the current raw-loop plus verifier flow
  - skip verification entirely for tiny edits
  - replace all lightweight execution with a new non-tooling runtime
- Rationale: the traces showed the cost problem comes from repeated model and
  tracing hops, not from the actual file tools, so the fix should collapse those
  hops without weakening safety or replacing the whole runtime.

## Data Model / API Contracts
- Request shape:
  - current instruction
  - route complexity and lightweight/planner decision
  - bounded candidate file set for direct edit eligibility
  - current file contents used to build one surgical edit intent
- Response shape:
  - acting result with a direct-edit artifact when the fast path succeeds
  - verification report marked as deterministic or deterministic+command
  - trace metadata carrying acting mode and verification mode
- Storage/index changes:
  - no new durable product storage
  - ephemeral graph-state field for the latest direct-edit artifact

## Dependency Plan
- Existing dependencies used: current coordinator routing, model adapter
  routing, `read_file`, `edit_block`, `run_command`, surgical-edit verification,
  and LangSmith tracing helpers.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: Shipyard guesses the wrong file for a no-path targeted request.
  - Mitigation: keep the candidate set bounded, require a validated structured
    response, and fall back to the raw loop when the choice is ambiguous.

## Test Strategy
- Unit tests:
  - fast-path eligibility and candidate fallback behavior
  - surgical-edit verification helpers including failure cases
  - LangSmith trace lookup option handling
- Integration tests:
  - targeted no-path UI tweak uses the direct-edit fast path
  - ineligible or ambiguous targeted edits fall back to the raw loop
  - deterministic verification failure routes into recovery
- E2E or smoke tests:
  - fresh LangSmith finish check on a tiny direct edit that proves actual write
    activity and records the cheaper path
- Edge-case coverage mapping:
  - invalid color token normalization
  - missing candidate file
  - unexpected file drift between edit and verify
  - trace URL not yet indexed

## Rollout and Risk Mitigation
- Rollback strategy: keep the fast-path helpers isolated so the graph can return
  to the current raw-loop and verifier-only behavior by reverting a small set of
  runtime branches.
- Feature flags/toggles: not required for this first hardening slice.
- Observability checks: trace metadata and local runtime summaries should show
  acting mode, verification mode, and whether LangSmith returned a full run URL
  or only the partial trace reference.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
