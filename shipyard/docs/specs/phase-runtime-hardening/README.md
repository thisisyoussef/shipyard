# Phase Runtime Hardening: Supplemental Story Pack

- Pack: Runtime Hardening (Supplemental)
- Estimate: 8-12 hours
- Date: 2026-03-26
- Status: Partially implemented; fresh LangSmith finish-check passed on 2026-03-26

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
  - `shipyard/tests/history-compaction.test.ts`
  - `shipyard/tests/raw-loop.test.ts`
  Representative Snippet:
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
- `RTH-S02` Anthropic budget defaults and `max_tokens` recovery
  Code References:
  - `shipyard/src/engine/anthropic.ts`
  Representative Snippet:
  ```ts
  // No new code landed in this patch.
  ```
  Notes:
  - The live finish check exercised the existing `maxTokens=8192` and
    `timeoutMs=120000` defaults already present on `main`.
- `RTH-S03` Continuation-aware routing and subagent visibility
  Code References:
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/artifacts/handoff.ts`
  - `shipyard/src/phases/code/prompts.ts`
  - `shipyard/tests/graph-runtime.test.ts`
  - `shipyard/tests/handoff-artifacts.test.ts`
  Representative Snippet:
  ```ts
  if (loopResult.status === "limit_reached") {
    return {
      status: "responding",
      response: loopResult.finalText,
      touchedFiles: loopResult.touchedFiles,
    };
  }
  ```
  ```ts
  touchedFiles: finalState.touchedFiles ?? [],
  ```
  Notes:
  - This patch landed continuation-aware touched-file carry-forward plus the
    resumable iteration-threshold path.
  - Subagent visibility plumbing remains follow-up work.
- `RTH-S04` Bootstrap seed-doc allowlist alignment
  Code References:
  - `shipyard/src/context/discovery.ts`
  - `shipyard/src/tools/target-manager/bootstrap-target.ts`
  - `shipyard/tests/discovery.test.ts`
  Representative Snippet:
  ```ts
  const BOOTSTRAP_SAFE_TOP_LEVEL_FILES = new Set(["AGENTS.md"]);
  ```
  Notes:
  - `bootstrap_target` already accepted `AGENTS.md` and `README.md`; this patch
    aligned discovery so those same near-empty targets still route as
    greenfield/bootstrap-ready.
- `RTH-S05` Graph-aware long-run live smoke
  Code References:
  - `shipyard/tests/manual/phase3-live-loop-smoke.ts`
  - `shipyard/tests/manual/phase4-langsmith-mvp.ts`
  Representative Snippet:
  ```ts
  // No new smoke code landed in this patch.
  ```
  Notes:
  - The existing live smoke passed on 2026-03-26 with fresh graph-mode,
    large-write, same-session follow-up traces:
    `019d2844-0be8-7000-8000-05343b525e1d`,
    `019d2845-b0c3-7000-8000-0409f9d6db2f`,
    `019d2847-1989-7000-8000-0661c83e9d63`,
    and `019d2847-589f-7000-8000-0442fef4e057`.
