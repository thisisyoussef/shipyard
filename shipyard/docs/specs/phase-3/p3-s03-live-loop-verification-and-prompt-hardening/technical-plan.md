# Technical Plan

## Metadata
- Story ID: P3-S03
- Story Title: Live Loop Verification and Prompt Hardening
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/phases/code/prompts.ts` or a new raw-loop-specific prompt module
  - `shipyard/tests/` or `shipyard/tests/manual/` for the live harness
  - temporary fixture creation helpers
- Public interfaces/contracts:
  - a direct script or harness entrypoint for the three live scenarios
  - assertions that capture which tools were invoked and whether file bytes changed outside the target edit
- Data flow summary: the harness creates a temp workspace, seeds a test file, runs the raw loop against the live Anthropic client for each scenario, inspects both Claude's reported answer and the resulting files, then applies prompt hardening only if the observed tool choices are wrong.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - prove the model-to-tool pipeline
  - preserve surgical editing under live model behavior
  - keep the first live loop observable and bounded
- Story ordering rationale: this story depends on the working raw loop and closes the phase with live behavioral proof.
- Gaps/overlap check: this story owns live verification and prompt tuning only; it does not redesign the loop architecture.
- Whole-pack success signal: the live model chooses the right tools for read, edit, and create tasks, and the surgical edit leaves untouched bytes exactly intact.

## Architecture Decisions
- Decision: keep live verification as an explicit smoke path rather than a default CI gate.
- Alternatives considered:
  - require Anthropic-powered tests on every CI run
  - skip live verification and trust mocked loop tests alone
- Rationale: the phase's goal is real-world proof, but the repo cannot assume API keys or cost budget in every automated environment.

## Data Model / API Contracts
- Request shape:
  - scenario-specific prompt strings
  - selected tool-name list
  - temp target directory path
- Response shape:
  - final assistant text
  - captured tool-call transcript
  - byte-level file comparison result for the surgical-edit scenario
- Storage/index changes:
  - none beyond temporary fixture directories or optional transcript files

## Dependency Plan
- Existing dependencies used: raw loop, Anthropic client helpers, tool registry, Node filesystem utilities.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: Claude may choose `write_file` during the edit scenario despite the intended tool contract.
  - Mitigation: harden the prompt and tool descriptions with explicit surgical-edit instructions and rerun the live harness until the behavior is correct.

## Test Strategy
- Unit tests:
  - helper coverage for fixture setup and byte-for-byte comparison
- Integration tests:
  - local harness plumbing without live Anthropic calls where possible
- E2E or smoke tests:
  - live read scenario
  - live surgical-edit scenario
  - live greenfield creation scenario
- Edge-case coverage mapping:
  - missing API key
  - wrong-tool selection during edit
  - incorrect final answer despite correct tool use

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: if live verification exposes prompt instability, keep the raw loop behind a manual-only workflow until prompt hardening is complete.
- Feature flags/toggles: none.
- Observability checks: preserve enough transcript detail to prove which tool Claude used in each scenario.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
