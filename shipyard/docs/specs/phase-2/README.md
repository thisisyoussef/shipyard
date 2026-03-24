# Phase 2: Tools Story Pack

- Pack: Phase 2 Tools
- Estimate: 2-3 hours
- Date: 2026-03-24
- Status: Drafted for implementation

## Pack Objectives

1. Replace the current hardwired tool registry with a self-registering contract that can expose Anthropic-ready tool definitions.
2. Enforce safe, target-relative file access and anchor-based editing so Shipyard behaves like a surgical coding agent rather than a whole-file generator.
3. Finish the read-only workspace inspection and command tools with bounded output, useful error handling, and a direct smoke path outside the LLM loop.

## Shared Constraints

- Product code and product docs stay under `shipyard/`; `.ai/` remains helper-only.
- Tool files can keep the repo's kebab-case filename convention, but model-facing tool names should use the prompt's snake_case identifiers.
- `ToolResult` stays fixed at `success`, `output`, and optional `error`; Phase 2 does not add tool-specific top-level payload fields.
- No tool should expose absolute paths in model-facing output.
- LLM wiring is explicitly out of scope for this pack; the next phase will consume these tools.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P2-S01 | Registry and Anthropic Tool Export | Define the shared tool contract, self-registration flow, and model-facing schema projection. | none |
| P2-S02 | Safe Relative File IO | Implement `read_file` and `write_file` around shared path and hash tracking primitives. | P2-S01 |
| P2-S03 | Surgical `edit_block` Guardrails | Enforce stale-read detection, anchor disambiguation, and diff-size guardrails. | P2-S02 |
| P2-S04 | Discovery, Execution, and Smoke Coverage | Finish `list_files`, `search_files`, `run_command`, `git_diff`, and the direct tool smoke script. | P2-S01 |

## Sequencing Rationale

- `P2-S01` changes the shared contract every tool has to satisfy, so it lands first.
- `P2-S02` introduces the target-relative resolver and read-hash map that `edit_block` depends on.
- `P2-S03` gets its own story because it carries the pack's highest-risk behavior and most detailed guardrails.
- `P2-S04` can implement the remaining read-only tools once the registry contract is stable, then closes the pack with the manual smoke script and final validation.

## Whole-Pack Success Signal

- All tool files register themselves through the barrel import.
- File operations reject escapes and large rewrites by default.
- Search and command tools stay bounded, relative, and readable for the coordinator.
- A direct smoke script proves the happy path and the critical guardrail failures before the pack is committed.
