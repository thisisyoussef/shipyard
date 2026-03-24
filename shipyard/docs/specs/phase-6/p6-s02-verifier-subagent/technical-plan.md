# Technical Plan

## Metadata
- Story ID: P6-S02
- Story Title: Verifier Subagent
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/agents/verifier.ts`
  - shared raw-loop orchestration or a LangGraph subgraph wrapper
  - `shipyard/src/artifacts/types.ts` if report normalization is needed
- Public interfaces/contracts:
  - verifier prompt
  - verifier tool list
  - `VerificationReport` output contract
- Data flow summary: coordinator passes a command into the verifier, the verifier executes it with `run_command`, and the structured result returns to the coordinator.

## Architecture Decisions

- Decision: keep the verifier isolated from coordinator chat history.
- Decision: report pass/fail in a structured object rather than asking the coordinator to infer it from raw logs.
- Rationale: verification should be lightweight, explicit, and easy to retry or escalate.

## Dependency Plan

- Existing dependencies used: current tool registry, raw loop, and artifact types.
- New dependencies proposed: none.

## Implementation Notes

- Define or confirm the verifier system prompt so it explicitly forbids file mutation tools.
- Restrict the tool list to `run_command`.
- Capture stdout, stderr, exit code, and timeout behavior in `VerificationReport`.
- Keep summaries concise enough for the coordinator to use in recovery decisions.

## Test Strategy

- Unit: command allowlist and report-shape validation.
- Integration: run a known passing command and a known failing command.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
