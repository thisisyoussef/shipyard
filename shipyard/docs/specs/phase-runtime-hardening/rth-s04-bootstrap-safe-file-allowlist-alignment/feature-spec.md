# Feature Spec

## Metadata
- Story ID: RTH-S04
- Story Title: Bootstrap Safe-File Allowlist Alignment
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening supplemental pack

## Problem Statement

`bootstrap_target` currently treats a target as non-empty unless the only existing entries are `.shipyard` or `.git`. That is too strict for the real operator workflow, where a target may already contain seed docs like `AGENTS.md` or `README.md` but still need the shared scaffold. The current guard rail wastes an early turn and makes an otherwise empty target feel harder to bootstrap than it really is.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Treat common seed docs as bootstrap-safe existing files.
- Objective 2: Preserve the non-empty-target guard rail for actual project content.
- Objective 3: Make the rejection message clearer about what Shipyard considers "safe existing entries."
- How this story or pack contributes to the overall objective set: This story removes a repeated early-turn waste case from the same greenfield path affected by the larger runtime issues.

## User Stories
- As an operator starting from a near-empty target, I want Shipyard to accept a directory that only contains `AGENTS.md` or `README.md` so I can bootstrap it in one step.
- As a maintainer, I want bootstrap to remain strict about real project content so Shipyard does not partially overwrite a target that already has meaningful files.

## Acceptance Criteria
- [ ] AC-1: `bootstrap_target` allows directories whose existing entries are limited to Shipyard or git metadata plus a narrow allowlist of seed docs that includes `AGENTS.md` and `README.md`.
- [ ] AC-2: `bootstrap_target` still rejects targets that contain additional project files, source directories, package manifests, or other non-allowlisted content.
- [ ] AC-3: Rejection messages clearly describe the difference between safe seed files and truly non-empty targets.
- [ ] AC-4: Focused tests cover the allowlisted seed-doc cases and representative rejection cases.

## Edge Cases
- Either seed doc can appear alone or together.
- Missing seed docs should still behave like the normal empty-target case.
- Additional hidden or nested files should still trigger rejection unless explicitly allowlisted.
- The allowlist should stay intentionally narrow so it does not become a generic "ignore whatever is there" escape hatch.

## Non-Functional Requirements
- Reliability: bootstrap should remain deterministic and should never partially scaffold on top of real project content.
- Maintainability: the allowlist should stay centralized next to the existing bootstrap guard rail.
- DX: error messages should tell the operator exactly why bootstrap was rejected.

## Out of Scope
- Broadening bootstrap to accept arbitrary documentation files.
- Changing scaffold generation itself.
- Adding a second bootstrap or overwrite workflow.

## Done Definition
- Near-empty targets seeded only with `AGENTS.md` and `README.md` bootstrap cleanly, while truly non-empty targets still fail fast.
