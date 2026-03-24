# Feature Development Workflow

**Purpose**: Implement a new feature from story to completion without assuming a language, framework, or deployment stack.

---

## Phase 0: Setup and Routing (Mandatory)

### Step 0.1: Sync and Branch for the Story
- Run:
  - `git fetch --all --prune`
  - `git status -sb`
  - `git branch -vv`
- If this is a new story, create or switch to a fresh `codex/<short-task-name>` branch before any edits.
- Do not continue a new story on the previous story's branch.

### Step 0.2: Run Story Preflight
- Run `agent-preflight`
- Deliver a concise preflight brief before edits

### Step 0.3: Run Story Lookup
- Run `.ai/workflows/story-lookup.md`
- Gather local + external guidance for the chosen stack/providers
- Publish the lookup brief before tests/code edits

### Step 0.4: Size the Story
- Run `.ai/workflows/story-sizing.md`
- Publish `lane: trivial` or `lane: standard`
- Trivial stories skip spec-driven delivery, eval-driven development, and the flight lock

### Step 0.5: Review Deployment Impact
- Check the story against the actual deployment contract documented in this repo before coding.
- If the repo does not yet define a live deployment surface for the touched code, record `deployment impact: none` or `deployment status: not configured`.
- If the story changes build, runtime, release, or environment behavior, update the relevant docs and automation in the same story.

### Step 0.6: Triage Narrow User Corrections
- If the user gives a small corrective note or clarification during the story, run `.ai/workflows/user-correction-triage.md`
- Classify blast radius before editing
- Keep the response bounded unless the correction materially changes scope or architecture

### Step 0.7: Standard-Lane Gates
If `lane: standard`:
- run `.ai/workflows/spec-driven-delivery.md`
- follow `.ai/skills/spec-driven-development.md`
- for UI stories, review `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
- for UI stories, apply `.ai/skills/frontend-design.md`
- for strategic or reusable UI work, create `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md`
- run `.ai/workflows/eval-driven-development.md` when prompts, tools, routing, retrieval, graders, or other AI behavior changes
- publish the eval brief before implementation
- run `.ai/workflows/parallel-flight.md`
- claim the single writer lock before edits

### Step 0.8: Trivial-Lane Rules
If `lane: trivial`:
- keep the change to the bounded surface named in the sizing brief
- go directly to focused TDD or the mechanical edit
- do not backdoor spec/eval/lock work into the story mid-flight; re-size instead if scope grows

---

## Phase 1: Clarify the Story

### Step 1: Confirm Scope
- Goal and user outcome
- Acceptance criteria
- Edge cases and non-goals
- Affected modules, services, or screens

### Step 2: Confirm Project-Specific Context
- Source directories chosen during setup
- Test directories chosen during setup
- Validation commands chosen during setup
- Deployment/runtime targets chosen during setup

Do not assume defaults that have not been recorded.

---

## Phase 2: Design

### Step 3: Create the Smallest Viable Design
- Map affected modules and interfaces
- Reuse existing patterns where possible
- Keep boundaries explicit
- For UI scope, define typography/layout/color/motion constraints, not vague design adjectives

### Step 3.5: Establish an Inspectable UI Surface Early
- For stories that change visible product behavior, establish or extend the minimum inspectable UI surface early in the implementation sequence.
- Prefer landing an inspectable route, panel, or state before deeper backend expansion so the user can monitor behavior visually on the sanctioned demo as stories merge.
- Do not leave the first visible proof to the end of the story if an earlier thin UI slice can make progress reviewable.

### Step 4: Define Test Plan
- Unit behavior
- Integration boundaries
- End-to-end or smoke path
- Error and edge cases
- Eval coverage for AI stories
- For visible UI scope, define:
  - primary user-facing copy expectations,
  - truthful success/pending/failure feedback behavior,
  - whether technical diagnostics belong behind progressive disclosure

---

## Phase 3: Implement with TDD

### Step 5: Run the TDD Pipeline
- Run `.ai/workflows/tdd-pipeline.md` for stories that change tests plus production code
- Initialize file handoff state with `bash scripts/tdd_handoff.sh init --story ... --spec ...`
- Decide whether the story requires property tests and targeted mutation testing before implementation starts

### Step 6: RED -> GREEN -> REFACTOR Through the Pipeline
- Agent 1: write the smallest failing behavior contract from the spec and public API surface only
- Agent 2: implement the minimum code to pass without editing Agent 1 tests
- Agent 3: review/refactor while keeping the suite green
- Use `bash scripts/tdd_handoff.sh check ...` for RED/GREEN enforcement

---

## Phase 4: Validate

### Step 8: Run Validation Gates
Run the project-specific commands defined during setup and required by the active workflow.

### Step 9: Run Additional Checks as Needed
- Integration or smoke tests for touched boundaries
- Eval comparison for AI behavior changes
- Accessibility and visual regression for UI work
- Performance checks if the feature changes critical paths

### Step 9.5: Run the UI QA Critic for Visible Stories
- If the story changed visible UI behavior, run `.ai/workflows/ui-qa-critic.md`
- Capture a small evidence-based critic brief from the best available visible surface
- Check whether primary copy uses user language, whether mutation feedback reflects confirmed outcomes, and whether debug details stay secondary
- If the critic finds non-blocking improvements, suggest follow-on stories at the tail of the active sequence instead of silently expanding the current story
- If the story closes a visible pack, update or create the pack-level `user-audit-checklist.md`

---

## Phase 5: Completion

### Step 10: Update Docs and Memory
- Update SSOT if the project state changed
- Record durable patterns or decisions
- Update design decisions when UI tradeoffs were made
- Record deployment impact review outcome
- For completed visible packs, update the pack-level `user-audit-checklist.md`

### Step 11: Run the Combined Completion Gate
- Run `.ai/workflows/story-handoff.md`
- Include the finalization plan in the same packet as the user audit checklist
- If a standard-lane flight lock was claimed, release it when the story is paused, blocked, or complete
- After user approval, run `.ai/workflows/git-finalization.md`

---

## Exit Criteria

- Spec artifacts are current when the story used the standard lane
- Tests prove the delivered behavior
- Validation gates pass
- Relevant docs/memory are updated
- Combined completion gate delivered
