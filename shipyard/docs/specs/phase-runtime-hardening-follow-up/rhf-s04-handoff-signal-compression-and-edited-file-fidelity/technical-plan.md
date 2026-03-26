# Technical Plan

## Metadata
- Story ID: RHF-S04
- Story Title: Handoff Signal Compression and Edited-File Fidelity
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/handoff.ts`
  - `shipyard/src/context/envelope.ts`
  - `shipyard/src/engine/turn.ts` or related runtime-state plumbing if full edited-path capture needs to flow farther
  - focused tests such as `shipyard/tests/turn-runtime.test.ts` or handoff-specific coverage
- Public interfaces/contracts:
  - handoff payload fields for concise goal summary and richer touched-file sets
  - serialized handoff prioritization rules inside the context envelope
- Data flow summary: the turn gathers edited or created paths from actual tool execution, stores them in the handoff alongside a concise goal summary, and the context envelope serializes the most useful continuation fields first within the fixed handoff budget.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - continuation-ready handoffs
  - useful file evidence under tight prompt budgets
  - less prose, more actionable state
- Story ordering rationale: this story lands before continuation semantics change so the resume payload is trustworthy first.
- Gaps/overlap check: this story improves handoff quality; automatic continuation behavior belongs in `RHF-S05`.
- Whole-pack success signal: a threshold-triggered handoff is short, file-rich, and resumeable instead of verbose and vague.

## Architecture Decisions
- Decision: optimize handoffs around concise summaries plus full edited-file coverage, not copied goal text.
- Alternatives considered:
  - enlarge the handoff budget and keep the same payload
  - rely on rolling summary instead of improving handoff quality
  - keep using only `lastEditedFile`
- Rationale: the continuation surface is budget-constrained, so the fix should upgrade signal quality rather than just packing in more text.

## Data Model / API Contracts
- Request shape:
  - unchanged turn request shape
- Response shape:
  - persisted handoff includes concise completed-work summary and richer touched-file evidence
- Storage/index changes:
  - optional handoff field additions or summary shaping while preserving backward readability

## Dependency Plan
- Existing dependencies used: handoff artifact schema, context envelope serializer, runtime-state path evidence, and tests.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: richer touched-file capture inflates the handoff again.
  - Mitigation: dedupe, order, and truncate file lists intentionally, and prioritize them above copied prose.

## Test Strategy
- Unit tests:
  - handoff summary generation trims copied-goal prose down to a concise summary
  - touched-file collection preserves all edited paths and dedupes them deterministically
- Integration tests:
  - serialized handoff favors file evidence and remaining work under the fixed budget
  - resumed-turn context contains the right paths after a multi-file generation turn
- E2E or smoke tests:
  - continuation fixture confirms handoff usefulness after a long multi-file turn
- Edge-case coverage mapping:
  - many touched files
  - failed verification
  - blocked files
  - older handoff artifact compatibility

## Rollout and Risk Mitigation
- Rollback strategy: keep handoff shaping centralized in one artifact builder and one serializer.
- Feature flags/toggles: none required.
- Observability checks: persisted handoff JSON and serialized envelope output should make the prioritization obvious in tests and traces.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
