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

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)

- Higher-level pack objectives:
  - split read-only discovery and verification away from the coordinator
  - make subagent contracts explicit and independently testable
  - preserve coordinator-only writes while adding narrower evidence paths
- Story ordering rationale: the verifier lands after the explorer contract and before coordinator integration so verification becomes a clean structured step instead of coordinator-side shell noise.
- Gaps/overlap check: this story owns isolated command execution only; explorer discovery and coordinator routing stay in `P6-S01` and `P6-S03`.
- Whole-pack success signal: later stories can consume a stable `VerificationReport` contract instead of inferring pass/fail from raw command logs.

## Architecture Decisions

- Decision: keep the verifier isolated from coordinator chat history.
- Decision: report pass/fail in a structured object rather than asking the coordinator to infer it from raw logs.
- Rationale: verification should be lightweight, explicit, and easy to retry or escalate.

## Data Model / API Contracts

- Request shape:
  - `command: string`
  - `targetDirectory: string`
  - optional loop dependencies such as a mock Anthropic client for tests
- Response shape:
  - `VerificationReport`
  - `command`, `exitCode`, `passed`, `stdout`, `stderr`, and `summary`
- Failure contracts:
  - blank commands are rejected before the verifier loop runs
  - malformed final JSON is rejected instead of being coerced silently
  - any requested tool outside the command-only allowlist fails closed
  - timeouts still return a structured failure report
- Storage/index changes:
  - none; this story is runtime-only

## Dependency Plan

- Existing dependencies used: current tool registry, raw loop, and artifact types.
- New dependencies proposed: none.
- Risk and mitigation:
  - Risk: the model mirrors raw shell output instead of returning a concise actionable report.
  - Mitigation: keep the verifier prompt explicit and validate the final output locally before returning it.

## Implementation Notes

- Define or confirm the verifier system prompt so it explicitly forbids file mutation tools.
- Restrict the tool list to `run_command`.
- Capture stdout, stderr, exit code, and timeout behavior in `VerificationReport`.
- Keep summaries concise enough for the coordinator to use in recovery decisions.

## Test Strategy

- Unit tests:
  - tool allowlist and prompt contract
  - final report parsing and validation
  - unauthorized tool failure path
- Integration tests:
  - known passing command over a temp repository
  - known failing command and timeout propagation
- E2E or smoke tests: deferred to `P6-S03`, where the coordinator will consume verifier output.
- Edge-case coverage mapping:
  - blank command
  - malformed final JSON
  - unavailable tool request
  - timeout and long-output failure summaries

## TDD Contract

- Public API surface for test-first work:
  - `runVerifierSubagent(...)`
  - `VERIFIER_TOOL_NAMES`
  - report parsing/validation helper exported from `shipyard/src/agents/verifier.ts`
- Handoff artifact path: `.ai/state/tdd-handoff/p6-s02/`
- Property tests required: no; the story is a bounded orchestration contract, not a state-machine-heavy transform.
- Targeted mutation gate: unavailable in this repo because `scripts/run_targeted_mutation.sh` is not present, so the skip must be recorded in the handoff artifacts.
- Focused RED/GREEN command: `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts`

## Rollout and Risk Mitigation

- Rollback strategy: keep the verifier as a standalone helper until `P6-S03` wires it into coordinator routing.
- Feature flags/toggles: not required while the runtime remains isolated and opt-in.
- Observability checks: reuse raw-loop logging and keep the final report explicit about the command and failure reason.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
