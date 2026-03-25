# Design Phase Workflow

**Purpose**: Produce a concrete, implementable UI design brief between spec and TDD so the implementer has a clear visual target instead of inventing design decisions under test pressure.

```
spec-driven-delivery → design-phase → tdd-pipeline → validation
     (what/why)        (how it looks)   (how it works)   (did it work)
```

---

## When To Run

Run this workflow for every story that touches user-visible UI. This includes:
- new pages, panels, components, or dialogs,
- visual redesigns or layout changes,
- interaction flow changes,
- motion and animation work,
- stories that add or change user-facing copy.

Skip only for:
- backend-only stories with zero UI surface,
- pure token/config changes with no visual impact,
- trivial bug fixes where the correct visual is obvious.

---

## Inputs

- Completed feature spec from `spec-driven-delivery.md`
- Design philosophy: `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
- Existing token system: `shipyard/ui/src/tokens/`
- Existing components: `shipyard/ui/src/primitives.tsx` and extracted components
- Refero workflow reference: `.ai/docs/references/refero-mcp.md`

## Default Execution

Codex should treat the repo bridge below as the default way to start design work for every visible UI story:

```bash
node scripts/generate-design-brief.mjs --story <story-id>
```

Notes:
- The script auto-discovers `feature-spec.md` under `shipyard/docs/specs/**/<story-id>/` when possible.
- Use `--spec <path>` when auto-discovery is ambiguous.
- Use `--context-path <path>` to include extra files or directories in the prompt.
- The bridge writes `.ai/state/design-brief/<story-id>/brief.md`.
- The bridge is Claude-first by default, uses Refero for brainstorming/reference research when configured, and falls back to Codex only when Claude is unavailable or returns an error.

After the initial draft is written, continue the full review/refinement loop below rather than treating the first output as final by default.

---

## Output

A design brief saved to `.ai/state/design-brief/<story-id>/brief.md` containing:
- reference research (real-product screens/flows, what to borrow, what to avoid)
- visual direction and mood
- component inventory (new components, modified components)
- token selections (which existing tokens to use, any new tokens needed)
- layout decisions (grid structure, spacing, responsive behavior)
- typography decisions (which type scale steps, heading/body/mono assignments)
- color decisions (which semantic colors, any new tones)
- motion plan (entrance, transitions, micro-interactions, timing)
- copy direction (tone, key labels, error/empty state messaging)
- accessibility requirements (focus order, ARIA roles, contrast)
- anti-patterns to avoid (specific to this story)
- responsive breakpoint behavior

The design brief is **allowed context** for TDD Agent 2 (implementer) and Agent 3 (reviewer).

---

## Step 1: Understand — Read the Landscape

Before making any design decisions, understand what exists.

**Skills invoked:**
- `extract` — scan existing codebase for reusable patterns, components, and tokens
- `normalize` — audit current UI for design drift and inconsistency

**Actions:**
0. If the brief does not exist yet, generate the first draft with `node scripts/generate-design-brief.mjs --story <story-id>` before refining it.
0.5. When Refero is configured, verify the draft includes a useful reference-research section before refining the rest of the brief.
1. Read the feature spec's acceptance criteria and UI requirements.
2. Run `extract` on the affected UI surface to catalog existing patterns.
3. Run `normalize` to identify any design drift in the area being modified.
4. Document: what patterns exist, what can be reused, what needs to change.

**Output:** landscape assessment in the design brief.

---

## Step 2: Define — Set the Visual Direction

Establish the aesthetic and interaction direction before any component decisions.

**Skills invoked:**
- `frontend-design` — set visual direction, avoid AI slop, translate taste into constraints
- `interface-design` — dashboard/panel/tool-specific interface patterns
- `emil-design-eng` — taste, unseen details, animation decision framework
- `baseline-ui` — enforce Tailwind/component baseline standards

**Actions:**
1. Run `frontend-design` to establish the visual direction for this story.
2. Run `interface-design` to identify relevant dashboard/tool patterns.
3. Run `emil-design-eng` to identify the unseen details that make this feel premium.
4. Run `baseline-ui` to verify the direction respects component standards.
5. Document: visual direction, mood, personality traits, references.

**Output:** visual direction section in the design brief.

---

## Step 3: Compose — Make Concrete Design Decisions

Turn the visual direction into specific, implementable decisions.

**Skills invoked (in order):**
- `clarify` — define all user-facing copy, labels, error messages, empty states
- `distill` — ruthlessly simplify; remove anything unnecessary
- `typeset` — select type scale steps, font weights, line heights for each element
- `colorize` — select semantic colors, define any new tones needed
- `arrange` — define layout grid, spacing rhythm, visual hierarchy, depth
- `adapt` — define responsive behavior at all breakpoints (1440, 1024, 768, 375)

**Actions:**
1. Run `clarify` on all user-facing text in the story's scope. Define labels, placeholder text, error messages, empty states, success/failure feedback.
2. Run `distill` on the proposed component structure. Remove anything that doesn't directly serve the user's task. Apply progressive disclosure.
3. Run `typeset` to assign type scale tokens to every text element (headings, body, captions, mono). Define weight and spacing.
4. Run `colorize` to assign semantic color tokens. Identify if new tokens are needed.
5. Run `arrange` to define the spatial structure: grid layout, gap sizes, padding, margins, alignment, visual rhythm.
6. Run `adapt` to define how the design responds at each breakpoint. Document what collapses, stacks, or hides.

**Output:** component inventory, token selections, layout/type/color/responsive decisions in the design brief.

---

## Step 4: Animate — Define the Motion Plan

Design motion separately from layout so it's intentional, not afterthought.

**Skills invoked:**
- `animate` — entrance, micro-interactions, state transitions, timing
- `delight` — personality moments, celebrations, Easter eggs (use sparingly)
- `quieter` — if the motion plan feels too aggressive, refine for sophistication

**Actions:**
1. Run `animate` to define entrance animations, state transitions, and micro-interactions for each component.
2. Run `delight` to identify 1-2 moments where personality can shine (success states, first-use, completions).
3. Run `quieter` to evaluate whether any motion decisions are too intense for a developer tool context.
4. Verify all planned animations are compositor-only (transform, opacity).
5. Define `prefers-reduced-motion` behavior for every animation.

**Output:** motion plan section in the design brief.

---

## Step 5: Harden — Edge Cases and Resilience

Think through what happens when things go wrong or get weird.

**Skills invoked:**
- `harden` — edge case handling, error resilience, i18n readiness
- `onboard` — first-run experience, empty states, contextual help

**Actions:**
1. Run `harden` on the proposed design: what happens with long text, missing data, error states, slow connections, large datasets?
2. Run `onboard` on any first-use or empty states in the story's scope: does the user know what to do?
3. Document edge case behavior for each component.

**Output:** edge cases and resilience section in the design brief.

---

## Step 6: Review — Self-Critique Before Handoff

Evaluate the design brief against the skill chain's quality bar before handing it to the implementer.

**Skills invoked:**
- `critique` — structured design evaluation across all dimensions
- `normalize` — verify the brief's decisions align with the existing design system

**Actions:**
1. Run `critique` on the complete design brief. Score against: visual hierarchy, information architecture, emotional resonance, discoverability, composition, typography, color, states, microcopy.
2. Run `normalize` to verify all token selections, component names, and patterns match the existing system.
3. Fix any high-severity findings before proceeding.
4. If the critique scores below 7 on any dimension, revise and re-critique.

**Output:** critique scores appended to the design brief. Brief is finalized.

---

## Step 7: Publish the Design Brief

Save the finalized brief and make it available to the TDD pipeline.

```bash
mkdir -p .ai/state/design-brief/<story-id>
# Write brief.md to this directory
```

The brief becomes **allowed context** for:
- `tdd-pipeline.md` Agent 2 (implementer) — reads the brief to guide CSS/component decisions
- `tdd-pipeline.md` Agent 3 (reviewer) — reviews implementation against the brief
- `ui-qa-critic.md` — evaluates the shipped result against the design intent

---

## Skill Invocation Summary

All 27 installed skills are now wired. Here's when each fires during the design phase:

| Step | Skills | Purpose |
|---|---|---|
| 1. Understand | `extract`, `normalize` | Catalog existing patterns, find design drift |
| 2. Define | `frontend-design`, `interface-design`, `emil-design-eng`, `baseline-ui` | Set visual direction |
| 3. Compose | `clarify`, `distill`, `typeset`, `colorize`, `arrange`, `adapt` | Make concrete decisions |
| 4. Animate | `animate`, `delight`, `quieter` | Define motion plan |
| 5. Harden | `harden`, `onboard` | Handle edge cases |
| 6. Review | `critique`, `normalize` | Self-critique before handoff |

Skills invoked later in the workflow (not in design phase):
| Workflow Step | Skills | Purpose |
|---|---|---|
| TDD Agent 2 (implement) | `typeset`, `colorize`, `arrange`, `animate`, `bolder` | Guide CSS/component coding |
| TDD Agent 3 (review) | `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance` | Quality gate |
| Validation | `audit`, `fixing-accessibility`, `fixing-motion-performance` | Compliance |
| Final polish | `polish`, `overdrive` | Pack-closing refinement |
| On-demand | `optimize`, `fixing-metadata` | Performance and metadata |

---

## Exit Criteria

- Design brief exists at `.ai/state/design-brief/<story-id>/brief.md`
- Reference research is included or the absence of Refero is explicitly called out
- All 6 steps completed
- Critique scores 7+ on all dimensions (or findings addressed)
- Token selections reference existing tokens (no invented names)
- Motion plan is compositor-only with reduced-motion fallbacks
- Responsive behavior defined for all 4 breakpoints
- Edge cases and empty states documented
- Brief is published and available to TDD pipeline
