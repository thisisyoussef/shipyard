# Technical Plan

## Metadata
- Story ID: P7-S03
- Story Title: Browser Evaluator for Previewable Targets
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/browser-evaluator.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/preview/` for preview URL or capability handoff where needed
  - browser-evaluator-focused tests plus manual smoke coverage over a previewable target
  - `shipyard/package.json` if a browser automation dependency is added
- Public interfaces/contracts:
  - `BrowserEvaluationPlan`
  - `BrowserEvaluationReport`
  - preview URL handoff into the browser evaluator
- Data flow summary: the runtime obtains a loopback preview URL from the existing preview stack, the browser evaluator runs a bounded structured plan against that URL, and the structured result returns evidence to the coordinator or verifier path.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - richer planning before writes
  - richer evaluation after writes
  - browser-visible QA for previewable targets
  - durable handoff for long-running work
- Story ordering rationale: this story follows the richer evaluation contract so browser evidence can slot into a stable report shape rather than inventing a parallel QA channel.
- Gaps/overlap check: this story owns read-only browser evidence only; coordinator routing and final threshold tuning remain in `P7-S05`.
- Whole-pack success signal: previewable targets can be validated through real browser evidence, not only shell commands.

## Architecture Decisions
- Decision: implement browser QA as a dedicated read-only evaluator rather than adding browser automation directly to the coordinator or command verifier.
- Alternatives considered:
  - rely on shell checks plus preview iframe only
  - add browser actions directly to the coordinator prompt
- Rationale: a dedicated browser evaluator keeps responsibilities narrow, preserves coordinator readability, and makes local UI evidence independently testable.

## Data Model / API Contracts
- Request shape:
  - `BrowserEvaluationPlan` with preview URL or preview reference plus ordered browser steps
- Response shape:
  - `BrowserEvaluationReport` with overall status, preview URL, step outcomes, console errors, and optional artifact paths
- Storage/index changes:
  - optional browser-evaluation artifacts under `.shipyard/artifacts/<sessionId>/browser-evaluator/`
  - no schema dependency on UI workbench rendering in this story

## Dependency Plan
- Existing dependencies used: current preview supervisor, current session model, current artifact patterns.
- New dependencies proposed (if any):
  - a local browser automation dependency such as Playwright, scoped to loopback evaluation
- Risk and mitigation:
  - Risk: browser automation adds heavy setup cost or flaky local behavior.
  - Mitigation: keep the plan bounded, prefer loopback-only preview targets, and include a structured `not_applicable` path when preview is unavailable.

## Test Strategy
- Unit tests:
  - browser-plan validation
  - browser-report normalization
  - preview-unavailable result handling
- Integration tests:
  - run a bounded browser evaluation against a scaffolded previewable target
  - capture console-error and selector-failure outcomes cleanly
- E2E or smoke tests:
  - manual or scripted smoke over an actual local preview session
- Edge-case coverage mapping:
  - preview unavailable
  - page-load timeout
  - console error after page load
  - selector or click failure

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - browser-evaluator results should be independent of the workbench but easy to stream later
- Component structure:
  - optional workbench presentation is deferred to later integration
- Accessibility implementation plan:
  - not applicable in this evaluator-contract story
- Visual regression capture plan:
  - optional screenshot capture should record stable states only and avoid introducing noisy baselines

## Rollout and Risk Mitigation
- Rollback strategy: keep preview as a human-facing tool even if automated browser evaluation proves too flaky in the first pass.
- Feature flags/toggles: browser evaluation can remain opt-in or heuristic-gated until `P7-S05` finalizes routing.
- Observability checks: record preview URL, evaluated steps, console errors, and any browser artifact paths in local logs and trace metadata.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
