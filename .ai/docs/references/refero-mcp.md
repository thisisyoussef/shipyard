# Refero MCP

Use Refero to improve UI story brainstorming before Shipyard drafts a design brief.

## Why This Exists

Shipyard already uses a Claude-first design bridge for visible UI stories. Refero adds a reference-research step so the design delegate studies shipped product screens and flows before choosing layout, hierarchy, copy, and motion directions.

## Where It Fits

For visible UI work, use Refero in two places:

1. `story-lookup.md`
   Use Refero during external research when the story needs real-product precedent.
2. `design-phase.md`
   Use Refero before drafting the first brief so the brief starts from references instead of generic guesses.

## Expected Research Output

For each meaningful UI story, gather:

- 3-6 highly relevant screens
- 1-2 end-to-end flows when the story changes user journey, not just layout
- concrete notes on what to borrow
- concrete notes on what to avoid

Prefer references that match:

- product category
- user task
- UI state
- density level
- platform expectations

## Setup

Local project setup:

```bash
node scripts/setup-refero-mcp.mjs
```

Then make sure your shell has:

```bash
export REFERO_MCP_TOKEN=...
```

Optional direct Codex registration for manual exploration:

```bash
codex mcp add refero --url https://api.refero.design/mcp --bearer-token-env-var REFERO_MCP_TOKEN
```

The Claude-first design bridge (`scripts/generate-design-brief.mjs`) will also use Refero automatically when either:

- a local `.mcp.json` contains a `refero` server, or
- `REFERO_MCP_TOKEN` is present in the environment

## Prompting Guidance

When Refero is available, ask for:

- the closest matching page types
- the closest matching product flows
- layout and hierarchy patterns that repeat across the best matches
- empty, loading, error, and success state treatments
- the typography, spacing, and density signals worth keeping

Avoid prompts that only ask for “inspiration” or “make it look good.” Ask for concrete references and extractable patterns.

Good examples:

- “Find B2B onboarding flows for complex developer tools.”
- “Find empty states for activity feeds in collaboration products.”
- “Find settings screens from technical products with dense navigation.”
- “Find modal confirmation flows for destructive actions in premium SaaS.”

## Shipyard Output Contract

When Refero is used for a design story, the resulting brief should include a `Reference research` section with:

- product or flow names
- why each reference matches the story
- what Shipyard should borrow
- what Shipyard should avoid

If Refero is unavailable for a story, note that explicitly in assumptions rather than silently pretending reference research happened.
