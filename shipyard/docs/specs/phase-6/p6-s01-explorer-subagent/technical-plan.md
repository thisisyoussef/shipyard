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

## Architecture Decisions

- Decision: keep the explorer isolated from the coordinator's prior turns.
- Decision: make the output structured JSON so the coordinator can consume it programmatically.
- Rationale: read-only discovery is most useful when it is narrow, reproducible, and easy to merge into planning.

## Dependency Plan

- Existing dependencies used: current tool registry, raw loop, and artifact types.
- New dependencies proposed: none.

## Implementation Notes

- Define or confirm the explorer system prompt so it explicitly forbids file writes.
- Restrict the tool list to `read_file`, `list_files`, and `search_files`.
- Ensure the runtime fails closed if any other tool is requested.
- Serialize findings into the `ContextReport` structure rather than returning prose.

## Test Strategy

- Unit: prompt/tool allowlist and report-shape validation.
- Integration: run a focused discovery question and confirm the explorer returns structured findings.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
