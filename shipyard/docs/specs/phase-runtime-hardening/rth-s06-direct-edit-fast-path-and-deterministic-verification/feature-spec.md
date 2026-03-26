# Feature Spec

## Metadata
- Story ID: RTH-S06
- Story Title: Direct-Edit Fast Path and Deterministic Verification
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening supplemental pack

## Problem Statement

Shipyard now classifies tiny direct or targeted instructions earlier, but the
runtime still executes those edits through the same open-ended raw loop and
LLM-backed verifier it uses for heavier work. Fresh traces showed the result:
actual file and command tool time was negligible, yet a simple UI tweak still
paid for repeated model round-trips and slow trace URL lookup. The lightweight
lane therefore remains logically correct but operationally too expensive for
small targeted edits.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Collapse tiny targeted UI and copy edits into one bounded edit
  pass when Shipyard already has enough local evidence.
- Objective 2: Replace verifier-subagent work on that happy path with
  deterministic surgical verification and at most one cheap direct command.
- Objective 3: Keep trace capture useful without letting run-URL lookup dominate
  the wall-clock time of a tiny edit.
- How this story or pack contributes to the overall objective set: This story
  turns the lightweight lane from a logical routing choice into a genuinely fast
  runtime path.

## User Stories
- As a Shipyard operator, I want a tiny UI or copy tweak to finish quickly
  without paying for planner, raw-loop, and verifier overhead that only makes
  sense on broader work.
- As a maintainer, I want the fast lane to stay safe by proving a single
  surgical edit happened and by falling back cleanly when the runtime does not
  have enough confidence.

## Acceptance Criteria
- [x] AC-1: The graph can detect targeted UI or copy edits that are eligible for
  a direct-edit fast path while preserving the existing lightweight and
  planner-backed routes for everything else.
- [x] AC-2: The fast path gathers a bounded candidate file set, performs one
  structured model turn, and applies at most one `edit_block` while preserving
  checkpoint-before-edit behavior.
- [x] AC-3: The happy-path verifier uses deterministic surgical-edit checks plus
  at most one cheap direct command instead of the verifier subagent, and it
  falls back safely when deterministic evidence is unavailable.
- [x] AC-4: Harness route state and trace metadata show that the turn used the
  direct-edit acting mode and deterministic verification mode.
- [x] AC-5: LangSmith trace lookup uses a reduced retry budget for this lane so
  a missing run URL does not add several avoidable seconds to a tiny edit.
- [x] AC-6: Focused tests cover a targeted no-path UI tweak, a safe fallback
  back to raw-loop behavior, deterministic verification failures, and the fast
  trace lookup policy.

## Edge Cases
- A targeted request with no safe candidate file should fall back to the
  existing raw-loop path instead of guessing.
- A deterministic verification failure should still trigger the normal recovery
- and checkpoint flow after the edit is reverted.
- User-friendly values that are not valid target-language syntax may still
  require an explicit literal from the instruction; this story hardens the
  bounded execution path, not a full semantic-normalization layer.
- Trace URL lookup may still return `null`; that should remain an observability
  detail, not a runtime failure.

## Non-Functional Requirements
- Reliability: the fast path must remain bounded to one surgical edit and fail
  closed when evidence is ambiguous.
- Performance: tiny targeted edits should remove most sequential model hops on
  the happy path.
- Observability: traces must show when the direct-edit fast path and
  deterministic verification were used.
- Maintainability: the fallback path must keep using the existing raw-loop and
  verifier surfaces instead of creating a second general-purpose runtime.

## Out of Scope
- Replacing the raw loop for broad or multi-file code changes.
- Designing a general AST-aware editing engine.
- Reworking the full verification-plan type system beyond this targeted runtime
  hardening slice.

## Done Definition
- Tiny targeted edits can complete through one bounded edit pass and
  deterministic verification, with explicit fallback and trace evidence when the
  fast path is not safe to use.

## Implementation Evidence

### Code References

- `shipyard/src/agents/coordinator.ts`: `shouldCoordinatorUseDirectEditFastPath`
  now gates the narrow lane to tiny UI/copy edits only and rejects browser-eval,
  planner, explorer, or handoff-backed turns.
- `shipyard/src/engine/graph.ts`: `maybeRunDirectEditFastPath`,
  `runDirectEditVerification`, `defaultActingLoop`, and
  `shouldUseFastTraceLookupPolicy` add the bounded one-edit act path,
  deterministic verification, and reduced nested-runtime trace lookup.
- `shipyard/src/engine/turn.ts`: `shouldUseFastInstructionTurnTraceLookup`
  applies the same one-shot LangSmith lookup budget to the outer turn wrapper so
  tiny edits do not still pay the old retry loop.
- `shipyard/src/tracing/langsmith.ts`: `runWithLangSmithTrace` and
  `resolveLangSmithTraceReference` now honor per-call trace lookup budgets.
- `shipyard/tests/graph-runtime.test.ts`,
  `shipyard/tests/live-verification.test.ts`,
  `shipyard/tests/langsmith-tracing.test.ts`, and
  `shipyard/tests/turn-runtime.test.ts` lock the routing, verification, and
  trace-lookup behavior in place.

### Representative Snippets

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

### Notes

- This story is driven by fresh direct-edit traces collected on 2026-03-26 that
  showed tool execution was effectively free while repeated model hops and trace
  URL lookup still dominated the runtime.

## Validation Evidence

- Focused coverage passed with
  `pnpm --dir shipyard exec vitest run tests/turn-runtime.test.ts tests/graph-runtime.test.ts tests/live-verification.test.ts tests/langsmith-tracing.test.ts`.
- Full repo validation passed with `pnpm --dir shipyard test`,
  `pnpm --dir shipyard typecheck`, `pnpm --dir shipyard build`, and
  `git diff --check`.

## LangSmith / Monitoring

- Pre-fix direct-edit trace `019d2c2f-47fe-7000-8000-076c4a8df1a3` showed the
  non-git verification regression: the lane attempted `git diff --stat`,
  restored the checkpoint, then blocked `styles.css`.
- After the non-git verification fix, trace
  `019d2c32-9e6c-7000-8000-01dcd5067c8c` succeeded on a plain temp target with
  `selectedPath=lightweight`, `actingMode=direct-edit`,
  `taskComplexity=direct`, and `verificationMode=deterministic`.
- After the outer turn trace-lookup fix, trace
  `019d2c35-04d1-7000-8000-01e7551221de` stayed on the same direct-edit lane,
  completed successfully, and reduced the local end-to-end
  `executeInstructionTurn` wall time for the same CSS edit from about `8.4s` to
  about `4.4s`.
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 20 --error --limit 5 --full`
  returned `[]` after the final proof run.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null` after the final proof run.
