# Technical Plan

## Metadata
- Story ID: RTH-S02
- Story Title: Anthropic Budget and Max-Tokens Recovery
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/anthropic.ts`
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/engine/graph.ts` or `shipyard/src/engine/turn.ts` if error metadata needs to flow upward
  - focused tests such as `shipyard/tests/raw-loop.test.ts` and `shipyard/tests/anthropic-contract.test.ts`
- Public interfaces/contracts:
  - Anthropic config overrides for timeout and `max_tokens`
  - explicit runtime handling for `stop_reason=max_tokens`
  - targeted budget-exhaustion error or bounded continuation result contract
- Data flow summary: Shipyard resolves configurable Anthropic budgets before request creation, sends the request, inspects `stop_reason`, and either continues in a bounded way or raises a targeted budget error without pretending the response finished normally.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - production-grade provider budgets
  - explicit provider-failure diagnosis
  - no more opaque raw-loop failures for output truncation
- Story ordering rationale: this story lands after context compaction so budget recovery reflects the true remaining long-turn load rather than avoidable prompt bloat.
- Gaps/overlap check: this story owns provider budgets and `max_tokens` handling only; same-session routing and subagent visibility belong in `RTH-S03`.
- Whole-pack success signal: the runtime can tell the difference between "Claude timed out," "Claude hit output budget," and "the operator cancelled the turn."

## Architecture Decisions
- Decision: keep provider budgets configurable and handle `max_tokens` explicitly in the raw loop.
- Alternatives considered:
  - fixed bigger constants with no override
  - generic failure handling for every non-`tool_use` stop reason
  - manual operator retry as the only escape hatch
- Rationale: Shipyard needs a predictable production default plus an explicit recovery contract when the provider reports truncation instead of completion.

## Data Model / API Contracts
- Request shape:
  - existing Anthropic request helper plus configurable timeout and `max_tokens`
- Response shape:
  - raw-loop result or error path that includes stop-reason-aware metadata
  - optional bounded continuation decision metadata if retry is attempted
- Storage/index changes:
  - none required beyond any trace/runtime summary fields needed to surface stop reason and budget choice

## Dependency Plan
- Existing dependencies used: Anthropic SDK helpers, raw loop, graph runtime, and local/LangSmith tracing.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: larger budgets hide genuinely bad prompts by letting bad turns run longer.
  - Mitigation: keep retries bounded, record stop reasons explicitly, and preserve clear operator-visible diagnostics.

## Test Strategy
- Unit tests:
  - Anthropic config resolves new defaults and env overrides safely
  - invalid env values fail clearly
- Integration tests:
  - raw loop receives `stop_reason=max_tokens` with partial text and handles it via bounded recovery or targeted failure
  - raw loop receives `stop_reason=max_tokens` without final text and no longer throws the generic empty-final-text error
  - timeout and cancellation stay distinct
- E2E or smoke tests:
  - optional live run using elevated budgets to prove the runtime can continue deeper into a real code-writing session
- Edge-case coverage mapping:
  - partial text then truncation
  - truncation during subagent execution
  - provider timeout
  - invalid budget overrides

## Rollout and Risk Mitigation
- Rollback strategy: Anthropic defaults and stop-reason handling stay centralized so the runtime can revert to current behavior if a regression appears.
- Feature flags/toggles: env overrides are the primary rollout control.
- Observability checks: trace metadata or logs should record configured timeout, configured `max_tokens`, stop reason, and whether bounded continuation was attempted.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
