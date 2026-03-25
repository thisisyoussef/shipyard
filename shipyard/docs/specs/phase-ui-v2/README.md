# Phase UI v2: Complete UI Reimagination

## Pack Metadata
- Pack ID: phase-ui-v2
- Author: Codex + Claude
- Date: 2026-03-24
- Status: Planned
- Estimated effort: 12–18 hours
- Depends on: Phase Pre-2 (runtime), Phase UI Revamp (token system)

## Higher-Level Objectives

The current Shipyard UI is functional but visually weak. It reads like a
developer prototype, not a tool developers would trust and enjoy using daily.
This pack guts and rebuilds the entire frontend from first principles using
best-in-class UX/UI practices, the installed design skill chain, and a
cohesive visual identity.

### Pack Goals

1. **Trust at first glance**: The UI should look like a professional developer
   tool — confident, calm, and purposeful. No generic card grids. No flat
   layouts. No Inter-everywhere typography.
2. **Scanability under pressure**: When the agent is mid-run with 20+ tool
   calls, the developer must be able to find the current state, the last error,
   and the latest diff in under 3 seconds.
3. **Keyboard-first, mouse-friendly**: Multi-turn usage must flow without
   lifting hands from the keyboard. Mouse users should never feel like
   second-class citizens.
4. **Progressive disclosure**: Power is always available but never overwhelming.
   Default states are calm; detail appears on demand.
5. **Accessibility as baseline**: WCAG 2.2 AA minimum. Color is never the sole
   signal. Focus management is intentional. Reduced motion is respected.
6. **Performance discipline**: No layout thrash. Compositor-only animations.
   Virtualized long lists. Sub-100ms interaction feedback.

### Visual Direction

**Aesthetic**: Premium developer console — think Linear meets Warp meets
Raycast. Dark field with warm amber accents. Serif authority in headings.
Monospace precision in data. Generous negative space. Glassmorphic depth
without excess blur.

**What we avoid**: Generic SaaS dashboards, flat white sections, crowded card
grids, decorative gradients, rainbow status colors, Inter/system-ui-everywhere
typography, meaningless motion, AI-generated placeholder aesthetic.

## Skill Chain Integration

Each story in this pack specifies which skills from the UI skill chain apply.
The full chain is defined in `.ai/codex.md` → "UI Skill Chain".

| Phase | Skills | When |
|---|---|---|
| Design Direction | `frontend-design`, `emil-design-eng`, design philosophy, `baseline-ui` | Every story |
| Build & Refine | `typeset`, `colorize`, `arrange`, `animate`, `bolder` | Component/page stories |
| Quality Gate | `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance` | Every story |
| Final Polish | `polish`, `overdrive` | Pack-closing stories |

## Story Sequence

Stories are sequenced so each builds on the previous. No story should be
implemented out of order unless explicitly marked as parallelizable.

| Story ID | Title | Est. | Depends On | Skills |
|---|---|---|---|---|
| UIV2-S01 | Design System Foundation | 2–3h | — | frontend-design, emil-design-eng, typeset, colorize, baseline-ui |
| UIV2-S02 | Shell and Navigation Chrome | 2–3h | S01 | arrange, animate, critique |
| UIV2-S03 | Composer and Instruction UX | 2–3h | S02 | emil-design-eng, animate, polish |
| UIV2-S04 | Activity Feed Reimagination | 2–3h | S02 | arrange, animate, bolder, critique |
| UIV2-S05 | Diff and File Viewer Overhaul | 2h | S04 | colorize, typeset, fixing-accessibility |
| UIV2-S06 | Session and Context Panels | 2h | S02 | arrange, polish, critique |
| UIV2-S07 | States, Feedback, and Motion | 1–2h | S03, S04 | animate, overdrive, fixing-motion-performance |
| UIV2-S08 | Accessibility and Performance Audit | 1h | S07 | audit, fixing-accessibility, fixing-motion-performance |

## Boundaries Between Stories

- **S01** establishes tokens, fonts, and the design system. No layout work.
- **S02** builds the shell (top bar, sidebar structure, grid). No content components.
- **S03** rebuilds the composer/instruction area. Does not touch activity or diffs.
- **S04** rebuilds the activity feed and turn cards. Does not touch diffs.
- **S05** rebuilds the diff viewer and file sidebar. Consumes S04's card patterns.
- **S06** rebuilds session and context panels. Consumes S02's sidebar structure.
- **S07** adds motion, transitions, and feedback states across all components.
- **S08** is a pure audit/fix pass — no new features, only compliance and perf.

## Success Criteria for the Full Pack

The pack is successful when:
- [ ] The UI passes an `audit` skill evaluation with no high-severity issues
- [ ] The UI passes a `critique` skill evaluation scoring 7+ on all dimensions
- [ ] WCAG 2.2 AA compliance verified via `fixing-accessibility` skill
- [ ] Animation performance verified via `fixing-motion-performance` skill
- [ ] A developer can complete a 5-turn agent session without touching the mouse
- [ ] The UI renders correctly at 1440px, 1024px, and 375px viewports
- [ ] Build size does not exceed 50KB CSS + 350KB JS gzipped
- [ ] All existing tests pass without modification
