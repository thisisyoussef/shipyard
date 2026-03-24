# Phase 3: Wire Tools To Claude Story Pack

- Pack: Phase 3 Wire Tools To Claude
- Estimate: 1-2 hours
- Date: 2026-03-24
- Status: Drafted for implementation

## Pack Objectives

1. Prove the Claude-to-tool pipeline works end to end without LangGraph or other orchestration layers hiding failures.
2. Preserve the surgical-editing guarantees from Phase 2 when the live model is choosing tools autonomously.
3. Keep the first live Claude loop observable, bounded, and easy to debug so later graph-based orchestration has a known-good fallback.

## Shared Constraints

- Product code and product docs stay under `shipyard/`; `.ai/` remains helper-only.
- Phase 3 assumes the Phase 2 tool contract exists first: tools self-register, expose Anthropic-ready schemas, and return `ToolResult` with `success`, `output`, and optional `error`.
- The raw loop stays framework-free. LangGraph remains explicitly out of scope for this phase.
- Anthropic's current official model overview lists the Sonnet 4.5 alias as `claude-sonnet-4-5` and the versioned API ID as `claude-sonnet-4-5-20250929`; prefer the alias in code unless the repo later chooses to pin a specific version.
- Live Claude verification must keep the surgical-editing bar intact: existing files should be changed through `edit_block`, not overwritten with `write_file`.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P3-S01 | Anthropic Client and Tool-Use Contract | Add the minimal Claude Messages API client, model/config contract, and message-block helpers the raw loop depends on. | Phase 2 implementation |
| P3-S02 | Raw Claude Tool Loop | Implement `src/engine/raw-loop.ts` with iterative tool execution, bounded retries, and console logging. | P3-S01 |
| P3-S03 | Live Loop Verification and Prompt Hardening | Exercise read, surgical edit, and greenfield creation against the live model, then tighten prompts if Claude reaches for the wrong tool. | P3-S02 |

## Sequencing Rationale

- `P3-S01` lands first because the raw loop needs a stable Claude client, model choice, and typed content-block helpers before any iteration logic exists.
- `P3-S02` implements the framework-free fallback loop once the client and tool-schema plumbing are stable.
- `P3-S03` closes the phase by proving Claude actually honors surgical editing under live calls and by tightening prompts only if the observed behavior demands it.

## Whole-Pack Success Signal

- A single raw-loop function can send a user request to Claude with tools, execute returned tool calls, and keep going until the model produces final text.
- Loop execution is bounded at 25 turns and logs enough detail to debug every tool call.
- The live surgical-edit scenario changes only the requested function and leaves all other file bytes untouched.
- The phase ends with a successful validation run and a commit that captures the working pipeline.
