# Technical Plan

## Metadata
- Story ID: P8-S04
- Story Title: Shared Scaffold Presets and Empty-Target Bootstrap
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/tools/target-manager/scaffolds.ts`
  - target-manager create flow and related tests
  - a shared bootstrap helper or code-phase tool for already-selected empty targets
  - code-phase prompt/routing where greenfield instructions are currently handled with `write_file`
  - tests such as `shipyard/tests/scaffold-bootstrap.test.ts`
- Public interfaces/contracts:
  - expanded scaffold type catalog
  - shared bootstrap entry point for empty selected targets
- Data flow summary: Shipyard chooses a richer preset either during target creation or when explicitly bootstrapping an empty selected target, reuses the shared scaffold generator, writes the starter files in one bounded path, and then returns to normal file-read/edit behavior.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - lower-token greenfield bootstrap
  - shared scaffolding source of truth
  - no duplicate project-initialization systems
- Story ordering rationale: this story is independent of the spec/task workflow stories, so it can land when greenfield bootstrap pain becomes the next highest-value bottleneck.
- Gaps/overlap check: this story replaces the consultant’s proposed new scaffolder tool with a shared extension of `create_target` plus optional empty-target bootstrap reuse.
- Whole-pack success signal: Shipyard spends fewer turns on boilerplate and more on actual product logic when starting from an empty target.

## Architecture Decisions
- Decision: extend the shared scaffold catalog rather than adding a second unrelated project scaffolder.
- Alternatives considered:
  - a brand-new `scaffold_project` tool with separate templates
  - leaving all greenfield work to repeated `write_file` calls
- Rationale: the repo already owns a scaffold catalog and target-creation flow. A shared source of truth reduces drift and keeps target-manager/bootstrap behavior aligned.

## Data Model / API Contracts
- Request shape:
  - scaffold preset key
  - target path or target creation input
- Response shape:
  - created file list / bootstrap summary
  - updated discovery snapshot if needed
- Storage/index changes:
  - no new persistent artifact beyond generated files and normal session state

## Dependency Plan
- Existing dependencies used: target-manager scaffolds, discovery, session state, code-phase prompt guidance.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: richer presets become too opinionated and stop being generic.
  - Mitigation: keep presets generic to common workspace structures and explicitly avoid project-specific external assumptions.

## Test Strategy
- Unit tests:
  - richer preset file generation
  - empty-target guard rails
  - shared scaffold reuse between target-manager and bootstrap paths
- Integration tests:
  - target creation using the richer preset
  - code-phase bootstrap of an empty selected target
- E2E or smoke tests:
  - optional manual smoke for a greenfield target bootstrapped through the shared preset
- Edge-case coverage mapping:
  - non-empty target
  - interrupted bootstrap
  - preset mismatch handling

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - any future UI exposure should reuse the same preset catalog labels
- Component structure:
  - deferred in this story
- Accessibility implementation plan:
  - not applicable in this scaffold-focused story
- Visual regression capture plan:
  - not applicable in this scaffold-focused story

## Rollout and Risk Mitigation
- Rollback strategy: keep minimal existing presets and bootstrap guidance available until the richer preset path proves out.
- Feature flags/toggles: optional if empty-target bootstrap is introduced behind an explicit call or heuristic.
- Observability checks: traces/logs should capture scaffold preset selection and bootstrap completion.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
