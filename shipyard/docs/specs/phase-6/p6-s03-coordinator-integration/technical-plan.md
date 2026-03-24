# Technical Plan

## Metadata
- Story ID: P6-S03
- Story Title: Coordinator Integration
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/agents/explorer.ts`
  - `shipyard/src/agents/verifier.ts`
  - orchestration or routing helpers
- Public interfaces/contracts:
  - coordinator heuristics for subagent spawning
  - merge rules for structured reports
- Data flow summary: the coordinator inspects the instruction and current context, decides whether to call explorer or verifier, and then folds those structured results into its planning and recovery logic.

## Architecture Decisions

- Decision: prefer verification evidence over exploration guesses when they conflict.
- Decision: keep the coordinator as the only component that decides how to use subagent output.
- Decision: make routing heuristics conservative so trivial instructions do not spawn unnecessary subagents.
- Rationale: subagents should narrow context, not create orchestration churn.

## Dependency Plan

- Existing dependencies used: explorer and verifier contracts from P6-S01 and P6-S02.
- New dependencies proposed: none.

## Implementation Notes

- Add a heuristic such as:
  - spawn explorer when the instruction is broad or names a feature/component/endpoint without file paths
  - spawn verifier after every edit
- Merge outputs as structured objects:
  - `ContextReport` informs target file paths and planning
  - `VerificationReport` informs retry, recover, or escalate
- Keep the coordinator’s own context window small by summarizing subagent output instead of copying raw payloads wholesale.

## Test Strategy

- Integration: broad instruction routes through explorer, edit routes through verifier.
- Conflict scenario: explorer and verifier disagree, coordinator trusts verification.
- Regression: trivial exact-path instruction skips explorer when appropriate.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
