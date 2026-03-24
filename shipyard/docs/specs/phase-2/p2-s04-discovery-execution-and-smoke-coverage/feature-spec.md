# Feature Spec

## Metadata
- Story ID: P2-S04
- Story Title: Discovery, Execution, and Smoke Coverage
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 2 Tools, steps 2.5 through 2.10

## Problem Statement

Phase 2 still needs the coordinator's read-only inspection and execution tools, and the pack needs a direct proof path outside the LLM loop. The current implementations are still early scaffolds: `list_files` is a flat glob listing, `search_files` uses `rg --json` rather than the requested grep-style output contract, `run_command` is unbounded in output and color handling, and `git_diff` lacks the staged/file-path contract. A direct smoke script closes the gap by exercising every tool without model involvement.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Finish the read-only discovery surface the coordinator will rely on next phase.
- Objective 2: Keep command execution bounded and readable so failures fit inside model context.
- Objective 3: Prove the whole tool pack works directly before it is wired into the LLM loop.
- How this story or pack contributes to the overall objective set: This story delivers the remaining tools and the pack's manual verification path.

## User Stories
- As the Shipyard coordinator, I want readable directory, search, command, and diff tools so I can inspect repo state and run targeted checks without flooding the model with noise.
- As a developer validating Phase 2, I want a direct smoke script that exercises every tool and its key failure modes outside the LLM loop.

## Acceptance Criteria
- [ ] AC-1: `list_files` accepts a relative path and optional depth, filters noisy and hidden entries, sorts directories before files, and returns a tree-style listing through `ToolResult.output`.
- [ ] AC-2: `search_files` accepts a search pattern plus optional file glob, converts matches to target-relative paths with line numbers and excerpts, caps results at 30 by default, and treats grep exit code `1` as a successful "no matches found" result.
- [ ] AC-3: `run_command` executes in the target directory, defaults to a 30-second timeout with a 120-second max, strips color by setting `FORCE_COLOR=0`, and clips combined output to 5000 characters while preserving exit code diagnostics.
- [ ] AC-4: `git_diff` supports `staged` and optional relative `path` inputs, returns `git diff` output through the shared command contract, and reports a helpful error when the target directory is not a git repo.
- [ ] AC-5: A direct smoke script creates a temp project and exercises the full scenario list from the prompt, including the `edit_block` failure cases, without going through the LLM loop.
- [ ] AC-6: The story closes with repo validation and a scoped commit of the Phase 2 tool work.

## Edge Cases
- Empty/null inputs: blank search pattern or command rejects before execution.
- Boundary values: `depth` defaults to `2` and caps at `4`; command timeouts cap at `120` seconds.
- Invalid/malformed data: a non-git directory returns a clear git-specific error.
- External-service failures: shell command failures return exit code plus combined output instead of throwing away diagnostics.

## Non-Functional Requirements
- Security: search and listing tools stay within the target directory and strip absolute paths from output.
- Performance: filtered listings and clipped command output stay token-aware.
- Observability: failure outputs remain specific enough to diagnose test or command failures.
- Reliability: the smoke script proves the key success and failure paths without model mediation.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Wiring the tools into live Anthropic calls.
- Converting the smoke script into a permanent CI gate unless it proves worth keeping.
- Adding deployment or release automation.

## Done Definition
- All remaining Phase 2 tools return the shared `ToolResult`.
- Read-only outputs are readable and bounded.
- The smoke script passes across the required scenario list.
- The pack is validated and ready for the next phase to consume.
