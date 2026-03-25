# Technical Plan

## Metadata
- Story ID: P6-S01
- Story Title: Explorer Subagent
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/agents/explorer.ts`
  - shared raw-loop orchestration or a LangGraph subgraph wrapper
  - `shipyard/src/artifacts/types.ts` for report shape alignment if needed
- Public interfaces/contracts:
  - explorer prompt
  - explorer tool list
  - `ContextReport` output contract
- Data flow summary: coordinator passes a focused question into the explorer, the explorer searches with read-only tools, and the resulting structured findings are handed back to the coordinator.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)

- Higher-level pack objectives:
  - split read-only discovery and verification away from the coordinator
  - make subagent contracts explicit and independently testable
  - preserve coordinator-only writes while adding narrower evidence paths
- Story ordering rationale: the explorer lands before verifier and coordinator routing because the coordinator first needs a trusted discovery source.
- Gaps/overlap check: this story owns isolated discovery only; verifier command execution and coordinator heuristics stay in `P6-S02` and `P6-S03`.
- Whole-pack success signal: later stories can consume a proven `ContextReport` contract instead of guessing how discovery results are shaped.

## Architecture Decisions

- Decision: keep the explorer isolated from the coordinator's prior turns.
- Decision: make the output structured JSON so the coordinator can consume it programmatically.
- Rationale: read-only discovery is most useful when it is narrow, reproducible, and easy to merge into planning.

## Data Model / API Contracts

- Request shape:
  - `query: string`
  - `targetDirectory: string`
  - optional loop dependencies such as a mock Anthropic client for tests
- Response shape:
  - `ContextReport`
  - `ContextFinding[]` with `filePath`, `excerpt`, and `relevanceNote`
- Failure contracts:
  - malformed final JSON is rejected instead of being coerced silently
  - any requested tool outside the read-only allowlist fails closed
  - no discovery hits still returns a valid `ContextReport` with an empty `findings` array
- Storage/index changes:
  - none; this story is runtime-only

## Dependency Plan

- Existing dependencies used: current tool registry, raw loop, and artifact types.
- New dependencies proposed: none.
- Risk and mitigation:
  - Risk: the model returns prose or malformed JSON instead of a usable report.
  - Mitigation: keep the system prompt explicit and validate the final output locally before returning it.

## Implementation Notes

- Define or confirm the explorer system prompt so it explicitly forbids file writes.
- Restrict the tool list to `read_file`, `list_files`, and `search_files`.
- Ensure the runtime fails closed if any other tool is requested.
- Serialize findings into the `ContextReport` structure rather than returning prose.

## Test Strategy

- Unit tests:
  - tool allowlist and prompt contract
  - final report parsing and validation
  - unauthorized tool failure path
- Integration tests:
  - broad discovery question over a temp repository with real `search_files` / `read_file` output
  - isolated invocation that starts from a fresh message history
- E2E or smoke tests: deferred to `P6-S03`, where the coordinator will consume the report.
- Edge-case coverage mapping:
  - no matches found
  - malformed final JSON
  - unavailable tool request
  - findings that need excerpts trimmed to keep output bounded

## TDD Contract

- Public API surface for test-first work:
  - `runExplorerSubagent(...)`
  - `EXPLORER_TOOL_NAMES`
  - report parsing/validation helper exported from `shipyard/src/agents/explorer.ts`
- Handoff artifact path: `.ai/state/tdd-handoff/p6-s01/`
- Property tests required: no; the story is an orchestration contract, not a transform-heavy state machine.
- Targeted mutation gate: unavailable in this repo because `scripts/run_targeted_mutation.sh` is not present, so the skip must be recorded in the handoff artifacts.
- Focused RED/GREEN command: `pnpm --dir shipyard test -- tests/explorer-subagent.test.ts`

## Rollout and Risk Mitigation

- Rollback strategy: keep the explorer as a standalone helper until `P6-S03` wires it into coordinator routing.
- Feature flags/toggles: not required while the runtime remains isolated and opt-in.
- Observability checks: reuse raw-loop logging and keep the final report specific enough to debug query quality quickly.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
