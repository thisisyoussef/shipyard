# Design System — Shipyard

## Product Context
- **What this is:** A browser-first coding agent workbench — an AI-powered development environment with chat, live tool execution, file management, and preview
- **Who it's for:** Developers who want an intelligent, opinionated coding assistant with a visual interface
- **Space/industry:** AI coding tools (peers: Cursor, Lovable, Factory, Bolt)
- **Project type:** Web application (React SPA with WebSocket backend)

## Aesthetic Direction
- **Direction:** Art Deco Command — geometric precision, gold accents, jewel-toned semantics on deep navy
- **Decoration level:** Intentional — gold hairline dividers, geometric ornamental breaks, gem-cut badge shapes
- **Mood:** Opulent but disciplined. The machine age celebrated precision and the future — that's what a coding agent is. Warm, confident, unmistakable.
- **Reference sites:** Linear (restraint), Vercel (typography-as-identity), HTTPie (warm neutrals)
- **Anti-references:** Generic dark-mode dev tools with cold blue-gray + purple/blue accents

## Typography
- **Display/Hero:** Fraunces (variable, optical size 9-144, weight 300-700) — A soft, expressive serif with a "wonky" axis. Used for page-level headings, turn headers, and the composer prompt label. The italic variant in gold is a signature visual element.
- **Body:** Source Sans 3 (weights 300-700, italic) — Adobe's workhorse sans-serif. Excellent readability at small sizes, professional without being sterile. Used for all body text, UI labels, buttons, and navigation.
- **UI/Labels:** Source Sans 3 at weight 600, letter-spacing 0.1-0.15em, uppercase — Used for section labels, badge text, and micro-labels.
- **Data/Tables:** Fira Code (weights 400-600) — Supports ligatures for operators and tabular-nums for aligned numeric columns. Used for tool call details, file stats, timestamps, and code.
- **Code:** Fira Code
- **Loading:** Google Fonts CDN
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  ```
- **Scale:** Major third (1.25) from 15px base
  - `--text-2xs`: 9.6px (timestamps, line numbers)
  - `--text-xs`: 11.25px (kickers, micro labels)
  - `--text-sm`: 13.125px (captions, metadata, badges)
  - `--text-base`: 15px (body text, form inputs)
  - `--text-md`: 16.875px (card titles)
  - `--text-lg`: 18.75px (section headings)
  - `--text-xl`: 22.5px (panel headings)
  - `--text-2xl`: 28.125px (page headings)
  - `--text-3xl`: 33.75px (large display)
  - `--text-hero`: clamp(2.5rem, 5vw, 4rem) (responsive hero)

## Color
- **Approach:** Restrained with earned accents — gold is structural (borders, dividers, labels), not fill. Jewel tones for semantics only.

### Core Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Canvas | `#0F172A` | Page background, deepest layer |
| Surface | `#1E293B` | Cards, panels, elevated containers |
| Elevated | `#273548` | Hover states, nested surfaces |
| Gold | `#D4A843` | Primary accent — borders, dividers, active states, branding |
| Gold Dim | `rgba(212, 168, 67, 0.15)` | Gold hover backgrounds, subtle fills |
| Gold Glow | `rgba(212, 168, 67, 0.08)` | Focus rings, ambient glow |
| Gold Border | `rgba(212, 168, 67, 0.25)` | Hairline borders, ornamental dividers |
| Copper | `#C2956B` | Secondary warm accent — agent names, secondary labels |
| Pearl | `#F8FAFC` | Primary text |
| Pearl Dim | `#CBD5E1` | Secondary text, body content |
| Muted | `#94A3B8` | Tertiary text, placeholders |
| Faint | `#64748B` | Timestamps, metadata, disabled states |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Emerald | `#34D399` | Success — tests passed, files added, connected |
| Emerald Dim | `rgba(52, 211, 153, 0.12)` | Success background |
| Ruby | `#F43F5E` | Danger — errors, failures, destructive actions |
| Ruby Dim | `rgba(244, 63, 94, 0.12)` | Danger background |
| Amber | `#FBBF24` | Warning — in-progress, caution states |
| Amber Dim | `rgba(251, 191, 36, 0.12)` | Warning background |
| Sapphire | `#60A5FA` | Info — neutral informational states |
| Sapphire Dim | `rgba(96, 165, 250, 0.12)` | Info background |

### Dark Mode (default)
The palette above is the dark mode default.

### Light Mode
| Token | Dark | Light |
|-------|------|-------|
| Canvas | `#0F172A` | `#F8FAFC` |
| Surface | `#1E293B` | `#FFFFFF` |
| Elevated | `#273548` | `#F1F5F9` |
| Gold | `#D4A843` | `#A07B2E` |
| Pearl | `#F8FAFC` | `#0F172A` |
| Pearl Dim | `#CBD5E1` | `#334155` |
| Muted | `#94A3B8` | `#64748B` |
| Faint | `#64748B` | `#94A3B8` |

