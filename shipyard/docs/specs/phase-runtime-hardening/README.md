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
6. Keep tiny targeted UI and copy edits on the cheapest safe lane by replacing repeated raw-loop and verifier hops with one bounded edit pass plus deterministic verification.

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
| RTH-S06 | Direct-Edit Fast Path and Deterministic Verification | Collapse tiny targeted UI/copy edits into one bounded edit pass, deterministic verification, and cheaper trace lookup so the lightweight lane stays fast in practice. | RTH-S03, Phase 7 routing/verification implementation |

## Sequencing Rationale

- `RTH-S01` lands first because history compaction and session-budget caps remove the main source of self-inflicted prompt growth.
- `RTH-S02` follows because budget recovery is most useful once request size is already under control and measurable.
- `RTH-S03` then retunes the coordinator and subagent surfaces around the stabilized loop, preserving the lightweight path for same-session continuations.
- `RTH-S04` is intentionally narrow and can land in parallel, but it is included in the pack because it removes a repeated early-turn waste case from the same user journey.
- `RTH-S05` closes the pack by proving the fixed runtime survives the long-write and follow-up scenarios that motivated the pack.
- `RTH-S06` follows the smoke and routing hardening because the fresh traces exposed a smaller but still painful latency cliff on tiny direct edits; it sharpens the already-shipped lightweight lane without reopening the broader architecture pack.

## Whole-Pack Success Signal

- Shipyard no longer replays full historical `write_file` bodies forever during long tool loops.
- Anthropic timeouts and token budgets are high enough for serious code-writing turns, and exhaustion is surfaced as a precise runtime condition instead of a confusing generic failure.
- Follow-up turns against a target Shipyard just scaffolded or edited stay on the cheap, visible path unless the runtime has a concrete reason to escalate into explorer or planner.
- Empty targets seeded only with `AGENTS.md` or `README.md` bootstrap in one step instead of burning an extra turn.
- The opt-in live smoke can reproduce and guard the real failure mode: graph mode, large writes, and same-session follow-up continuation.
- Tiny targeted edits can finish through one bounded edit pass with deterministic verification and trace capture that does not dominate the wall-clock cost.

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
  - `shipyard/src/engine/turn.ts`
  - `shipyard/tests/anthropic-contract.test.ts`
  - `shipyard/tests/raw-loop.test.ts`
  - `shipyard/tests/turn-runtime.test.ts`
  - `shipyard/tests/manual/README.md`
  Representative Snippet:
  ```ts
  export const DEFAULT_ANTHROPIC_MAX_TOKENS = 12_288;
  export const DEFAULT_ANTHROPIC_TIMEOUT_MS = 600_000;
  ```
  ```ts
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    const timeoutMs = input.timeoutMs
      ?? resolveAnthropicRuntimeConfig({
        model: input.model,
        maxTokens: input.maxTokens,
        env: input.env,
      }).timeoutMs;

    throw new Error(
      `Anthropic API request timed out after ${String(timeoutMs)}ms during message creation. ` +
      "Set SHIPYARD_ANTHROPIC_TIMEOUT_MS to override the default timeout if needed.",
    );
  }
  ```
  Notes:
  - The Anthropic adapter now resolves env-aware default model and token budgets
    before raw-loop execution, so fallback mode no longer hard-codes `8192`
    when `SHIPYARD_ANTHROPIC_MAX_TOKENS` is configured.
  - Turn trace metadata now classifies timeout versus
    `budget_exhausted` failures so LangSmith finish checks can distinguish
    provider timeout from `stop_reason=max_tokens`.
  - Fresh LangSmith finish-check traces for this story:
    `019d29b5-1c46-7000-8000-0050293db451` (graph success),
    `019d29b5-5924-7000-8000-00b9bf66ae2b` (fallback success), and
    `019d29b6-5634-7000-8000-0490382ca6bf` (forced budget exhaustion with
    `runtimeFailureKind=budget_exhausted` on the outer instruction-turn trace).
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
- `RTH-S06` Direct-edit fast path and deterministic verification
  Code References:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/engine/live-verification.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - `shipyard/tests/graph-runtime.test.ts`
  - `shipyard/tests/live-verification.test.ts`
  - `shipyard/tests/langsmith-tracing.test.ts`
  - `shipyard/tests/turn-runtime.test.ts`
  Representative Snippet:
  ```ts
  const traceLookup = shouldUseFastInstructionTurnTraceLookup({
    phaseName: phase.name,
    runtimeMode: runtimeState.runtimeMode,
    instruction: options.instruction,
    sessionState: state,
    runtimeState,
    mergedInjectedContext,
    targetFilePaths,
    loadedHandoff,
  })
    ? FAST_TRACE_LOOKUP
    : undefined;
  ```
  Notes:
  - Fresh traces on 2026-03-26 now show the bounded direct-edit lane succeeding
    on a plain temp target with `actingMode=direct-edit` and
    `verificationMode=deterministic`.
  - Trace `019d2c2f-47fe-7000-8000-076c4a8df1a3` exposed the original non-git
    `git diff --stat` regression, trace `019d2c32-9e6c-7000-8000-01dcd5067c8c`
    confirmed the deterministic-verification fix, and trace
    `019d2c35-04d1-7000-8000-01e7551221de` confirmed the follow-up outer
    trace-lookup reduction that cut the same edit from about `8.4s` local wall
    time to about `4.4s`.
