# Technical Plan

## Metadata
- Story ID: P6-S03
- Story Title: Coordinator Integration
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/tests/graph-runtime.test.ts`
  - nearby architecture and agent docs that describe the shipped multi-agent flow
- Public interfaces/contracts:
  - coordinator helper exports for path extraction, explorer routing, task-plan creation, and verification-command selection
  - `AgentGraphState` support for `ContextReport`
  - dependency-injection hooks for explorer/verifier invocation inside the graph runtime
- Data flow summary: the coordinator inspects the instruction and current context, decides whether to call explorer before planning, folds `ContextReport` into the task plan, runs the acting loop, then delegates post-edit verification to the verifier and lets `VerificationReport` drive respond vs recover.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)

- Higher-level pack objectives:
  - split read-only discovery and verification away from the coordinator
  - make subagent contracts explicit and independently testable
  - preserve coordinator-only writes while adding narrower evidence paths
- Story ordering rationale: this story lands after `P6-S01` and `P6-S02` so the coordinator only depends on proven `ContextReport` and `VerificationReport` contracts.
- Gaps/overlap check: this story owns routing heuristics and graph integration only; explorer/verifier isolation stays owned by the earlier stories.
- Whole-pack success signal: broad instructions can gather read-only evidence first, every edit routes through verifier checks, and recovery still keys off verification evidence rather than exploration guesses.

## Architecture Decisions

- Decision: prefer verification evidence over exploration guesses when they conflict.
- Decision: keep the coordinator as the only component that decides how to use subagent output.
- Decision: make routing heuristics conservative so exact-path and greenfield instructions do not spawn unnecessary explorers.
- Decision: keep prior `ContextReport` data in graph state so retries do not need to rediscover the same files.
- Rationale: subagents should narrow context, not create orchestration churn.

## Data Model / API Contracts

- Planning inputs:
  - `instruction: string`
  - `ContextEnvelope` with discovery data, available scripts, and any pre-known target file paths
  - prior `TaskPlan` / `ContextReport` state during retries
- Planning outputs:
  - `TaskPlan` with target file paths sourced from explicit paths or explorer findings
  - optional `ContextReport` stored in graph state for later replans
- Verification inputs:
  - edited-file state plus the target repo's available scripts
  - command selection priority: `test` -> `typecheck` -> `build` -> `git diff --stat`
- Failure contracts:
  - greenfield instructions skip explorer because there is nothing useful to search yet
  - exact-path instructions skip explorer even if the request is otherwise broad
  - missing edited-file state returns a structured failed verification report instead of throwing
  - verification failure always wins over explorer hints when deciding whether to recover or block
- Storage/index changes:
  - none; this story only extends in-memory graph state

## Dependency Plan

- Existing dependencies used: coordinator helper logic, explorer and verifier contracts from `P6-S01` / `P6-S02`, graph runtime dependencies, and context-envelope discovery metadata.
- New dependencies proposed: none.
- Risk and mitigation:
  - Risk: heuristics over-spawn explorer on simple instructions.
  - Mitigation: skip explorer for greenfield or explicit-path requests and preserve known target paths across retries.
  - Risk: verification command selection drifts from the repo's available scripts.
  - Mitigation: derive the command from `ContextEnvelope.stable.availableScripts` instead of hard-coding raw shell commands.

## Implementation Notes

- Add coordinator helpers that:
  - extract explicit target paths from the instruction when present
  - decide whether explorer is needed from instruction shape, greenfield state, and previously known target paths
  - choose the verification command from available scripts and package manager
- Keep `ContextReport` in graph state so recoveries can reuse prior discovery context.
- Pass the existing raw-loop client/logger subset into explorer/verifier helpers so tests can inject mocks without changing runtime flow.
- Keep `verifyState` override support for tests that mock verification directly.

## Test Strategy

- Unit/integration tests:
  - broad instruction routes through explorer before acting
  - exact-path instruction skips explorer and plans directly
  - post-edit verification delegates to the verifier helper using the derived script command
- Recovery/merge tests:
  - conflicting explorer hint vs verifier failure still blocks the edited file and keeps recovery intact
- Regression tests:
  - existing fallback runtime still succeeds for greenfield no-edit instructions
  - repeated retries do not require redundant explorer calls once context is known
- E2E or smoke tests: covered through the graph-runtime contract suite; no new manual runtime flow is required for this story.

## TDD Contract

- Public API surface for test-first work:
  - `extractInstructionTargetFilePaths(...)`
  - `shouldCoordinatorUseExplorer(...)`
  - `createCoordinatorTaskPlan(...)`
  - `createVerificationCommand(...)`
  - `createAgentRuntimeNodes(...)`
  - `runFallbackRuntime(...)`
- Handoff artifact path: `.ai/state/tdd-handoff/p6-s03/`
- Property tests required: no; the story is orchestration-focused and already covered by explicit state-machine cases.
- Targeted mutation gate: unavailable in this repo because `scripts/run_targeted_mutation.sh` is not present, so the skip must be recorded in the handoff artifacts.
- Focused RED/GREEN command: `pnpm --dir shipyard test -- tests/graph-runtime.test.ts`

## Rollout and Risk Mitigation

- Rollback strategy: keep the explorer/verifier helpers isolated and revert the coordinator wiring without touching their standalone contracts if unexpected runtime churn appears.
- Feature flags/toggles: not required; the change stays inside the existing graph-runtime state machine.
- Observability checks: task plans should show explorer-derived target paths, and verification reports should expose the actual command/summary that drove recovery or respond.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
