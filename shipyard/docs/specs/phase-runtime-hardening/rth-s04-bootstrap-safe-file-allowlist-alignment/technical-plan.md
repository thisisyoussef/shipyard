# Technical Plan

## Metadata
- Story ID: RTH-S04
- Story Title: Bootstrap Safe-File Allowlist Alignment
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/tools/target-manager/bootstrap-target.ts`
  - `shipyard/src/tools/target-manager/scaffold-materializer.ts` if the allowlist is better centralized there
  - `shipyard/tests/scaffold-bootstrap.test.ts`
- Public interfaces/contracts:
  - bootstrap allowlist for safe existing entries
  - clearer bootstrap rejection messaging
- Data flow summary: before materializing a scaffold, bootstrap checks existing target entries against a narrow allowlist. Seed docs such as `AGENTS.md` and `README.md` are treated as safe, while any extra project content still rejects the bootstrap attempt.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - less wasted work in greenfield bootstraps
  - preserved safety against partial scaffold overwrite
- Story ordering rationale: this story is narrow and parallelizable, but it belongs in the pack because it removes one of the repeated first-turn costs that shows up before larger write-heavy turns even begin.
- Gaps/overlap check: this story only changes bootstrap validation; it does not alter scaffold presets or same-session routing heuristics.
- Whole-pack success signal: Shipyard treats operator seed docs as harmless setup instead of as proof the target is already populated.

## Architecture Decisions
- Decision: keep the bootstrap allowlist intentionally narrow and explicit.
- Alternatives considered:
  - keep the current `.shipyard`/`.git`-only rule
  - allow arbitrary markdown or hidden files
- Rationale: `AGENTS.md` and `README.md` are common operator seed docs, but broadening the allowlist too far would weaken the safety contract.

## Data Model / API Contracts
- Request shape:
  - unchanged bootstrap tool input
- Response shape:
  - unchanged bootstrap result, plus clearer rejection message on failure
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: bootstrap target tool, shared scaffold materializer, discovery refresh, and existing scaffold tests.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: allowlist grows until it stops protecting real project content.
  - Mitigation: keep the list explicit, narrow, and regression-tested.

## Test Strategy
- Unit tests:
  - allowlisted seed-doc directory passes
  - non-allowlisted content still fails
- Integration tests:
  - bootstrap from a target containing `AGENTS.md` and `README.md`
  - bootstrap rejection when a package manifest or source directory already exists
- Edge-case coverage mapping:
  - only one of the seed docs present
  - extra hidden file present
  - nested directory present

## Rollout and Risk Mitigation
- Rollback strategy: the allowlist stays isolated to bootstrap validation and can be reverted without touching scaffold generation.
- Feature flags/toggles: not needed.
- Observability checks: failure messages should list the existing disallowed entries so debugging is immediate.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
