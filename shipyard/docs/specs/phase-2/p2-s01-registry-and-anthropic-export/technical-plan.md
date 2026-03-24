# Technical Plan

## Metadata
- Story ID: P2-S01
- Story Title: Registry and Anthropic Tool Export
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected: `shipyard/src/tools/registry.ts`, `shipyard/src/tools/index.ts`, `shipyard/src/phases/code/index.ts`, tool files under `shipyard/src/tools/`.
- Public interfaces/contracts:
  - `ToolResult = { success: boolean; output: string; error?: string }`
  - `ToolDefinition<Input> = { name; description; inputSchema; execute(input, targetDirectory) }`
  - Registry helpers for registration, lookup, and Anthropic projection
- Data flow summary: tool modules self-register on import, the barrel import loads them once, and the code phase asks the registry for the model-facing tool set by name.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - unify tool contracts
  - enforce safe file operations
  - finish read-only inspection and bounded command execution
- Story ordering rationale: this story lands first because every later story depends on the shared `ToolResult` and registration model.
- Gaps/overlap check: this story owns the contract and wiring only; it does not implement file, search, or command behavior.
- Whole-pack success signal: later stories can be added without changing how the coordinator discovers or exports tools.

## Architecture Decisions
- Decision: Replace the current class-based default registry with a module-level registry plus helper functions.
- Alternatives considered:
  - Keep the class and instantiate a singleton.
  - Keep direct imports in the code phase and generate Anthropic schemas separately.
- Rationale: A module-level registry matches the required self-registration flow and keeps runtime lookup and schema export in one place.

## Data Model / API Contracts
- Request shape:
  - `registerTool(definition: ToolDefinition): void`
  - `getTool(name: string): ToolDefinition | undefined`
  - `getTools(names: string[]): ToolDefinition[]`
  - `getAnthropicTools(names: string[]): Array<{ name; description; input_schema }>`
- Response shape:
  - Registry lookup returns definitions.
  - Anthropic export returns plain JSON-schema tool descriptors.
- Storage/index changes: a single in-memory `Map<string, ToolDefinition>`.

## Dependency Plan
- Existing dependencies used: built-in TypeScript/Node only.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: silent drift between tool filenames and model-facing names.
  - Mitigation: treat the runtime `name` as the source of truth and cover it with tests.

## Test Strategy
- Unit tests:
  - registration succeeds for unique tools
  - duplicate registration fails
  - lookup by name and list preserves requested order
  - Anthropic export projects `inputSchema` to `input_schema`
- Integration tests:
  - barrel import registers the full Phase 2 tool set
  - code phase can request tool definitions by name
- E2E or smoke tests: deferred to P2-S04's direct smoke script
- Edge-case coverage mapping:
  - empty name list
  - unknown tool name in a mixed request
  - duplicate module import behavior

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: revert registry helpers and temporarily restore direct code-phase imports.
- Feature flags/toggles: none.
- Observability checks: registry error messages should identify the tool name and operation.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/tooling.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
