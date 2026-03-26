# Feature Spec

## Metadata
- Story ID: P10-S01
- Story Title: Internal Model Adapter Contract and Neutral Tool Projection
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 Provider-Agnostic Model Runtime, foundation for all later provider-routing stories

## Problem Statement

Shipyard's outer architecture is already modular around phases, tool definitions, context envelopes, and session persistence, but the runtime still lacks one internal provider contract. The shared tool registry exports Anthropic-shaped tool descriptors, and the loop-facing types the engine needs are defined in provider-specific modules instead of in Shipyard's own runtime boundary. Before Anthropic can move behind an adapter and before OpenAI can be added cleanly, the repo needs one internal contract for turn messages, tool calls, tool-call results, and model turn results.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Replace provider-specific runtime protocol types with Shipyard-owned internal contracts.
- Objective 2: Keep tool definitions provider-neutral while letting adapters project them into provider wire formats.
- Objective 3: Make later provider routing and OpenAI work depend on one shared abstraction boundary instead of transitional shims.
- How this story or pack contributes to the overall objective set: This story establishes the internal model contract and removes Anthropic-only tool projection from the registry so all later stories can build on one stable interface.

## User Stories
- As the Shipyard runtime, I want one provider-neutral adapter contract so graph execution, raw tool iteration, and helper subagents can share the same types regardless of which provider is active.
- As a Shipyard maintainer, I want the tool registry to stay generic so new providers do not require tool contract edits in core registry code.

## Acceptance Criteria
- [x] AC-1: Add Shipyard-owned internal types/interfaces for model turns, including equivalents of `TurnMessage`, `ToolCall`, `ToolCallResult`, `ModelTurnResult`, and `ModelAdapter`.
- [x] AC-2: The tool registry continues to own only generic `ToolDefinition` metadata and execution behavior; it no longer exports Anthropic-specific tool descriptor types or helpers.
- [x] AC-3: Provider adapters receive generic tool definitions and are responsible for projecting them into provider-specific wire formats.
- [x] AC-4: Focused tests cover the new internal contract helpers and prove provider-side tool projection can consume registered tools without changing registry semantics.
- [x] AC-5: No core registry code imports or exposes provider-specific message or tool wire types after this story lands.

## Edge Cases
- Empty/null inputs: providers with no available tools still receive a valid turn request through the internal contract.
- Boundary values: empty prior-message history is allowed for single-turn requests.
- Invalid/malformed data: malformed tool results or provider projections fail clearly before a live network request is attempted.
- Compatibility: existing tool names, descriptions, and JSON-schema input definitions remain unchanged.

## Non-Functional Requirements
- Security: no credential handling changes in this story.
- Performance: provider projection should remain synchronous and cheap relative to network calls.
- Observability: the internal contract should be serializable enough for tracing and test snapshots.
- Reliability: the abstraction must preserve the exact tool metadata later adapters need, including descriptions and input schema.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Migrating the Anthropic runtime to the new adapter boundary.
- Adding OpenAI support.
- Phase-level or subagent-level provider/model routing.

## Done Definition
- The repo has one Shipyard-owned model adapter contract under `src/engine/`.
- The tool registry is provider-neutral again.
- Later provider adapters can project tools without editing registry code.
- Focused tests prove the new contract and tool-projection boundary.
