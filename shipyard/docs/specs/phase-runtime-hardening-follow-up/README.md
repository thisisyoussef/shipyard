# Phase Runtime Hardening Follow-Up: Supplemental Story Pack

- Pack: Runtime Hardening Follow-Up (Supplemental)
- Estimate: 12-16 hours
- Date: 2026-03-26
- Status: Drafted for implementation

## Pack Objectives

1. Stop write-heavy loops from forgetting just-written files by storing history-safe tool-turn digests and preserving recent write context through compaction.
2. Make greenfield app construction cheaper by aligning prompt policy, bootstrap detection, and follow-up routing with how Shipyard actually writes new projects.
3. Treat long loops as resumable continuation work, backed by concise but file-rich handoffs, instead of surfacing them as hard failures.
4. Apply larger acting budgets only after the prompt and handoff surfaces are stable, then prove the fix with Trello/Jira-style replay coverage.

## Shared Constraints

- This pack builds on the implemented `phase-runtime-hardening` fixes and should refine them rather than reopen provider-budget or bootstrap-scaffolding decisions that already shipped.
- The coordinator remains the only writer.
- Compact history must preserve enough detail to re-read or continue safely without replaying full file bodies or multi-kilobyte command output.
- Prompt policy must distinguish creating new files from modifying existing files.
- Iteration-threshold handling may become continuation-first, but genuine provider, tool, or runtime errors must still fail closed with explicit diagnostics.
- Discovery and bootstrap readiness must derive from the same operator-visible rules for near-empty targets.
- Dynamic loop budgets are the last step in the pack and should ship only with regression evidence that the reread spiral is actually gone.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| RHF-S01 | History-Safe Tool Turn Records | Stop replaying full `tool_use.input` bodies and bulky `tool_result` payloads by storing compact, re-readable digests for completed write-heavy turns. | Phase 3/4/7/8 implementation |
| RHF-S02 | Write-Aware Compaction and Adaptive History Budgets | Preserve recent write context through compaction and scale history budgets so large writes do not immediately force reread spirals. | RHF-S01 |
| RHF-S03 | Greenfield Construction Prompt and Batching Policy | Let the code phase write new modules directly after bootstrap while still requiring reads before modifying existing files. | Phase 8 implementation, RHF-S01 |
| RHF-S04 | Handoff Signal Compression and Edited-File Fidelity | Replace noisy copied-goal handoff prose with concise summaries and complete edited-file evidence that survives envelope budgets. | Phase 7 implementation, RHF-S01 |
| RHF-S05 | Continuation-First Iteration Threshold Resume | Treat acting-loop iteration caps as resumable checkpoints backed by handoffs instead of hard failures. | RHF-S02, RHF-S04, Phase 7 implementation |
| RHF-S06 | Bootstrap-Ready Discovery Alignment | Make discovery and bootstrap agree that doc-seeded targets are still bootstrap-ready. | Phase 8 implementation |
| RHF-S07 | Task-Aware Loop Budgets and Long-Run Replay Coverage | Apply larger acting budgets only to broad greenfield builds and lock the fix in with Trello/Jira-style replay regression coverage. | RHF-S01, RHF-S02, RHF-S03, RHF-S05, RHF-S06 |

## Sequencing Rationale

- `RHF-S01` lands first because the biggest remaining leak is still raw history storage for completed tool turns.
- `RHF-S02` follows because write-aware compaction and larger budgets only help once stored turns are compact by construction.
- `RHF-S03` then relaxes greenfield prompt guidance so Shipyard can capitalize on the more stable history path instead of immediately rereading brand-new files.
- `RHF-S04` strengthens handoff payloads before continuation semantics start depending on them.
- `RHF-S05` flips iteration-threshold handling from failure to continuation once handoff fidelity is good enough to trust.
- `RHF-S06` is intentionally narrow and can land in parallel, but it belongs in the same pack because the discovery mismatch triggers the same wasted exploration loops during seeded greenfield runs.
- `RHF-S07` lands last because larger acting budgets only make sense after context churn, handoff quality, and bootstrap routing are already fixed.

## Whole-Pack Success Signal

- Long write-heavy turns keep a compact but concrete memory of just-written files instead of immediately falling back to `list_files` and rereads.
- New-file creation after bootstrap can proceed directly with coherent `write_file` batches, while existing-file edits still require `read_file` plus `edit_block`.
- Hitting the acting-iteration threshold produces a usable continuation path with a concise handoff and meaningful touched-file evidence, not a misleading hard failure.
- Seeded targets containing only `AGENTS.md` and/or `README.md` take the same bootstrap-ready path as truly empty targets.
- Task-aware loop budgets and replay tests prove Shipyard can carry Trello/Jira-like greenfield builds farther without the old reread spiral.

## Implementation Evidence

- N/A. This follow-up pack is planning-only in this change; no implementation landed yet.
