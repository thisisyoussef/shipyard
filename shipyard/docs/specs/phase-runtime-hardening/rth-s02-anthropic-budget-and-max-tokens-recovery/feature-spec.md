# Feature Spec

## Metadata
- Story ID: RTH-S02
- Story Title: Anthropic Budget and Max-Tokens Recovery
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening supplemental pack

## Problem Statement

Shipyard still uses Anthropic defaults that are too small for real code-writing loops: short request timeouts, a low `max_tokens` ceiling, and no explicit recovery path when Claude stops because it hit that output budget. Today, a long in-progress tool-writing turn can fail as a generic "no final text blocks" error even when the real problem is budget exhaustion.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Raise Anthropic request budgets to production-oriented levels for code-writing loops.
- Objective 2: Keep those budgets configurable by env or runtime options rather than burying them in code.
- Objective 3: Turn `stop_reason=max_tokens` into an explicit runtime condition with bounded recovery or a targeted error.
- How this story or pack contributes to the overall objective set: This story makes provider limits visible and recoverable so long-turn failures stop looking like mysterious raw-loop bugs.

## User Stories
- As a Shipyard operator, I want long code-writing turns to have realistic timeout and output budgets instead of failing mid-task.
- As a maintainer, I want `max_tokens` and timeout failures to show up as explicit runtime conditions so I can tell whether a session needs retry, higher budget, or a prompt fix.

## Acceptance Criteria
- [x] AC-1: Anthropic config exposes higher code-writing defaults for request timeout and `max_tokens`, and both remain overrideable via environment variables or runtime options.
- [x] AC-2: The raw loop handles `stop_reason === "max_tokens"` explicitly and never throws the generic "completed without any final text blocks" error for that case.
- [x] AC-3: Recoverable `max_tokens` exhaustion can trigger one bounded continuation or higher-budget retry path without re-executing already completed tool calls; non-recoverable cases raise a targeted budget-exhaustion error naming the stop reason.
- [x] AC-4: Timeout, cancellation, and budget-exhaustion failures are distinguished clearly in runtime summaries, logs, or trace metadata.
- [x] AC-5: Focused tests cover config resolution, `max_tokens` with partial text, `max_tokens` with no final text, and timeout override plumbing.

## Edge Cases
- `max_tokens` can happen after partial assistant text, after a partially planned tool turn, or inside a subagent loop.
- Invalid env overrides should fail clearly during config resolution rather than silently falling back to unsafe values.
- A bounded continuation must not duplicate already completed tool executions.
- Cancellation should remain distinct from timeout even if both arrive through provider request failure surfaces.

## Non-Functional Requirements
- Reliability: recovery logic must never cause duplicate tool execution or ambiguous final state.
- Performance: larger defaults should improve successful completion rates without creating unbounded retries.
- Maintainability: Anthropic budget behavior should stay centralized in the provider/runtime layer.
- Observability: stop reason, configured budget, and retry decision should be inspectable after a failure.

## Out of Scope
- Swapping model providers or changing the default model family.
- Infinite or silent auto-retry behavior.
- A full token-estimation system for every request.

## Done Definition
- Shipyard can survive realistic long-writing Anthropic turns with configurable budgets, and budget exhaustion is no longer surfaced as an opaque generic runtime error.

## Implementation Evidence

### Code References
- `shipyard/src/engine/anthropic.ts`
- `shipyard/src/engine/turn.ts`
- `shipyard/tests/anthropic-contract.test.ts`
- `shipyard/tests/raw-loop.test.ts`
- `shipyard/tests/turn-runtime.test.ts`
- `shipyard/tests/manual/README.md`

### Representative Snippets
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

```ts
expect(capturedTraceMetadata).toEqual(
  expect.objectContaining({
    turnStatus: "error",
    runtimeFailureKind: failureCase.expectedKind,
    runtimeFailureStopReason: failureCase.expectedStopReason,
  }),
);
```

## Validation Evidence
- Focused: `pnpm exec vitest run tests/anthropic-contract.test.ts tests/raw-loop.test.ts tests/turn-runtime.test.ts`
- Full validation:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check`
- LangSmith / Monitoring:
  - Happy-path graph trace: `019d29b5-1c46-7000-8000-0050293db451`
  - Happy-path fallback trace: `019d29b5-5924-7000-8000-00b9bf66ae2b`
  - Budget-exhaustion fallback trace: `019d29b6-5634-7000-8000-0490382ca6bf`
  - Recent error review showed the expected `shipyard.raw-tool-loop` `ModelOutputBudgetExceededError` child run for the forced-budget scenario and no unexpected fresh errors.
  - `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned `null`.
