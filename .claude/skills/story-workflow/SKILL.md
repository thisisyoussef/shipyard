---
name: story-workflow
description: Run the full story lifecycle for Shipyard — lookup, sizing, spec-driven delivery, TDD, handoff, and git finalization. Use when starting any non-trivial feature, bug fix, or change.
---

# Story Workflow

Execute the Shipyard story lifecycle for the given task.

## Phase 1: Preparation

1. Read the mandatory context chain:
   - `AGENTS.md`
   - `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
   - `shipyard/README.md`
   - `shipyard/CODEAGENT.md`
   - `.ai/memory/project/patterns.md`
   - `.ai/memory/project/anti-patterns.md`
   - `.ai/memory/session/active-context.md`

2. Create a fresh branch/worktree for this work. If the current worktree already has unrelated in-progress changes, start the story in a separate clean worktree instead of sharing the dirty tree.

## Phase 2: Story Lookup

Follow `.ai/workflows/story-lookup.md`:

1. **Define scope** — extract problem, acceptance criteria, integrations, constraints
2. **Local lookup** — read internal docs, patterns, edge-cases, references
3. **External lookup** — search official docs, get 2+ sources, 3+ takeaways
4. **Publish lookup brief** — summarize findings before any code
5. **Persist learnings** — update memory/references as warranted

## Phase 3: Story Sizing

Follow `.ai/workflows/story-sizing.md`:

- **Trivial**: single file, no API/schema/contract changes, no AI behavior changes → fast-track
- **Standard**: everything else → full spec-driven delivery

Publish the lane decision explicitly.

## Phase 4: Implementation (Standard Lane)

Follow `.ai/workflows/spec-driven-delivery.md`:

1. Constitution check (boundaries, gates)
2. Feature spec (problem, outcomes, acceptance criteria, edge cases)
3. Technical plan (modules, contracts, dependencies, risks)
4. Task breakdown (objectives, dependencies, validation)
5. TDD test list (mapped to acceptance criteria)

Then execute via `.ai/workflows/tdd-pipeline.md`:
- RED: write failing tests first
- GREEN: implement to pass
- REFACTOR: clean up, property tests, mutations

## Phase 5: Completion Gate

Follow `.ai/workflows/story-handoff.md`:

Deliver one completion packet with:
- Current Status
- Testing Brief (TDD evidence if applicable)
- Decision / Design Brief
- Docs / Diagrams (updated paths or explicit N/A)
- Visible Proof
- GitHub Status
- Completion Plan
- User Audit Checklist (Run This Now)

## Phase 6: Finalization

Follow `.ai/workflows/git-finalization.md`:

Unless user pauses: if unrelated WIP exists, isolate the story diff in a clean worktree/branch, rerun validation, then commit → push → PR → merge to `main` → cleanup.

## Validation (Run at Every Phase)

```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
