# Frontend Design Skill

## Purpose
Use this skill to break generated UI out of statistical mediocrity.

Most AI-generated frontend work collapses toward the average of the web:
- one safe sans-serif everywhere,
- crowded sections,
- flat colors,
- generic card grids,
- weak hierarchy.

This skill forces a specific visual direction and translates taste into code-level constraints the agent can actually execute.

Reference guidance:
- `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
- `.ai/templates/spec/UI_COMPONENT_SPEC_TEMPLATE.md`
- `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md`

---

## When to Use

Use this skill when:
- building a new page or component with meaningful UI scope,
- redesigning an existing interface,
- the output feels generic, flat, or "template-like",
- the task needs a distinct mood, brand personality, or stronger visual hierarchy.

Do not use this skill for:
- non-UI backend work,
- tiny cosmetic fixes with no design implications,
- mature design systems where the task is purely implementation fidelity.

If working inside an established design system, preserve the system and use this skill only to improve clarity, hierarchy, and composition within its boundaries.

---

## Core Rules

1. Never prompt with only "make it look good", "clean", or "modern".
2. Choose one strong visual direction instead of averaging multiple aesthetics.
3. Translate taste into implementation constraints:
   - typography roles,
   - spacing scale,
   - layout pattern,
   - color semantics,
   - depth/material cues,
   - motion behavior.
4. Treat whitespace as a design element, not leftover space.
5. Prefer semantic color systems over raw hex choices.
6. Avoid default-safe output unless the product explicitly calls for restraint.

---

## Anti-Mediocrity Prompting

When prompting for UI, specify:

### 1. Visual Direction

Name the direction explicitly:
- editorial minimalism,
- premium SaaS,
- brutalist dashboard,
- calm research console,
- retro terminal,
- glassy control room.

Do not ask for "nice-looking" output without a visual direction.

### 2. Typography System

Define role-based typography, not a single font family:
- heading voice,
- body voice,
- data/code voice.

Specify details:
- heading tracking,
- body leading,
- weight contrast,
- casing rules if relevant.

Example:
- "Headers use a serif voice for authority, body uses sans-serif for readability, data views use monospace. Use tighter tracking on headings and relaxed leading on long-form text."

### 3. Space and Layout

Specify how the layout should breathe:
- generous whitespace,
- asymmetry,
- editorial rhythm,
- bento grouping,
- dense execution mode only where appropriate.

Ask for real spacing behavior:
- larger section padding,
- uneven composition,
- focal areas with intentional negative space.

### 4. Color, Depth, and Material

Define a semantic palette:
- primary,
- muted,
- accent,
- destructive,
- surface,
- border.

Prefer OKLCH or HSL-oriented systems when possible.

Also define material cues:
- soft gradients,
- thin borders,
- inner shadows,
- background noise,
- blur or glass only if it serves the concept.

### 5. Motion

Specify a motion philosophy:
- restrained and functional,
- crisp and mechanical,
- soft and atmospheric,
- staggered reveal,
- immediate interaction feedback.

### 6. Explicit Avoidance

State what to avoid:
- generic SaaS hero sections,
- flat white sections with purple accents,
- uniform card grids,
- Inter-everywhere typography,
- cramped spacing,
- decorative motion with no purpose.

---

## Distilled Aesthetics Baseline

Use this baseline when the task needs stronger frontend personality and no house style has already been defined:

- guide typography, color, motion, and backgrounds separately,
- reference design inspirations without overconstraining implementation,
- explicitly call out generic defaults to avoid.

Operational defaults:
- avoid overused font families and repeated "safe" picks,
- use CSS variables for theme consistency,
- prefer one strong page-load motion moment over many weak micro-interactions,
- create atmosphere with gradients, patterns, or texture instead of flat background fills.

If the task only needs one dimension improved, isolate that dimension instead of loading the full aesthetics brief.

Examples:
- typography-only guidance when hierarchy is weak,
- theme lock when a specific aesthetic must persist across screens,
- motion-only guidance when the visual system is solid but the interface feels lifeless.

---

## Vibe Translation Dictionary

Translate vague adjectives into concrete design decisions.

### Premium SaaS
- deep neutral or blue-gray palette,
- thin borders,
- restrained accent color,
- sharp hierarchy,
- subtle gradients,
- precise micro-interactions.

### Editorial / Intellectual
- serif headlines,
- generous whitespace,
- asymmetrical composition,
- calmer palette,
- strong typographic rhythm,
- minimal chrome.

### Cyberpunk / Technical
- dark field,
- neon accents,
- monospace presence,
- grid or scanline texture,
- high-contrast data framing,
- glitch or signal-like motion used sparingly.

### Warm Product / Human-Centered
- softer neutrals,
- humane copy density,
- rounded but controlled shapes,
- layered paper/glass texture,
- balanced whitespace,
- approachable interaction states.

Do not copy these blindly. Use them to convert a requested vibe into testable UI constraints.

---

## Prompt Like a Designer

Treat the prompt as a creative brief, not a one-line request.

At minimum, define:
- who the agent should be,
- what it is producing,
- the context it is designing within,
- hard constraints,
- the expected output structure.

When the task is more strategic or shared across iterations, also define:
- the task flow,
- reference tone/style,
- clarification rules,
- reusable memory,
- self-evaluation and revision behavior.

For UI work, the recommended structure is:
- `WIRE` for most tasks: Who/What, Input Context, Rules, Expected Output
- `WIRE+FRAME` for complex or repeated tasks: add Flow, Reference style, Ask for clarification, Memory, Evaluate/iterate

Use `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md` when the UI task needs a reusable brief artifact before coding.

---

## Output Contract

For UI work, the resulting spec or prompt should include:
- target user and job-to-be-done,
- visual direction,
- typography system,
- layout/whitespace strategy,
- semantic color/material system,
- motion rules,
- accessibility constraints,
- explicit anti-patterns to avoid.

If any of these are missing, the prompt is underspecified.

---

## Prompt Skeleton

Use this structure when the user asks for a new interface:

```text
Design and implement a [page/component] for [user/task].

Visual direction:
- [one strong aesthetic direction]

Typography:
- headings: [voice/style]
- body: [voice/style]
- code/data: [voice/style]
- heading tracking: [...]
- body leading: [...]

Layout and spacing:
- [editorial/asymmetrical/bento/etc.]
- whitespace should feel [...]
- use generous section spacing such as [...]

Color and depth:
- define semantic colors for primary, muted, accent, destructive, surface, border
- use [gradient/shadow/blur/texture] in a restrained way to create [material feel]

Motion:
- [describe interaction and entrance motion]

Avoid:
- [generic patterns to exclude]
```

For more strategic UI work, expand this into a WIRE+FRAME brief:

```text
W: who the agent is and what it must deliver
I: product context, users, references, and technical stack
R: hard constraints, non-negotiables, and anti-patterns
E: exact output format and required states/components
F: task order for analysis, composition, implementation, and refinement
R: desired tone, design references, and visual inspirations
A: what must be clarified before coding if ambiguous
M: reusable choices and precedent to preserve across iterations
E: self-critique and revision loop to improve the strongest candidate
```

Use WIRE by default. Use the full WIRE+FRAME structure when:
- the interface is strategically important,
- multiple iterations or handoffs are expected,
- the prompt will be reused across a team,
- you want built-in self-critique against generic output.

---

## Done Criteria

The UI prompt/spec is ready only when:
- the visual direction is explicit,
- the typography system has roles,
- spacing and layout are intentional,
- color is semantic,
- emotional adjectives have been translated into concrete implementation choices,
- generic fallback design patterns have been explicitly ruled out.
