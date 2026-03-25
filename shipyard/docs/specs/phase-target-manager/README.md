# Phase Target Manager: Story Pack

- Pack: Target Manager
- Estimate: 5-7 hours
- Date: 2026-03-24
- Status: Planned

## Pack Objectives

1. Let users select an existing target from a configurable targets directory or create a new one from scratch, so launching Shipyard no longer requires a pre-existing `--target` path.
2. Enrich every target with an AI-generated project profile (description, stack, architecture, complexity, suggested AGENTS.md, task ideas) so the coding agent has richer context from the first turn.
3. Allow target switching at any point during a session without losing prior session state.
4. Make enrichment automatic from the default user experience so new targets do not require a separate "enrich" step in the browser workbench.

## Shared Constraints

- All four target manager tools are registered in the standard tool registry and follow the existing `ToolDefinition` contract.
- The target manager phase reuses `executeInstructionTurn()` — no parallel execution infrastructure.
- CLI-triggered or CLI-auto-started enrichment may still run inline, but browser-triggered enrichment should feel backgrounded from the user's perspective once a target is active.
- Existing `--target <path>` behavior is fully backward compatible. The new flow only activates when `--target` is omitted.
- `TargetProfile` is persisted as `<target>/.shipyard/profile.json` and survives across sessions.
- The code phase system prompt may reference `TargetProfile` fields for better context but does not depend on them.
- Scaffold templates for `create_target` are minimal and opinionated — just enough structure for the agent to build on, not full framework starters.
- Manual CLI re-enrichment remains available as an operator/debug escape hatch even if the browser no longer exposes a dedicated enrich button.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| PTM-S01 | Target Manager Tools & Data Model | Build the 4 tools (`list_targets`, `select_target`, `create_target`, `enrich_target`), the `TargetProfile` type, and `profile.json` persistence. Pure backend — no UI or CLI changes. | Existing tool registry, discovery module |
| PTM-S02 | CLI Integration & Runtime Switching | Make `--target` optional, add `--targets-dir`, add `target` REPL command, wire up session save/load on switch. Terminal-complete. | PTM-S01 |
| PTM-S03 | Browser Workbench Target UI | Add WebSocket contracts for target manager events, target header bar, switch dropdown, creation dialog, and enrichment progress indicator. Both surfaces complete. | PTM-S01, PTM-S02 |
| PTM-S04 | Automatic Background Enrichment | Start enrichment automatically after create/switch when a target lacks a profile, remove the browser enrich button, and keep progress passive in the workbench UX. | PTM-S02, PTM-S03 |

## Sequencing Rationale

- `PTM-S01` lands first because the tools and data model are the foundation everything else calls into. Testable in isolation with unit tests against the tool registry.
- `PTM-S02` adds the terminal experience on top of S01. This makes the feature usable end-to-end in the REPL without needing the browser.
- `PTM-S03` adds the richer browser surface last, since it depends on both the tools and the session switching logic being proven.
- `PTM-S04` follows the base browser flow because it intentionally changes the user experience from explicit enrichment to automatic/background enrichment and needs both surfaces to exist first.

## Whole-Pack Success Signal

- A user can launch `shipyard` with no `--target` flag and be guided to pick or create a target.
- Enrichment produces a useful `TargetProfile` that the code phase can reference for better planning.
- A user mid-session can type `target switch` to change targets without losing prior session state.
- Newly created or newly selected targets without a saved profile are enriched automatically.
- The browser workbench shows the active target, allows switching via the UI, and treats enrichment as passive background work instead of a separate button-driven action.
- All existing `--target <path>` behavior is unchanged (backward compatible).

## Implementation Evidence

### Code References

- N/A. This landing updates the target-manager planning pack only and adds a new follow-on story folder for future implementation.

### Representative Snippets

- N/A. No runtime or UI implementation landed as part of this docs-only planning pass.
