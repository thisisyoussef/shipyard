# Design Philosophy and Design Language (Shipyard Workspace)

This is a living document defining the beliefs, values, and aesthetic principles for this workspace.

It sits upstream of the design system, constitution/spec artifacts, and component specs.
It answers: what should the product feel like, and why?

---

## How This Fits The Workflow

```
Design Philosophy and Language
  -> informs
Design System (tokens, components, patterns)
  -> referenced by
Constitution -> Spec -> Plan -> Tasks -> TDD -> Code
```

For AI agents:
- you usually use component specs and tokens directly,
- when multiple valid UI decisions exist, this document is the tiebreaker.

---

## Part 1: Core Beliefs (Priority Ordered)

### Belief 1: Calm Over Clever
We design for sustained focus, not momentary visual novelty.
This means:
- low-noise layouts,
- functional motion only,
- controlled color accents.
This does not mean:
- sterile or lifeless interfaces.

### Belief 2: Earned Complexity
Power exists, but appears through progressive disclosure.
This means:
- clean default state,
- advanced controls one intentional step away.
This does not mean:
- hiding expert capability.

### Belief 3: Structure Is Freedom
Predictable patterns reduce cognitive load and increase user confidence.
This means:
- consistent interaction behavior,
- stable navigation semantics,
- repeatable component contracts.
This does not mean:
- identical-looking screens with no contextual variation.

### Belief 4: Honest Interfaces
The product must never mislead users about state, confidence, or limits.
This means:
- visible system state,
- clear error and empty-state guidance,
- explicit uncertainty and fallback messaging.
This does not mean:
- warning-heavy, noisy UI.

---

## Part 2: Design Principles

### 1. Content First: Substance over chrome
Data and user output dominate attention; interface chrome is subordinate.

### 2. Progressive Disclosure: Simplicity now, power later
Default screens serve common actions; advanced features are discoverable but not overwhelming.

### 3. Predictable Motion: Functional over decorative
Animation must communicate state, causality, or spatial relation.

### 4. Typography as Architecture: Hierarchy over ornament
Structure is primarily communicated through type and whitespace.

### 5. Accessible by Default: Inclusion over retrofit
Keyboard, contrast, and semantic feedback are baseline requirements.

### 6. Contextual Density: Breathable for browse, compact for execution
Information density adapts to user mode without breaking pattern consistency.

### 7. Prevention over Recovery: Guide before correcting
Prevent avoidable errors through defaults and validation; provide clear recovery when failures occur.

---

## Part 3: Visual Language

### 3.1 Personality

| Trait | What it looks like |
|---|---|
| Confident | Clear hierarchy, one dominant action per view |
| Warm | Humane copy, measured roundness, balanced whitespace |
| Focused | Limited accent color use, minimal visual noise |
| Reliable | Consistent pattern behavior, explicit system status |

### 3.2 Mood and Atmosphere

Color philosophy:
- calm and professional base palette,
- accents reserved for interactivity, status, and urgency,
- no decorative saturation spikes.

Typography philosophy:
- legible baseline size and rhythm,
- hierarchy from size/weight/spacing, not heavy boxes,
- restrained weight count for clarity and performance.

Spatial philosophy:
- consistent scale (8px with optional 4px sub-steps),
- generous default whitespace,
- denser layouts only for explicit execution contexts.

Motion philosophy:
- mostly 100-400ms transitions,
- entrance usually slower than exit,
- honor reduced-motion preference.

Iconography philosophy:
- functional icons supporting text,
- icon-only controls only with accessible label/tooltip,
- icons never sole carrier of meaning.

### 3.3 What We Avoid

| We avoid | Because | Instead |
|---|---|---|
| Decorative motion | Increases extraneous load | Functional transitions tied to state change |
| Heavy visual effects | Competes with content | Subtle depth and strong typography |
| Unbounded font variety | Creates noise and cost | Strict family/weight constraints |
| Color-only state signals | Accessibility risk | Color + icon/text combined signaling |
| Surprise UI behavior | Breaks trust | Predictable interactions and status feedback |

---

## Part 4: Interaction Language

### 4.1 Feedback Patterns

| Action | Feedback | Timing |
|---|---|---|
| Primary action click | Pressed state + immediate response | <100ms |
| Form submit | Loading state + disabled unsafe repeats | Immediate, result target <2s |
| Delete/critical mutation | Visible transition + undo when safe | ~200ms transition, bounded undo window |
| Error | Inline actionable message near source | Immediate and persistent |
| Long operation | Skeleton/progress state | Show meaningful progress around ~500ms |

### 4.2 Navigation Philosophy

