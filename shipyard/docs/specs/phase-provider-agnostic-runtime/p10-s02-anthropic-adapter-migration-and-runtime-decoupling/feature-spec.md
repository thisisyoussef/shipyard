# Feature Spec

## Metadata
- Story ID: P10-S02
- Story Title: Anthropic Adapter Migration and Runtime Decoupling
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 Provider-Agnostic Model Runtime, migration of the existing Anthropic path behind the new internal contract

## Problem Statement

Even with a provider-neutral contract in place, Shipyard still cannot be called model-agnostic until the existing Anthropic path actually consumes it. Today the shared runtime imports Anthropic message types directly and expects Anthropic tool-loop semantics in core engine files. That means the engine, subagents, and graph state still know too much about one provider. The first real migration story should move Anthropic behind an adapter boundary while preserving current behavior.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Keep one shared orchestration path while removing provider SDK types from that path.
- Objective 2: Prove the new abstraction works with the existing Anthropic provider before adding another provider.
- Objective 3: Preserve current Anthropic-backed behavior so later routing and OpenAI work start from a stable baseline.
- How this story or pack contributes to the overall objective set: This story converts the existing Anthropic runtime into the first `ModelAdapter` implementation and decouples the shared loop from Anthropic wire types.

## User Stories
- As the Shipyard runtime, I want Anthropic to be an adapter implementation so the shared loop, graph state, and helper subagents no longer depend on Anthropic SDK message types.
- As a Shipyard maintainer, I want the current Anthropic path to keep working after the abstraction lands so multi-provider work starts from a regression-tested baseline.

## Acceptance Criteria
- [ ] AC-1: Anthropic request assembly, response parsing, and client creation move behind a dedicated adapter module that implements the internal model contract.
- [ ] AC-2: `graph.ts`, `raw-loop.ts`, and shared engine/subagent code depend on provider-neutral turn types instead of Anthropic `MessageParam`, `ToolUseBlock`, or related SDK types.
- [ ] AC-3: Anthropic remains the default configured provider for current behavior unless later routing overrides are applied.
- [ ] AC-4: Shared tracing and runtime metadata record provider/model information without importing Anthropic-only types into core orchestration files.
- [ ] AC-5: Regression tests prove the Anthropic-backed loop still supports tool use, final-text completion, cancellation, and failure paths through the adapter boundary.

## Edge Cases
- Empty/null inputs: Anthropic still supports no-tool or no-history turns through the adapter.
- Boundary values: the loop still handles turns with zero or many tool calls up to the existing iteration cap.
- Invalid/malformed data: malformed Anthropic response blocks fail inside the adapter with actionable errors.
- Cancellation: cancellation during the Anthropic request still resolves as a shared cancelled outcome.

## Non-Functional Requirements
- Security: Anthropic key handling remains environment-based only.
- Performance: client creation, timeout, and retry defaults remain centralized and reusable.
- Observability: tracing metadata stays useful even after provider-specific details move behind the adapter.
- Reliability: shared loop semantics do not regress while provider-specific parsing moves into the adapter.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Provider/model routing across phases or subagents.
- OpenAI implementation.
- Broad suite-wide mock migration.

## Done Definition
- Anthropic becomes a `ModelAdapter` implementation rather than the shared runtime contract.
- Core engine files no longer require Anthropic SDK message types.
- Current Anthropic behavior still passes regression coverage through the new boundary.
