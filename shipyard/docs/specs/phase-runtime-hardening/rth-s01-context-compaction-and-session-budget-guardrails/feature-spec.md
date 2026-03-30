# Feature Spec

## Metadata
- Story ID: RTH-S01
- Story Title: Context Compaction and Session Budget Guardrails
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening supplemental pack

## Problem Statement

Shipyard's long-running tool loops currently replay full prior `tool_use` and `tool_result` payloads back to Anthropic on every request. That is especially expensive when `write_file` calls contain full file bodies. At the same time, rolling summaries and serialized session history can admit single oversized instruction lines that then get injected into every later turn. The result is prompt growth that compounds with each follow-up turn and causes the runtime to spend budget on stale history instead of the current task.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Stop replaying unbounded historical tool payloads once their effects are already durable on disk.
- Objective 2: Bound rolling-summary and serialized-session history so one oversized turn cannot dominate later prompts.
- Objective 3: Preserve enough compact state to continue safely without relying on raw historical payloads.
- How this story or pack contributes to the overall objective set: This story removes the primary source of self-inflicted context bloat so later budget, routing, and smoke work can measure real behavior instead of prompt-growth noise.

## User Stories
- As a Shipyard runtime, I want stale completed tool turns compacted so long sessions remain usable after many file writes.
- As an operator sending a follow-up request, I want the next prompt to contain the facts that matter, not full historical file bodies and oversized instruction echoes.

## Acceptance Criteria
- [ ] AC-1: Before each new Anthropic request, completed tool cycles older than a configurable freshness window can be compacted into a bounded summary state instead of replaying raw `tool_use` and `tool_result` payloads verbatim.
- [ ] AC-2: Compacted history preserves at least the tool name, target path or paths, success/failure, concise output preview, and a signal that edited files can be re-read from disk; any still-open tool cycle stays verbatim until protocol continuity is complete.
- [ ] AC-3: `updateRollingSummary()` truncates both instruction text and summary text before storage and enforces a total character budget instead of only keeping the last eight newline-delimited records.
- [ ] AC-4: `serializeContextEnvelope()` applies explicit per-section and total-size budgets to session/runtime history and marks truncated or compacted sections clearly.
- [ ] AC-5: Focused tests cover repeated `write_file` and `edit_block` turns and prove request history stays bounded across follow-up turns.

## Edge Cases
- The active or immediately preceding tool-use cycle must stay verbatim if the provider still needs that exact protocol history.
- If a compacted file is later deleted or changed externally, the runtime should fall back to re-reading it instead of trusting stale compacted text.
- Failed tool turns must retain concise error evidence even when their full payloads are compacted away.
- A single huge instruction line should no longer dominate the entire rolling summary budget.
- Existing handoff artifacts should continue to work without duplicating another free-form long-run memory channel.

## Non-Functional Requirements
- Reliability: compaction must not corrupt tool-use protocol continuity or drop still-needed context.
- Performance: history growth should flatten after compaction thresholds instead of rising linearly with file body size.
- Maintainability: reuse existing handoff and recent-output patterns rather than inventing a second ad hoc memory system.
- Observability: compaction and truncation events should be inspectable in logs or trace metadata.

## Out of Scope
- Provider-side compaction or prompt caching as the only solution.
- Rewriting the file-creation contract away from `write_file`.
- A full multi-session memory redesign beyond bounded turn/session history.

## Done Definition
- Shipyard can sustain long write-heavy sessions without replaying unbounded historical payloads or injecting oversized rolling summaries into every future turn.

## Implementation Evidence

### Code References

- [`../../../../src/engine/history-compaction.ts`](../../../../src/engine/history-compaction.ts):
  raises the compaction budgets and summarizes older `write_file`,
  `edit_block`, and `bootstrap_target` turns with path, line-count, and preview
  metadata instead of replaying large payloads forever.
- [`../../../../src/ui/workbench-state.ts`](../../../../src/ui/workbench-state.ts):
  now compacts persisted browser workbench snapshots by bounding saved turns,
  file events, activity payloads, agent messages, and preview blobs before a
  long-running UI session is written back to disk.
- [`../../../../src/engine/state.ts`](../../../../src/engine/state.ts):
  applies the persisted-workbench compactor on save/load and clears stale
  runtime-only error, preview, and pending-tool state so restarted runtimes do
  not resurrect a dead browser session verbatim.
- [`../../../../src/mission-control/recovery.ts`](../../../../src/mission-control/recovery.ts)
  and [`../../../../scripts/ultimate-mission-control.ts`](../../../../scripts/ultimate-mission-control.ts):
  restore the newest backed-up session JSON and matching handoff before a fresh
  runtime launch, so long-run missions recover onto a compacted, resumable
  session artifact instead of recreating the dead state or starting blank.
- [`../../../../src/engine/raw-loop.ts`](../../../../src/engine/raw-loop.ts):
  preserves structured tool execution data so history compaction can emit
  useful compact summaries without depending on raw historical file bodies.
- [`../../../../tests/history-compaction.test.ts`](../../../../tests/history-compaction.test.ts)
  , [`../../../../tests/raw-loop.test.ts`](../../../../tests/raw-loop.test.ts),
  [`../../../../tests/session-state-compaction.test.ts`](../../../../tests/session-state-compaction.test.ts),
  and [`../../../../tests/mission-control-recovery.test.ts`](../../../../tests/mission-control-recovery.test.ts):
  cover bounded compaction behavior for large write-heavy turns and keep the
  raw-loop and persisted-session contracts aligned with the compacted history
  format.

### Representative Snippets

```ts
const RAW_LOOP_MESSAGE_HISTORY_CHAR_BUDGET = 24_000;
const RAW_LOOP_COMPACTION_SUMMARY_CHAR_BUDGET = 4_200;
```

```ts
if (toolName === "write_file") {
  return {
    path: normalizePath(input.path),
    lineCount,
    preview,
  };
}
```

```ts
state.workbenchState = compactWorkbenchStateForPersistence(
  state.workbenchState,
);
```

```ts
if (recovery.restoredSession && recovery.sessionBackupFile) {
  logger.log(
    `Restored mission session from backup ${recovery.sessionBackupFile} before runtime launch.`,
  );
}
```
