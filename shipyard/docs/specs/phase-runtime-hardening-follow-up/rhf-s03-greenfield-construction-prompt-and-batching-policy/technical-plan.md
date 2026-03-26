# Technical Plan

## Metadata
- Story ID: RHF-S03
- Story Title: Greenfield Construction Prompt and Batching Policy
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/phases/code/prompts.ts`
  - any prompt-contract or coordinator tests that assert code-phase guidance
  - optional smoke docs if prompt wording changes visible operator expectations
- Public interfaces/contracts:
  - code-phase system prompt contract for new-file vs existing-file work
- Data flow summary: the coordinator continues using the same file tools, but the system prompt now tells the model it may write net-new files directly after bootstrap, batch coherent new modules, and reserve `read_file` plus `edit_block` for modifying existing files.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - reduce reread churn during greenfield builds
  - align prompt guidance with real tool semantics
  - keep existing-file protections intact
- Story ordering rationale: this story follows the history fixes because prompt relaxation is only useful if the loop can preserve recent write context safely.
- Gaps/overlap check: this story owns prompt policy only; coordinator continuation semantics belong in `RHF-S05`.
- Whole-pack success signal: greenfield app construction stops paying a prompt tax for files that are brand new.

## Architecture Decisions
- Decision: distinguish new-file creation from existing-file modification directly in the code-phase prompt.
- Alternatives considered:
  - keep the stricter "always read first" rule everywhere
  - weaken edit guardrails for existing files too
  - rely on unstated coordinator heuristics instead of explicit prompt guidance
- Rationale: the runtime already has separate tools for new-file writes and surgical edits, so the prompt should teach the model when each path is appropriate.

## Data Model / API Contracts
- Request shape:
  - unchanged acting-loop request shape with updated system prompt text
- Response shape:
  - no schema change; only the model guidance changes
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: code-phase prompt module and relevant tests.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the model overuses `write_file` and stops reading existing files.
  - Mitigation: keep explicit read-before-modify language and test mixed new-file versus existing-file scenarios.

## Test Strategy
- Unit tests:
  - prompt snapshot or contract assertions cover the new-file rule, batching guidance, and preserved verifier guidance
- Integration tests:
  - greenfield runtime tests prefer direct new-file writes before later existing-file edits
  - mixed turns still require reads before modifying existing files
- E2E or smoke tests:
  - optional manual smoke for a scaffold-plus-feature build to confirm reduced rereads
- Edge-case coverage mapping:
  - brand-new file
  - later modification of that same file
  - mixed new and existing files in one task
  - bootstrap-generated starter plus one-off custom modules

## Rollout and Risk Mitigation
- Rollback strategy: prompt changes stay localized to one file and can revert cleanly if tool-choice behavior regresses.
- Feature flags/toggles: none required; prompt text is the contract.
- Observability checks: focused tests should make prompt expectations visible without depending on provider behavior.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