- Prefer shallow, predictable navigation for major flows.
- Keep user orientation clear with stable landmarks.
- Keep back-navigation behavior consistent with platform expectations.

### 4.3 Data Density Philosophy

- Default to scan-friendly summaries.
- Reveal detail contextually (expand, drill-down, side panel).
- Preserve dense-mode options for expert workflows.

---

## Part 5: Design Decisions Log

Use this table as precedent (case law) for future ambiguity:

| Date | Decision | Rationale | Principle |
|---|---|---|---|
| 2026-03-04 | Use progressive metadata disclosure in query UI | Keeps default answer flow calm while preserving expert depth | Progressive Disclosure |
| 2026-03-04 | Prefer evidence-first cards over decorative containers | Reinforces trust and grounding | Honest Interfaces |
| 2026-03-04 | Keep Phase 4 gate controls inside collapsible console with explicit run/blocker text | Preserves low-noise default state while making release risk visible on demand | Earned Complexity + Honest Interfaces |
| 2026-03-24 | Keep helper-harness guidance visually secondary to product implementation guidance | Prevents scaffolding from overshadowing the actual product surface while keeping repo navigation calm and clear | Typography as Architecture + Calm Over Clever |
| YYYY-MM-DD | ... | ... | ... |

When making meaningful UI tradeoffs, add a row in the story handoff.

---

## Part 6: Influences

Foundational influences:
- Dieter Rams (functional minimalism)
- Apple HIG (clarity, deference, depth)
- Material Design (motion and systemized tokens)
- Edward Tufte (signal over decoration)
- Nielsen Norman Group (heuristics, interaction research)

---

## Part 7: AI Agent Usage Rules

When implementing UI:
1. Read component spec first.
2. Use design-system tokens/components.
3. If ambiguous, apply this philosophy as tie-breaker.
4. Prefer existing patterns over invention.
5. Log non-obvious UI decisions in the design decisions log.
6. Use `.ai/skills/frontend-design.md` to turn vague taste words into concrete implementation constraints before coding.

Decision heuristic:

```
1) Spec says what to do? -> follow spec.
2) Token/pattern exists? -> use it.
3) Principle applies? -> follow principle.
4) Precedent exists? -> follow precedent.
5) Still ambiguous? -> choose simpler option and flag for review.
```

---

## Appendix B: Anti-Mediocrity Prompting for UI

When prompting an agent for frontend work, do not rely on generic phrases like:
- "make it nice",
- "make it modern",
- "make it clean".

Those prompts pull the model toward average web output.

Instead, specify:
- one strong visual direction,
- typography roles,
- whitespace/layout strategy,
- semantic color/material system,
- motion behavior,
- concrete anti-patterns to avoid.

Examples:

### Weak
- "Build a nice landing page."

### Stronger
- "Build an editorial landing page with serif-led headlines, generous negative space, asymmetrical composition, restrained neutral palette, soft paper-like depth, and no generic SaaS card grid."

Translate emotional adjectives into implementation rules:
- "premium" -> thin borders, restrained palette, precise spacing, subtle depth
- "technical" -> monospace accents, denser data framing, sharper contrast
- "warm" -> softer neutrals, humane spacing, approachable curvature

The goal is not novelty for its own sake. The goal is to avoid default-average UI when the product needs a stronger point of view.

For more structured UI prompting, use WIRE:
- Who and What
- Input Context
- Rules and Constraints
- Expected Output

Use the fuller WIRE+FRAME form when the prompt is strategic, reusable, or multi-step:
- Flow of tasks
- Reference voice/style
- Ask for clarification
- Memory
- Evaluate and iterate

Use `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md` when that structure should live as a story artifact.

---

## Appendix A: Rams-Inspired Self-Assessment

Score 1-5 periodically:
- useful,
- understandable,
- unobtrusive,
- honest,
- thorough,
- as-little-design-as-possible.

Track trends, not one-off scores.

---

## Appendix B: Research Foundations

Primary concepts used by this philosophy:
- Miller's Law
- Hick's Law
- Fitts's Law
- Cognitive Load Theory
- Gestalt principles (especially proximity/similarity/figure-ground)
- Jakob's Law
- Nielsen response-time thresholds
- WCAG 2.2 accessibility requirements

Key references:
- https://www.nngroup.com/articles/design-principles/
- https://www.nngroup.com/articles/response-times-3-important-limits/
- https://www.nngroup.com/articles/animation-duration/
- https://www.w3.org/TR/WCAG22/
- https://developer.apple.com/design/human-interface-guidelines/
- https://m3.material.io/
- https://lawsofux.com/

This artifact should be reviewed and refined regularly as product direction evolves.
