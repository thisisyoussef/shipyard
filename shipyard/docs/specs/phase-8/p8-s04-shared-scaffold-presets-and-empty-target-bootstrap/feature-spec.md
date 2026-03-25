# Feature Spec

## Metadata
- Story ID: P8-S04
- Story Title: Shared Scaffold Presets and Empty-Target Bootstrap
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 8 spec-driven operator workflow

## Problem Statement

Shipyard already has target-manager scaffolds, but they are intentionally minimal and live only in the target-creation flow. Meanwhile, the code-phase prompt still tells Shipyard to build empty projects with repeated `write_file` calls. For greenfield full-stack work, that wastes tokens on boilerplate and duplicates scaffold logic that the repo already owns elsewhere.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Reuse and deepen the existing scaffold system instead of creating a parallel bootstrap toolchain.
- Objective 2: Add richer generic workspace presets for greenfield full-stack work.
- Objective 3: Give already-selected empty targets a shared bootstrap path that does not require dozens of boilerplate writes.
- How this story or pack contributes to the overall objective set: This story reduces boilerplate overhead for greenfield work while staying aligned with the existing target-manager infrastructure.

## User Stories
- As an operator creating a greenfield target, I want a richer generic starter preset so the agent does not spend multiple turns rebuilding standard workspace scaffolding.
- As a coordinator working in an already-selected empty target, I want a shared bootstrap path that reuses the same preset logic instead of hand-writing every boilerplate file.

## Acceptance Criteria
- [ ] AC-1: The shared scaffold catalog supports at least one richer generic workspace preset suitable for full-stack TypeScript/pnpm-style work.
- [ ] AC-2: The target-manager creation flow can use that richer preset without duplicating template logic.
- [ ] AC-3: A shared bootstrap path exists for already-selected empty targets so code phase can initialize the preset in one bounded action instead of many `write_file` calls.
- [ ] AC-4: Shared scaffold generation stays deterministic and local-only: no network fetches, no `create-*` CLI wrappers, no dependency install side effects.
- [ ] AC-5: Prompting or runtime guidance for greenfield code phase is updated so Shipyard prefers the shared bootstrap path over manual boilerplate file creation when appropriate.
- [ ] AC-6: The story does not hard-code external project-specific “Ship” structure or backlog assumptions into Shipyard.

## Edge Cases
- Non-empty target selected for bootstrap: reject clearly instead of partially overwriting files.
- Operator chooses a richer preset but later wants a thinner scaffold: explicit preset selection should stay possible.
- Missing package manager or discovery metadata: preset generation should still be deterministic.
- Bootstrap interrupted mid-run: repo should remain inspectable and recoverable instead of half-overwriting arbitrary files.

## Non-Functional Requirements
- Reliability: presets should be generated from checked-in templates/functions, not network calls.
- Performance: preset bootstrap should be materially faster than many boilerplate `write_file` turns.
- Maintainability: one scaffold source of truth should serve both target creation and empty-target bootstrap.
- Security: bootstrap remains local-only and bounded to empty targets unless explicitly expanded later.

## UI Requirements (if applicable)
- Later UI surfaces, if any, should present preset choice as a concise scaffold selection rather than a long questionnaire.

## Out of Scope
- Dependency installation automation.
- Project-specific starter templates tied to one customer/rebuild target.
- Rich template marketplaces.

## Done Definition
- Shipyard can bootstrap an empty target through shared scaffold presets without duplicating template logic or wasting turns on repetitive boilerplate file creation.
