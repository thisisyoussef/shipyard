# Phase Runtime Hardening: Supplemental Story Pack

- Pack: Runtime Hardening (Supplemental)
- Estimate: 8-12 hours
- Date: 2026-03-26
- Status: Implemented on branch; live LangSmith finish-check pending provider credentials

## Pack Objectives

1. Keep long-running code-writing sessions bounded by compacting stale tool history and oversized session summaries before they poison future turns.
2. Raise Anthropic request budgets to production-friendly levels and make budget exhaustion explicit, diagnosable, and recoverable.
3. Keep same-session follow-up work on the lightweight path whenever recent edits already identify the target files, while surfacing any subagent work that still occurs.
4. Remove avoidable greenfield bootstrap friction for near-empty targets seeded only with operator docs.
5. Replace the tiny live smoke with a graph-aware, large-write, follow-up-capable runtime regression.

## Shared Constraints

- This pack is supplemental hardening. It should reinforce the shipped runtime rather than replace the current coordinator, tool registry, or session model.
- The coordinator remains the only writer.
- Long-run state should prefer compact summaries or typed artifacts over replaying raw historical payloads.
- Provider budgets must stay configurable by env or runtime options; larger defaults cannot become hidden magic numbers.
- Same-session continuations should prefer the lightweight path when recent local evidence already identifies the working set.
- Live Anthropic smoke coverage remains opt-in/manual, but it must validate the actual graph and follow-up paths that have been failing in practice.
- Any stress or smoke addition should leave behind artifacts or logs that explain whether a failure came from context growth, routing, or provider limits.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| RTH-S01 | Context Compaction and Session Budget Guardrails | Stop replaying unbounded historical tool payloads and cap oversized rolling/session summaries before they bloat future prompts. | Phase 3/4/7/8 implementation |
| RTH-S02 | Anthropic Budget and Max-Tokens Recovery | Raise provider budgets, make them configurable, and replace opaque `max_tokens` failures with explicit recovery or targeted errors. | RTH-S01 |
| RTH-S03 | Continuation-Aware Routing and Subagent Visibility | Keep same-session follow-ups on the lightweight path when recent edits already identify the target files, and surface subagent activity when heavy routing still occurs. | RTH-S01, RTH-S02, Phase 6/7/8 implementation |
| RTH-S04 | Bootstrap Safe-File Allowlist Alignment | Let `bootstrap_target` treat `AGENTS.md` and `README.md` as seed files instead of rejecting otherwise empty targets. | Phase 8 `P8-S04` implementation |
| RTH-S05 | Long-Run Graph and Follow-Up Smoke Coverage | Replace the tiny raw-loop smoke with a graph-aware, large-write, follow-up regression that reproduces the observed failure class. | RTH-S01, RTH-S02, RTH-S03, RTH-S04 |

## Sequencing Rationale

- `RTH-S01` lands first because history compaction and session-budget caps remove the main source of self-inflicted prompt growth.
- `RTH-S02` follows because budget recovery is most useful once request size is already under control and measurable.
- `RTH-S03` then retunes the coordinator and subagent surfaces around the stabilized loop, preserving the lightweight path for same-session continuations.
- `RTH-S04` is intentionally narrow and can land in parallel, but it is included in the pack because it removes a repeated early-turn waste case from the same user journey.
- `RTH-S05` closes the pack by proving the fixed runtime survives the long-write and follow-up scenarios that motivated the pack.

## Whole-Pack Success Signal

- Shipyard no longer replays full historical `write_file` bodies forever during long tool loops.
- Anthropic timeouts and token budgets are high enough for serious code-writing turns, and exhaustion is surfaced as a precise runtime condition instead of a confusing generic failure.
- Follow-up turns against a target Shipyard just scaffolded or edited stay on the cheap, visible path unless the runtime has a concrete reason to escalate into explorer or planner.
- Empty targets seeded only with `AGENTS.md` or `README.md` bootstrap in one step instead of burning an extra turn.
- The opt-in live smoke can reproduce and guard the real failure mode: graph mode, large writes, and same-session follow-up continuation.

## Implementation Evidence

- `RTH-S01` Context compaction and prompt budgets
  Code References:
  - `shipyard/src/engine/history-compaction.ts`
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/context/envelope.ts`
  - `shipyard/src/engine/turn-summary.ts`
  Representative Snippet:
  ```ts
  const requestHistory = buildCompactedMessageHistory({
    initialUserMessage,
    completedTurns: completedToolTurns,
  });
  ```
- `RTH-S02` Anthropic budget defaults and `max_tokens` recovery
  Code References:
  - `shipyard/src/engine/anthropic.ts`
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/tests/anthropic-contract.test.ts`
  - `shipyard/tests/raw-loop.test.ts`
  Representative Snippet:
  ```ts
  if (assistantMessage.stop_reason === "max_tokens") {
    // retry with a higher max_tokens budget before failing closed
  }
  ```
- `RTH-S03` Continuation-aware routing and subagent visibility
  Code References:
  - `shipyard/src/engine/state.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/tests/turn-runtime.test.ts`
  - `shipyard/tests/ui-runtime.test.ts`
  Representative Snippet:
  ```ts
  if (context.toolExecution.editedPath) {
    rememberRecentFilePath(sessionState.recentTouchedFiles, context.toolExecution.editedPath);
  }
  ```
- `RTH-S04` Bootstrap seed-doc allowlist alignment
  Code References:
  - `shipyard/src/tools/target-manager/bootstrap-target.ts`
  - `shipyard/tests/scaffold-bootstrap.test.ts`
  Representative Snippet:
  ```ts
  allowedExistingEntries: [".shipyard", ".git", "AGENTS.md", "README.md"],
  ```
- `RTH-S05` Graph-aware long-run live smoke
  Code References:
  - `shipyard/tests/manual/phase3-live-loop-smoke.ts`
  - `shipyard/tests/manual/README.md`
  Representative Snippet:
  ```ts
  const followUpTurn = await executeInstructionTurn({
    sessionState,
    runtimeState,
    instruction: FOLLOW_UP_CONTINUATION_INSTRUCTION,
  });
  ```
