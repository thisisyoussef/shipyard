# Technical Plan

## Metadata
- Story ID: UIR-S02
- Story Title: Activity and Diff Experience Overhaul
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - activity feed components
  - diff rendering components
  - event grouping and filtering logic
- Public interfaces/contracts:
  - no changes to the event schema
  - no changes to tool execution
- Data flow summary: activity and diff components consume the same event payloads with improved presentation rules.

## Architecture Decisions

- Decision: use consistent card layouts for tool calls and results.
- Decision: normalize diff rendering into a single component with clear line semantics.
- Rationale: consistency improves trust and reduces cognitive load.

## Dependency Plan

- Existing dependencies used: the frontend stack from Phase Pre-2.
- New dependencies proposed: none.

## Implementation Notes

- Introduce a small activity model to map raw events to display-ready metadata.
- Use explicit labels for added/removed lines so color is not the only cue.
- Cap very large diffs with a “show more” control.

## Test Strategy

- Manual: run the local UI smoke test with a multi-tool instruction and verify readability.
- UI QA critic: focus on clarity of status and diff accuracy.

## Rollout and Risk Mitigation

- Rollback strategy: keep old components available behind a flag until parity is confirmed.
- Observability: ensure error and retry events remain visible.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
