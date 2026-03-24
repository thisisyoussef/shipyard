# Technical Plan

## Metadata
- Story ID: P4-S04
- Story Title: LangSmith Tracing and MVP Verification
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/tracing/langsmith.ts`
  - graph or fallback runtime entrypoint
  - verification harnesses or manual scripts under `shipyard/tests/` or `shipyard/tests/manual/`
  - `shipyard/CODEAGENT.md`
- Public interfaces/contracts:
  - traced runtime invocation
  - operator-run verification instructions or scripts
  - documentation slot for two trace URLs
- Data flow summary: the runtime executes under LangGraph auto-tracing or `traceable` fallback instrumentation, two task runs are performed, the resulting trace URLs are captured, and `CODEAGENT.md` is updated with those references.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stateful execution engine
  - reversible editing and bounded recovery
  - real CLI wiring and trace capture
- Story ordering rationale: this story closes the phase because it depends on the runtime, recovery, and CLI being wired already.
- Gaps/overlap check: this story owns trace proof and MVP verification only; it does not redesign runtime logic.
- Whole-pack success signal: one successful trace and one failing trace exist in LangSmith and are linked from repo docs.

## Architecture Decisions
- Decision: treat LangSmith trace capture as the acceptance proof for Phase 4, not just an observability nice-to-have.
- Alternatives considered:
  - rely on console logs only
  - defer trace capture until a later phase
- Rationale: the phase brief explicitly defines the two trace URLs as MVP evidence.

## Data Model / API Contracts
- Request shape:
  - traced runtime input for a successful task
  - traced runtime input for an intentionally failing task
- Response shape:
  - trace URL or run identifier
  - final runtime result for each task
  - updated `CODEAGENT.md`
- Storage/index changes:
  - none beyond optional local transcript artifacts and the documentation update

## Dependency Plan
- Existing dependencies used: installed `langsmith`, installed LangGraph/LangChain stack, current runtime and CLI.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: tracing works locally but run URLs are not captured consistently.
  - Mitigation: make URL capture an explicit acceptance step and record the links immediately in docs after each successful run.

## Test Strategy
- Unit tests:
  - `getLangSmithConfig` environment parsing if needed
  - helper coverage for trace URL capture or documentation updates
- Integration tests:
  - traced runtime invocation path for graph and fallback modes where practical
- E2E or smoke tests:
  - one successful natural-language task
  - one failing natural-language task
- Edge-case coverage mapping:
  - missing tracing env vars
  - failing task still producing a trace
  - docs update with real URLs

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: if LangGraph auto-tracing is unstable, use the raw-loop fallback plus `traceable` so the phase can still ship with evidence.
- Feature flags/toggles: runtime selector may also decide which tracing path applies.
- Observability checks: trace trees should show model calls, tool invocations, and runtime transitions as nested runs.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