## Spacing
- **Base unit:** 4px
- **Density:** Balanced — generous for reading surfaces, compact for data-dense panels
- **Scale:**
  - `--sp-1`: 4px
  - `--sp-2`: 8px
  - `--sp-3`: 12px
  - `--sp-4`: 16px
  - `--sp-5`: 20px
  - `--sp-6`: 24px
  - `--sp-8`: 32px
  - `--sp-10`: 40px
  - `--sp-12`: 48px
  - `--sp-16`: 64px

## Layout
- **Approach:** Hybrid — disciplined grid for the app shell, centered focus for the main content area
- **Grid:**
  - Shell: CSS Grid with named template areas
  - Header: 48px fixed, gold-bordered bottom
  - Left sidebar: 48px icon rail (collapsed) / 220px (expanded)
  - Main content: 1fr, centered max-width 720px for composer/chat
  - Right panel: 280px (collapsible)
  - Footer: 32px, gold-bordered top
- **Max content width:** 720px for prose, 100% for data panels
- **Border radius:**
  - `--radius-sm`: 4px (inputs, small elements)
  - `--radius-md`: 8px (cards, panels)
  - `--radius-lg`: 12px (dialogs, major containers)
  - Headers and structural dividers: 0px (sharp, architectural)

## Ornamental System
Art Deco is defined by its geometric ornamentation. Use these deliberately:
- **Gold hairline dividers:** `1px solid rgba(212, 168, 67, 0.25)` between major sections
- **Double-line breaks:** Two parallel hairlines (3px apart) for major section transitions
- **Deco rule:** Centered label flanked by gradient gold lines for section headings
- **Diamond markers:** Small 6px rotated squares (◆) in gold for branding accents
- **Gem-cut badges:** Hexagonal `clip-path: polygon(6px 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0% 50%)` for status badges
- **Gradient header/footer:** Subtle linear-gradient with 4% gold opacity at edges

## Motion
- **Approach:** Intentional — geometric reveals, no bouncy/spring animations
- **Easing:**
  - Enter: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out, smooth deceleration)
  - Exit: `cubic-bezier(0.65, 0, 0.35, 1)` (ease-in-out)
  - Move: `cubic-bezier(0.65, 0, 0.35, 1)` (ease-in-out)
- **Duration:**
  - Micro (hover, press): 120ms
  - Short (state changes): 200ms
  - Medium (panel transitions): 400ms
  - Long (page-level): 600ms
- **Patterns:**
  - Panels slide in from the edge, no bounce
  - Cards fade in with subtle translateY(8px)
  - Tool call items stagger with 60ms delay
  - Status dots pulse with infinite alternate animation
  - Button press: scale(0.97) at 120ms
  - No glassmorphism, no blur effects, no radial gradients

## Component Signatures
- **Buttons:** Gold gradient (primary), ghost with gold border (secondary), flat (tertiary). All uppercase with letter-spacing.
- **Inputs:** Dark canvas background, gold border on focus with 2px gold-dim ring. Centered text for composer.
- **Cards:** Surface background, border-surface border, shadow-card elevation. No rounded corners on structural elements.
- **Alerts:** Left 2px border in semantic color, semantic-dim background, semantic-colored text.
- **Status dots:** 8px circles with matching color glow (box-shadow).
- **Composer:** Centered Fraunces italic label ("What should we build?"), centered Source Sans input with gold focus ring.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-25 | Art Deco Command direction chosen | Every competitor converges on cold blue-gray dark mode. Art Deco's geometric precision + warm gold creates instant recognition and communicates "intelligent tool" rather than "generic IDE". |
| 2026-03-25 | Fraunces for display type | Variable serif with optical sizing and soft axis. Unusual for dev tools (risk), but the italic in gold is a signature visual element that no competitor has. |
| 2026-03-25 | Source Sans 3 for body | Professional, readable, excellent at small sizes. Not overused in the dev tool space (unlike Inter/Roboto). Adobe's quality guarantee. |
| 2026-03-25 | Gem-cut hexagonal badges | CSS clip-path creates distinctive badge shapes that echo Art Deco's love of faceted geometric forms. Functional and memorable. |
| 2026-03-25 | Gold as structural, not fill | Gold used for borders, dividers, and labels rather than filled backgrounds. Keeps the palette luxurious without becoming garish. Color is earned, not sprayed. |
| 2026-03-25 | Jewel-toned semantics | Emerald/Ruby/Amber/Sapphire instead of generic green/red/yellow/blue. Names reinforce the Art Deco luxury vocabulary. |
| 2026-03-25 | No glassmorphism, no radial gradients | Previous design used backdrop-blur and radial gradient backgrounds. These add visual noise without meaning and date quickly. Clean surfaces and gold hairlines provide structure instead. |
| 2026-03-25 | Panel reduction (9 → 3 visible) | Previous design had 9 panels competing for attention. New design shows 3 at a time with seamless slide transitions. Focus over density. |