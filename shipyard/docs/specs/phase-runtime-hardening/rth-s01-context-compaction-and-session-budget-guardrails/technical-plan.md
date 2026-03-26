# Technical Plan

## Metadata
- Story ID: RTH-S01
- Story Title: Context Compaction and Session Budget Guardrails
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/engine/turn-summary.ts`
  - `shipyard/src/context/envelope.ts`
  - `shipyard/src/engine/turn.ts`
  - a new helper such as `shipyard/src/engine/history-compaction.ts`
  - focused runtime tests such as `shipyard/tests/raw-loop.test.ts` and `shipyard/tests/turn-runtime.test.ts`
- Public interfaces/contracts:
  - a compact-history helper or snapshot contract for completed tool cycles
  - rolling-summary character-budget constants
  - context-envelope serialization budget and truncation markers
- Data flow summary: after each completed tool cycle, Shipyard records a concise state snapshot. Before the next Anthropic request, the runtime keeps the minimal verbatim tail needed for protocol continuity and feeds older history back through bounded compact summaries and envelope fields instead of raw lifetime payloads.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - bounded context growth in long write-heavy sessions
  - predictable follow-up prompt size
  - compact long-run state that still supports reread-on-demand behavior
- Story ordering rationale: this story lands first because budget recovery, routing, and long-run smoke are all distorted until context growth is under control.
- Gaps/overlap check: this story owns history compaction and summary budgets only; provider timeout or `max_tokens` recovery belongs in `RTH-S02`.
- Whole-pack success signal: the runtime can summarize stale tool work without losing the facts needed to continue the task safely.

## Architecture Decisions
- Decision: implement app-side history compaction first instead of depending on provider-side compaction.
- Alternatives considered:
  - replay full history forever
  - rely only on provider-side compaction
  - rely only on prompt caching
- Rationale: Shipyard needs a repo-controlled fix that works for graph mode, fallback mode, and subagents using the current runtime contracts.

## Data Model / API Contracts
- Request shape:
  - Anthropic request still uses normal `messages`, but they are derived from a compacted session view rather than raw lifetime history
  - compact-history metadata identifies the preserved verbatim tail versus summarized older cycles
- Response shape:
  - compaction metadata such as compacted cycle count, preserved tail size, and truncated section markers
- Storage/index changes:
  - optional compact-history counters or summaries in runtime/session state
  - no new user-facing storage if existing session and handoff surfaces are sufficient

## Dependency Plan
- Existing dependencies used: raw loop, context envelope, rolling summary, handoff/session patterns, and local tracing.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: over-compaction removes context the model still needs.
  - Mitigation: preserve the most recent protocol tail verbatim, keep reread-on-demand available, and test large follow-up turns explicitly.

## Test Strategy
- Unit tests:
  - history-compaction helper preserves the right verbatim tail and summarizes only completed older cycles
  - rolling-summary budgets truncate both instruction and summary fields
  - context-envelope serialization emits explicit truncation markers when budgets are exceeded
- Integration tests:
  - multi-turn raw loop with repeated large `write_file` payloads stays bounded
  - graph follow-up turn continues successfully after older history is compacted
- E2E or smoke tests:
  - optional live session that writes a large file, then continues in the same session with compacted history
- Edge-case coverage mapping:
  - active tool cycle that cannot yet be compacted
  - failed tool turn with concise error preservation
  - deleted or externally changed file after compaction
  - single oversized instruction line

## Rollout and Risk Mitigation
- Rollback strategy: keep compaction behind a dedicated helper boundary so Shipyard can fall back to current verbatim history if protocol regressions appear.
- Feature flags/toggles: optional if a staged rollout is needed, but the budget constants should still be testable and deterministic.
- Observability checks: local logs or trace metadata should show when compaction occurred, how much history was compacted, and whether envelope sections were truncated.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
