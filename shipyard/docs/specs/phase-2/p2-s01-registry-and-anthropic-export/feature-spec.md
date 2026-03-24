# Feature Spec

## Metadata
- Story ID: P2-S01
- Story Title: Registry and Anthropic Tool Export
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 2 Tools, steps 2.1 and 2.9

## Problem Statement

Shipyard's current tool layer is still scaffolded around direct imports and ad hoc runtime objects. Phase 2 needs one canonical registry contract that both runtime lookup and Anthropic tool-schema generation can share, otherwise the next phase will wire the LLM to stale or duplicated tool definitions.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Establish one shared tool contract for runtime execution and model-facing schema export.
- Objective 2: Force all tool behavior to stay target-relative and safe by building on the same registry and result contract.
- Objective 3: Keep the pack implementation cohesive so later stories consume the registry instead of inventing their own wiring.
- How this story or pack contributes to the overall objective set: This story defines the contract every later Phase 2 story must implement.

## User Stories
- As the Shipyard coordinator, I want to look up tools by name and emit Anthropic-ready tool definitions from the same registry so runtime execution and model prompts cannot drift apart.

## Acceptance Criteria
- [ ] AC-1: `ToolDefinition` includes `name`, `description`, `inputSchema`, and `execute(input, targetDirectory)` returning a shared `ToolResult`.
- [ ] AC-2: `src/tools/registry.ts` exposes `registerTool`, `getTool`, `getTools`, and `getAnthropicTools` backed by a `Map<string, ToolDefinition>`.
- [ ] AC-3: Each tool module registers itself at module scope, and `src/tools/index.ts` becomes the single barrel import that registers the full tool surface.
- [ ] AC-4: The code phase consumes the registry/barrel output rather than hand-importing individual tool definitions.
- [ ] AC-5: Model-facing tool names use the prompt's snake_case identifiers even if source filenames stay kebab-case for repo consistency.

## Edge Cases
- Empty/null inputs: Reject blank tool names and malformed `inputSchema` values during registration.
- Boundary values: `getTools([])` returns an empty array without throwing.
- Invalid/malformed data: Duplicate registration fails with a clear error naming the conflicting tool.
- External-service failures: None in this story.

## Non-Functional Requirements
- Security: Registry output must never include absolute file paths or target-directory state.
- Performance: Tool lookup remains constant-time by name.
- Observability: Registry errors should mention the tool name and failed operation.
- Reliability: Anthropic tool export must be deterministic for the same input list.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Implementing the tool logic itself.
- Wiring the LLM request/response loop.
- Adding provider SDK dependencies.

## Done Definition
- Registry helpers and barrel import are defined.
- Existing code-phase wiring is updated to consume the new registry path.
- Focused tests cover registration, duplicate handling, lookup, and Anthropic export.
