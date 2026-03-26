# Feature Spec

## Metadata
- Story ID: RHF-S06
- Story Title: Bootstrap-Ready Discovery Alignment
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

`bootstrap_target` now allows a target directory that contains only `AGENTS.md` and/or `README.md`, but discovery still treats any visible top-level file as proof that the target is no longer greenfield. That mismatch sends doc-seeded targets down broad exploration paths instead of the lightweight bootstrap flow, even though there is still no actual app code to inspect.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: make discovery and bootstrap use the same readiness rules for near-empty targets.
- Objective 2: keep doc-seeded targets on the cheap bootstrap path.
- Objective 3: avoid broad exploration loops when there is nothing real to discover yet.
- How this story or pack contributes to the overall objective set: This is the narrow alignment fix that removes a repeated wasted-turn path during seeded greenfield runs.

## User Stories
- As an operator starting from a target that only has `AGENTS.md` or `README.md`, I want Shipyard to treat it like a bootstrap-ready workspace rather than an existing app.
- As the coordinator, I want one explicit readiness signal instead of inferring bootstrap eligibility differently in discovery and target bootstrap validation.

## Acceptance Criteria
- [ ] AC-1: Discovery exposes an explicit bootstrap-ready signal for empty targets and doc-seeded targets that contain only allowed seed files plus ignored system directories.
- [ ] AC-2: Coordinator and turn routing use that bootstrap-ready signal, or an equivalent shared rule, instead of assuming any visible file means "existing repo."
- [ ] AC-3: Targets containing only `AGENTS.md` and/or `README.md` take the lightweight bootstrap path rather than broad file-discovery loops.
- [ ] AC-4: Targets that contain real source files, manifests, or other non-allowlisted entries remain non-bootstrap-ready.
- [ ] AC-5: Tests cover empty targets, doc-seeded targets, and truly existing targets.

## Edge Cases
- A target can contain ignored runtime directories like `.shipyard` alongside allowed seed docs.
- A target with `README.md` plus `package.json` should not be considered bootstrap-ready.
- Discovery summaries and UI labels should not become misleading if a new explicit `bootstrapReady` flag is added.
- Sorting and filtering of top-level entries must stay deterministic for tests.

## Non-Functional Requirements
- Reliability: bootstrap-readiness should be derived from one deterministic rule.
- Performance: doc-seeded targets should avoid unnecessary exploration turns.
- Maintainability: readiness logic should live in one shared place or one shared contract.
- Observability: discovery output should make bootstrap readiness explicit for debugging.

## Out of Scope
- Adding new scaffold presets.
- Changing bootstrap tool behavior beyond readiness alignment.
- Task-aware iteration budgets or continuation semantics.

## Done Definition
- Discovery and bootstrap agree on what counts as a bootstrap-ready target, and doc-seeded workspaces stop being misrouted into broad exploration.
