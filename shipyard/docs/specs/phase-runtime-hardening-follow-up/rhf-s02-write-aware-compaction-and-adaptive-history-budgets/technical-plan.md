# Technical Plan

## Metadata
- Story ID: RHF-S02
- Story Title: Write-Aware Compaction and Adaptive History Budgets
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/history-compaction.ts`
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/engine/anthropic.ts` if history budget scales from resolved provider settings
  - focused tests such as `shipyard/tests/raw-loop.test.ts`
- Public interfaces/contracts:
  - compaction result metadata should expose when a write-tail was preserved
  - history-budget configuration should be explicit and overrideable
- Data flow summary: completed tool turns enter compaction as bounded digests, the compactor preserves at least one recent write-aware tail when files were edited, and the overall history budget is resolved from a larger or adaptive policy before the next Anthropic request is built.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - preserve recent write context
  - prevent reread spirals
  - keep replay budgets realistic for production-scale turns
- Story ordering rationale: this story follows `RHF-S01` because write-aware preservation only works cleanly once completed tool turns are already stored as compact digests.
- Gaps/overlap check: this story owns compaction heuristics and history budget sizing; continuation semantics belong in `RHF-S05`.
- Whole-pack success signal: recent write context survives compaction without reopening raw file-body replay.

## Architecture Decisions
- Decision: preserve at least one recent write-aware tail and raise or scale the history budget from a single centralized policy.
- Alternatives considered:
  - keep the fixed `12_000` budget and only tweak the tail heuristic
  - preserve more raw verbatim tail turns
  - blindly increase every budget without write-aware preservation
- Rationale: the loop needs both a realistic budget and a rule that treats newly written files as first-class context.

## Data Model / API Contracts
- Request shape:
  - unchanged Anthropic request contract with improved pre-request compaction
- Response shape:
  - compaction metadata includes preserved write-tail count and effective budget
- Storage/index changes:
  - none beyond any optional trace or log metadata for compaction decisions

## Dependency Plan
- Existing dependencies used: compact tool-turn digests, raw-loop state, Anthropic runtime config, and tests.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: larger budgets hide context growth regressions.
  - Mitigation: keep compaction metrics visible and preserve only bounded digests rather than raw file contents.

## Test Strategy
- Unit tests:
  - write-heavy turns force preservation of at least one recent write tail
  - adaptive or larger budget resolution is deterministic
- Integration tests:
  - replay after a large `write_file` turn still remembers the created file paths
  - compaction never drops to zero preserved tails when recent writes exist
- E2E or smoke tests:
  - instrumented replay of a generated multi-hundred-line file proves the next follow-up request keeps useful write context
- Edge-case coverage mapping:
  - mixed read and write turns
  - multi-file write turns
  - preserved tail that still needs second-stage truncation
  - explicit config overrides

## Rollout and Risk Mitigation
- Rollback strategy: keep the old fixed-budget path easy to restore behind one compaction policy module if regressions appear.
- Feature flags/toggles: configuration overrides can tune the effective history budget during rollout.
- Observability checks: traces or logs should show estimated history size before compaction, after compaction, and preserved write-tail count.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
