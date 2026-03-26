# Feature Spec

## Metadata
- Story ID: RHF-S02
- Story Title: Write-Aware Compaction and Adaptive History Budgets
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

Even after the first hardening pass, history compaction can still erase all recent exact write context right after a large generation turn. The current budget is fixed at `12_000` characters, and the compaction heuristic only forces a verbatim tail when the last turn was read-heavy without writes. In practice that allows `preservedTailTurnCount` to drop to zero after big `write_file` turns, which sends the next request back into `list_files` plus re-read spirals.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: preserve at least one useful recent write context instead of compacting the loop into total amnesia.
- Objective 2: make history budgets large enough, or adaptive enough, for production-scale code-writing turns.
- Objective 3: keep compaction bounded without sacrificing the working set Shipyard just created.
- How this story or pack contributes to the overall objective set: This story turns history compaction from a blunt emergency brake into a write-aware mechanism that protects current momentum.

## User Stories
- As the raw loop, I want compaction to keep the latest write context available so I do not waste the next turns rediscovering files I just created.
- As an operator, I want long greenfield runs to continue from recent work instead of spending turns on `list_files` and rereads.

## Acceptance Criteria
- [ ] AC-1: When recent turns created or edited files, compaction preserves at least one recent write-heavy tail cycle in exact or compact form instead of allowing the preserved tail to collapse to zero.
- [ ] AC-2: Preserved write-tail records include the created or edited path or paths, concise file stats such as line count, and a short preview that helps the model continue safely.
- [ ] AC-3: The raw-loop history budget increases beyond the current `12_000` character ceiling, or becomes proportional to `max_tokens`, while remaining configurable and testable.
- [ ] AC-4: Compaction still keeps older turns bounded, and does not rely on replaying full file bodies to preserve recent write context.
- [ ] AC-5: Replay tests based on large generated files prove the next follow-up turn retains enough recent context to avoid the immediate reread spiral.

## Edge Cases
- A recent write tail can contain multiple file creations that should be summarized together without dropping key paths.
- The latest turn may mix reads and writes; the heuristic should still preserve the write-relevant part.
- If the preserved write-tail digest itself is too large, the system should degrade gracefully into a tighter compact form rather than deleting it entirely.
- Adaptive budgets must not silently mask runaway history growth.

## Non-Functional Requirements
- Reliability: write-tail preservation must be deterministic and easy to reason about.
- Performance: larger budgets should still remain bounded and avoid linear growth with full file contents.
- Observability: compaction decisions should expose whether a write tail was preserved and how much budget remained.
- Maintainability: budget policy should stay centralized instead of being scattered across raw-loop call sites.

## Out of Scope
- Provider-level token budgeting changes unrelated to replay history.
- Dynamic acting-iteration budgets for whole tasks; that belongs in `RHF-S07`.
- Prompt-policy changes for greenfield editing; that belongs in `RHF-S03`.

## Done Definition
- History compaction keeps at least one recent write-aware tail and uses a realistic budget, so large generation turns no longer immediately erase the context Shipyard needs to continue.
