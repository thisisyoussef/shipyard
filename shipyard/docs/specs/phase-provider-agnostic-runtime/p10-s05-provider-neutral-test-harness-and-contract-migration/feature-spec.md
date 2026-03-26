# Feature Spec

## Metadata
- Story ID: P10-S05
- Story Title: Provider-Neutral Test Harness and Contract Migration
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 Provider-Agnostic Model Runtime, broad regression migration after both provider adapters exist

## Problem Statement

Even if the runtime becomes provider-agnostic in production code, Shipyard will stay operationally Anthropic-shaped if the test suite keeps mocking Anthropic SDK requests and response blocks throughout graph, raw loop, turn, subagent, target-manager, and UI runtime tests. The broad suite currently encodes provider wire types as if they were the runtime contract. To make the architecture durable, most tests need to mock the internal adapter boundary instead, with only small focused suites remaining provider-specific.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Move broad runtime and UI tests to provider-neutral fake adapters.
- Objective 2: Keep provider-specific contract tests small, focused, and isolated to adapter coverage.
- Objective 3: Reduce the blast radius of future provider changes across the repo.
- How this story or pack contributes to the overall objective set: This story makes the new provider-neutral architecture durable by aligning the test suite with the runtime boundary.

## User Stories
- As a Shipyard maintainer, I want most tests to depend on fake `ModelAdapter` behavior so changing or adding providers does not require broad Anthropic-specific fixture rewrites.
- As a Shipyard reviewer, I want provider-specific wire-format tests to stay focused so regressions are easier to localize.

## Acceptance Criteria
- [x] AC-1: Add shared provider-neutral fake adapter helpers for runtime and UI tests.
- [x] AC-2: Core engine, subagent, target-manager, plan-mode, and UI runtime tests mock the internal adapter boundary instead of Anthropic SDK request/response types.
- [x] AC-3: Focused provider contract suites remain for Anthropic and OpenAI request/response translation, but broad shared-runtime tests no longer import provider SDK wire types.
- [x] AC-4: The broad test suite still covers tool-use turns, final-text turns, cancellation, verification, target enrichment, and UI runtime behavior through the provider-neutral test seam.
- [x] AC-5: Repo docs or test helper guidance reference the new adapter-based test seam so future tests do not reintroduce provider-specific coupling.

## Edge Cases
- Empty/null inputs: fake adapters can represent no-tool and no-history turns cleanly.
- Boundary values: fake adapters can emit multiple tool calls, failures, and cancellations without requiring provider wire objects.
- Invalid/malformed data: fake adapters can simulate malformed normalized results directly for shared-runtime tests.
- Compatibility: focused provider contract tests still assert Anthropic and OpenAI translation details where they actually matter.

## Non-Functional Requirements
- Security: test fixtures must not require live credentials.
- Performance: broad tests should become simpler and faster once they mock the adapter contract rather than wire-format details.
- Observability: test helpers should make it obvious whether a failure is in shared runtime behavior or in a provider adapter contract suite.
- Reliability: the suite should preserve current behavioral coverage while reducing provider-specific fixture duplication.

## UI Requirements (if applicable)
- Required states: Existing UI runtime and workbench-state coverage should remain intact through adapter-based seams.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Adding new runtime features beyond the provider abstraction.
- User-facing provider-selection UI.
- Deleting all provider-specific tests; focused adapter contract tests remain in scope.

## Done Definition
- Broad runtime tests use provider-neutral fake adapters.
- Provider-specific wire-format tests are isolated to focused adapter suites.
- Future provider work can extend the test helpers without editing the whole runtime suite.

## Implementation Evidence
- Shared fake adapter helpers landed in
  [`../../../../tests/support/fake-model-adapter.ts`](../../../../tests/support/fake-model-adapter.ts)
  and focused helper coverage landed in
  [`../../../../tests/fake-model-adapter.test.ts`](../../../../tests/fake-model-adapter.test.ts).
- Broad runtime and subagent suites now inject provider-neutral adapters in
  [`../../../../tests/raw-loop.test.ts`](../../../../tests/raw-loop.test.ts),
  [`../../../../tests/turn-runtime.test.ts`](../../../../tests/turn-runtime.test.ts),
  [`../../../../tests/graph-runtime.test.ts`](../../../../tests/graph-runtime.test.ts),
  [`../../../../tests/planner-subagent.test.ts`](../../../../tests/planner-subagent.test.ts),
  [`../../../../tests/explorer-subagent.test.ts`](../../../../tests/explorer-subagent.test.ts),
  [`../../../../tests/verifier-subagent.test.ts`](../../../../tests/verifier-subagent.test.ts),
  [`../../../../tests/plan-mode.test.ts`](../../../../tests/plan-mode.test.ts),
  and [`../../../../tests/ui-runtime.test.ts`](../../../../tests/ui-runtime.test.ts).
- The local preview smoke helper now uses the same seam in
  [`../../../../tests/manual/phase5-local-preview-smoke.ts`](../../../../tests/manual/phase5-local-preview-smoke.ts).
- Guardrail coverage and guidance landed in
  [`../../../../tests/provider-neutral-harness.test.ts`](../../../../tests/provider-neutral-harness.test.ts)
  and [`../../../../tests/README.md`](../../../../tests/README.md).

## Validation Evidence
- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- `git diff --check`
