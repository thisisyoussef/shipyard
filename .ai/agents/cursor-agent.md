# Cursor Agent - Shipyard Workspace Entry Guide

## Purpose
Ensure Cursor follows the same orchestration contract as Claude and Codex.

## Required Startup Order
1. Read `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
2. Read `.ai/codex.md` (canonical orchestrator)
3. Read `.ai/agents/claude.md` (compatibility mirror)
4. Route to the correct workflow in `.ai/workflows/`
5. Use specialist agents in `.ai/agents/` for task-specific execution

## New Story Preflight Gate (Required)
Before starting any new story:
1. Run `agent-preflight`
2. Deliver concise preflight brief
3. If the current worktree already has unrelated WIP, start the story in a clean worktree/branch before implementation
4. Only then begin implementation

## Spec-Driven Package Gate (Required for Feature Stories)
Before tests/code edits for features:
1. Run `.ai/workflows/spec-driven-delivery.md`
2. Follow `.ai/skills/spec-driven-development.md`
3. Review `.ai/docs/research/spec-driven-tdd-playbook.md`
4. For UI scope, review `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
5. Create/update artifacts under `.ai/templates/spec/`
   - constitution check
   - feature spec
   - technical plan
   - task breakdown
   - UI component spec (when UI scope exists)
   - `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md` (when UI prompting needs explicit structure or reuse)
6. For UI scope, apply `.ai/skills/frontend-design.md` before implementation

## Story Lookup Gate (Required)
Before implementing any story:
1. Run `.ai/workflows/story-lookup.md`
2. Complete local + external docs lookup
3. Deliver concise lookup brief before tests/code edits

## Story Sizing Gate (Required)
After story lookup and before implementation planning:
1. Run `.ai/workflows/story-sizing.md`
2. Publish `lane: trivial` or `lane: standard`
3. Skip spec/eval/flight only when the workflow says the story is truly trivial

## User Correction Triage Gate (Required for Narrow Corrections)
If the user gives a targeted corrective note or clarification during the story:
1. Run `.ai/workflows/user-correction-triage.md`
2. Classify the blast radius before editing
3. Keep the fix bounded unless the correction materially changes scope or architecture

## Eval-Driven Gate (Required for AI-Behavior Changes)
Before changing prompts, retrieval, tools, routing, handoffs, graders, or model-facing output behavior:
1. Run `.ai/workflows/eval-driven-development.md`
2. Define eval objective, dataset slices, metrics, and thresholds
3. Deliver concise eval brief before tests/code edits

## TDD Pipeline Gate (Required for Behavior Changes)
Before implementing stories that change tests plus production code:
1. Run `.ai/workflows/tdd-pipeline.md`
2. Initialize file handoff state with `bash scripts/tdd_handoff.sh init --story ... --spec ...`
3. Use `.ai/agents/tdd-spec-interpreter.md`, `.ai/agents/tdd-implementer.md`, and `.ai/agents/tdd-reviewer.md`
4. Enforce RED/GREEN checks with `bash scripts/tdd_handoff.sh check ...`
5. Run `bash scripts/run_targeted_mutation.sh ...` when the workflow requires mutation testing

## UI QA Critic Gate (Required for Visible UI Stories)
After validation for visible UI stories:
1. Run `.ai/workflows/ui-qa-critic.md`
2. Check for human-centered copy, truthful action feedback, and debug-detail containment
3. Suggest only tail-end non-blocking follow-on stories

## Flight Lock Coordination (Standard Lane Only)
Before implementation edits for a standard-lane story:
1. Run `.ai/workflows/parallel-flight.md`
2. Claim slot with `bash scripts/flight_slot.sh claim ...`
3. Use the single writer lock only; trivial-lane stories skip it

## Git Finalization Gate (Required)
1. Use `.ai/workflows/story-handoff.md` as the combined completion gate
2. Unless the user explicitly asks to pause or use a different merge path, run `.ai/workflows/git-finalization.md` after the completion gate
3. If the current worktree contains unrelated WIP, preserve it and isolate the story diff in a clean branch/worktree instead of stopping at local validation
4. Run the repo's finalization guard when it exists; otherwise run the required validation commands plus `git diff --check`. If finalization fails, route to `.ai/workflows/finalization-recovery.md`

## Task Routing
- Feature: `.ai/workflows/feature-development.md`
- Bug fix: `.ai/workflows/bug-fixes.md`
- Performance: `.ai/workflows/performance-optimization.md`
- Security: `.ai/workflows/security-review.md`
- Deployment: `.ai/workflows/deployment-setup.md`
- TDD execution: `.ai/workflows/tdd-pipeline.md`
- Git finalization: `.ai/workflows/git-finalization.md`
- Flight lock coordination: `.ai/workflows/parallel-flight.md`
- AI architecture/orchestrator: `.ai/workflows/ai-architecture-change.md`
- Story lookup: `.ai/workflows/story-lookup.md`
- Story sizing: `.ai/workflows/story-sizing.md`
- Narrow user correction triage: `.ai/workflows/user-correction-triage.md`
- Eval-driven development: `.ai/workflows/eval-driven-development.md`
- Spec-driven delivery: `.ai/workflows/spec-driven-delivery.md`
- Story handoff: `.ai/workflows/story-handoff.md`
- UI QA critic: `.ai/workflows/ui-qa-critic.md`
- Finalization recovery: `.ai/workflows/finalization-recovery.md`
- Frontend design skill (UI only): `.ai/skills/frontend-design.md`

## Quality Gates
Follow `.ai/codex.md`, `.claude/CLAUDE.md`, and the active workflow for the current validation command set before any commit.

## Shared Standards
Cursor must follow the same standards in:
- `.ai/skills/tdd-workflow.md`
- `.ai/skills/spec-driven-development.md`
- `.ai/skills/code-standards.md`
- `.ai/skills/security-checklist.md`
- `.ai/skills/performance-checklist.md`

## Memory Bank Updates
Follow `.ai/codex.md` for the standard memory-update set after work.

## Post-Story User Audit Handoff (Required)
After each story completion, follow `.ai/workflows/story-handoff.md`, include a **User Audit Checklist (Run This Now)** plus the finalization plan, run `.ai/workflows/ai-architecture-change.md` when needed, release `bash scripts/flight_slot.sh` when a standard-lane lock was claimed, and unless the user explicitly pauses finalization, continue into `.ai/workflows/git-finalization.md`.
If the story changed visible UI behavior, run `.ai/workflows/ui-qa-critic.md`; if the story completed a visible pack, include or reference the pack-level `user-audit-checklist.md`.
