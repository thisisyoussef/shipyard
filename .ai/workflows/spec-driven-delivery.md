# Spec-Driven Delivery Workflow

**Purpose**: Translate intent into executable engineering work using a consistent SDD contract before TDD implementation.

Reference:
- `.ai/docs/research/spec-driven-tdd-playbook.md`
- `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
- `.ai/skills/frontend-design.md`
- `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md`
- UI skill chain: see `.ai/codex.md` → "UI Skill Chain" section

---

## When To Run

Run this workflow before implementing:
- new features,
- significant behavior changes,
- architecture-impacting refactors.

For bug fixes, run at least a lightweight spec update (scope, expected behavior, regression criteria).

---

## Step 1: Constitution Check

Use `.ai/templates/spec/CONSTITUTION_TEMPLATE.md`.

Confirm the story does not violate:
- architecture boundaries,
- quality gates,
- security constraints,
- performance constraints.

Record any required exception explicitly.

---

## Step 2: Specify (What and Why)

Create/update feature spec from:
- `.ai/templates/spec/FEATURE_SPEC_TEMPLATE.md`

Must include:
- problem statement,
- user-facing outcomes,
- acceptance criteria,
- edge cases,
- out-of-scope.

Do not include implementation details in this step.

If UI is in scope, explicitly map feature intent to:
- design beliefs,
- design principles,
- existing design decisions precedent.
Then apply the UI skill chain (Phase 1: Design Direction from `.ai/codex.md`) to translate desired mood into concrete:
- typography roles,
- spacing/layout strategy,
- semantic color/material rules,
- motion constraints,
- anti-patterns to avoid.
Also define:
- primary user-facing copy rules,
- action-feedback truth rules,
- diagnostic/debug disclosure policy.
Use `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md` when the UI prompt needs WIRE or WIRE+FRAME structure for reuse or multi-step direction.

If AI behavior is in scope, explicitly define:
- the nondeterministic behavior being changed,
- the eval objective for that behavior,
- the failure modes that must be caught before release.

If this work is a story pack, phase pack, or multi-story foundation plan, also define:
- the higher-level objectives of the full pack,
- the boundaries between stories in the pack,
- the full set of intended stories before implementation starts.

Do not draft one story in isolation and invent the rest later if the work is clearly a coordinated pack.

---

## Step 3: Plan (How)

Create/update technical plan from:
- `.ai/templates/spec/TECHNICAL_PLAN_TEMPLATE.md`

Must include:
- module/API design,
- data contracts,
- dependency boundaries,
- risk and fallback strategy,
- testing strategy.

For AI-behavior stories, also include:
- evaluator strategy,
- dataset sources/slices,
- thresholds or baseline comparison method,
- regression/continuous-eval plan.

For story packs, also include:
- why the pack is sequenced the way it is,
- how the stories fit together without gaps or overlap,
- what must be true for the whole pack to be considered successful.

---

## Step 4: Task Breakdown

Create/update executable tasks from:
- `.ai/templates/spec/TASK_BREAKDOWN_TEMPLATE.md`

Each task must have:
- objective,
- dependency label (`must-have`, `parallel`, `blocked-by`),
- validation command/output.

For story packs:
- write all story-level tasks for the pack in one pass,
- keep the story set cohesive and comprehensive,
- verify each story advances at least one higher-level pack objective.
- reserve a tail position for non-blocking QA-critic follow-ons when the pack contains visible UI work

---

## Step 5: TDD Test List From Spec

Derive tests directly from acceptance criteria:
- one behavioral test group per criterion,
- explicit edge-case tests,
- explicit failure-path tests.

Store this mapping in story notes or task checklist.

Also define the TDD pipeline contract before coding:
- the public API surface Agent 1 may see,
- the handoff artifact path `.ai/state/tdd-handoff/<story-id>/`,
- whether property tests are required,
- whether targeted mutation testing should run,
- the focused RED/GREEN command the story will use.

For UI scope, also define:
- behavior tests (component interactions + a11y),
- visual regression snapshot matrix,
- E2E flow coverage for critical screens.
- Include user-facing copy and feedback-trust assertions when the UI performs mutations or shows system state.

For AI-behavior scope, also define:
- metric-based checks where possible,
- pairwise or pass/fail grading rubric where needed,
- human-calibration plan for automated scoring.

---

## Step 6: Alignment Gate (Before Coding)

Before writing implementation code, confirm:
- spec exists and is current,
- plan exists and is current,
- tasks are executable and ordered,
- tests are mapped to acceptance criteria.
- for story packs, higher-level pack objectives are defined and every planned story maps back to them.

If not aligned, stop and update artifacts first.

For UI scope, also confirm:
- component spec references design philosophy where ambiguity exists,
- frontend-design skill constraints are reflected in the UI component spec,
- UI prompt brief exists when the design prompt needs reusable or multi-step structure,
- any intentional tradeoff is logged in design decisions.

---

## Step 7: Execution Loop

For each task:
1. Run `.ai/workflows/tdd-pipeline.md`
2. Agent 1 writes failing tests from the spec-derived contract
3. Agent 2 delivers the minimal passing implementation
4. Agent 3 reviews/refactors without changing behavior
5. Verify against spec before moving to next task

---

## Step 8: Spec Sync at Handoff

At story handoff:
- update spec artifacts to match delivered behavior,
- mark deferred scope explicitly,
- attach artifact paths in handoff checklist.
- when a visible pack is completed, update or create the pack-level `user-audit-checklist.md`
- when `.ai/workflows/ui-qa-critic.md` suggested non-blocking follow-ons, append them at the tail of the active sequence or pack as suggested work

---

## Exit Criteria

- Constitution check complete
- Feature spec complete
- Technical plan complete
- Task breakdown complete
- Test mapping complete
- Implementation executed via TDD
- Handoff references final spec artifacts
- UI stories reference design philosophy and record major design tradeoffs
