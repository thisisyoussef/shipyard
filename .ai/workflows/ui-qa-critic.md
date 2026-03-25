# UI QA Critic Workflow

**Purpose**: Run one lightweight, evidence-based critic pass after visible UI stories so the harness can catch human-facing copy, feedback, disclosure, and hierarchy issues before they harden into the next sequence.

---

## When To Run

Run this workflow when a story changes user-visible behavior in `web/` or in API-backed surfaces that materially affect what the user sees.

Common triggers:
- new or changed pages, panels, cards, dialogs, or embedded product surfaces
- changed interaction flows that should be reviewed visually on local or deployed surfaces
- changes to user-facing status, success, failure, or confirmation copy
- stories that complete a visible story pack and need one whole-pack audit artifact

Skip this workflow for:
- backend-only stories with no visible UI change
- trivial non-UI fixes
- pure docs stories unless they are closing a visible pack with a new pack-level audit checklist

---

## Step 1: Gather UI Proof

Use the best available visible surface:
1. sanctioned public demo when deployed
2. exact blocked deploy state if deployment is blocked
3. local browser proof if no deployed surface exists

Capture evidence with:
- exact route and click path
- screenshots when available
- story-level expected states
- any visible errors or friction

Prefer browser-visible evidence over code-only reasoning.

---

## Step 2: Run the Critic Pass

Review the visible UI with neutral, evidence-oriented wording.

Use the installed skill chain for structured evaluation:
- `.agents/skills/critique/SKILL.md` — visual hierarchy, information architecture, emotional resonance, discoverability, composition, typography, color, states, microcopy, anti-patterns
- `.agents/skills/audit/SKILL.md` — accessibility, performance, theming, responsive, anti-pattern audit
- `.agents/skills/fixing-accessibility/SKILL.md` — WCAG compliance check
- `.agents/skills/fixing-motion-performance/SKILL.md` — animation/rendering performance check

Focus on:
- clarity of system status
- obviousness of next actions
- whether primary user-facing copy uses user language instead of transport, endpoint, thread, or implementation jargon
- whether success, pending, and failure feedback matches confirmed mutation outcomes instead of optimistic local assumptions
- whether diagnostic or debug details stay behind progressive disclosure instead of dominating the main surface
- layout, hierarchy, scanability, and visual polish (use critique + audit skills for structured scoring)
- error visibility and recovery
- friction in the core task flow
- accessibility compliance (WCAG 2.2 AA minimum)
- animation performance (compositor-only transforms, reduced-motion support)

Do not turn this into an open-ended redesign exercise.

---

## Step 3: Publish the Critic Brief

Add a concise `QA Critic Brief` to working notes or handoff prep with:
- strengths that are working
- concrete findings
- severity and scope
- recommended improvements
- screenshot or route evidence

Keep findings specific and bounded.

---

## Step 4: Suggest Follow-On Stories

If the critic finds non-blocking improvements:
- suggest up to 3 follow-on stories
- append them to the tail of the active sequence or pack as suggested work
- keep them clearly marked as post-story or post-pack follow-ons
- do not auto-implement them without user approval

Suggested follow-ons should include:
- problem
- user-facing outcome
- why it is non-blocking

If the story closes a pack, use the critic findings plus shipped flows to update or create one pack-level `user-audit-checklist.md`.

---

## Step 5: Handoff Expectations

For visible UI stories:
- mention whether the UI QA critic ran
- include any non-blocking follow-on stories it suggested
- if the story completes a visible pack, include the pack-level audit checklist artifact in `Visible Proof`

The critic augments the current completion gate; it does not replace story-level UI inspection steps.

---

## Exit Criteria

- visible proof gathered
- critic brief created with neutral findings
- human-centered copy, feedback-trust, and debug-disclosure issues explicitly checked
- non-blocking follow-on stories suggested when warranted
- pack-level `user-audit-checklist.md` updated or created when a visible pack is completed
