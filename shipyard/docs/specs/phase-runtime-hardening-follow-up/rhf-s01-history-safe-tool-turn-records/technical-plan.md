# Technical Plan

## Metadata
- Story ID: RHF-S01
- Story Title: History-Safe Tool Turn Records
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/anthropic.ts`
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/engine/history-compaction.ts`
  - focused tests such as `shipyard/tests/raw-loop.test.ts` and `shipyard/tests/anthropic-contract.test.ts`
- Public interfaces/contracts:
  - internal history-safe serialization helpers for assistant tool turns and tool results
  - compact digest shape for completed tool executions
- Data flow summary: the loop keeps full live tool input and result data for execution, tracing, and immediate reporting, but converts completed historical tool turns into compact digests before they are persisted into replayable message history.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stop stale tool payload churn
  - preserve enough recent file evidence for follow-up turns
  - make later compaction and continuation work operate on bounded data
- Story ordering rationale: this story lands first because every remaining fix gets easier once history stops replaying raw file bodies and huge outputs.
- Gaps/overlap check: this story owns history-safe serialization itself; write-tail preservation and bigger budgets belong in `RHF-S02`.
- Whole-pack success signal: completed tool turns stop behaving like unbounded prompt ballast.

## Architecture Decisions
- Decision: separate live tool payloads from stored replay payloads, and store history-safe digests for completed write-heavy turns.
- Alternatives considered:
  - keep raw payloads and rely only on later compaction
  - drop most tool details entirely from history
  - compact only `write_file` while leaving other bulky tools untouched
- Rationale: Shipyard still needs concise, inspectable historical evidence, but it does not need to replay full file bodies or multi-kilobyte outputs once those effects are already durable on disk.

## Data Model / API Contracts
- Request shape:
  - existing Anthropic message requests with a new compact-history preparation step
- Response shape:
  - unchanged live tool result contracts
  - new internal digest fields such as tool name, paths, success, stats, fingerprint, and preview
- Storage/index changes:
  - none required outside replay-history serialization and any optional trace metadata

## Dependency Plan
- Existing dependencies used: Anthropic message helpers, raw-loop state, tool registry, and tracing hooks.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: compact digests omit a detail the next turn genuinely needs.
  - Mitigation: require re-read guidance in the digest and keep the active protocol tail verbatim.

## Test Strategy
- Unit tests:
  - assistant tool-use history serialization compacts large inputs
  - tool-result history serialization compacts large outputs while keeping failures diagnosable
- Integration tests:
  - raw-loop replay history for repeated `write_file` turns stores digests instead of full file bodies
  - large `run_command` output does not remain verbatim in later history
- E2E or smoke tests:
  - replay fixture for a write-heavy greenfield turn confirms bounded history size
- Edge-case coverage mapping:
  - multi-tool assistant turns
  - failed tool results
  - pathless tools
  - exact protocol tail preservation for the active exchange

## Rollout and Risk Mitigation
- Rollback strategy: keep history-safe serialization centralized so replay behavior can revert without changing live tool execution.
- Feature flags/toggles: none required; this is an internal runtime hardening change.
- Observability checks: logs or traces should make it obvious whether a replayed turn used a raw payload or a compact digest.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
