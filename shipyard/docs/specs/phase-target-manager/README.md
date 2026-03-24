# Phase Target Manager: Story Pack

- Pack: Target Manager
- Estimate: 4-5 hours
- Date: 2026-03-24
- Status: Planned

## Pack Objectives

1. Let users select an existing target from a configurable targets directory or create a new one from scratch, so launching Shipyard no longer requires a pre-existing `--target` path.
2. Enrich every target with an AI-generated project profile (description, stack, architecture, complexity, suggested AGENTS.md, task ideas) so the coding agent has richer context from the first turn.
3. Allow target switching at any point during a session without losing prior session state.

## Shared Constraints

- All four target manager tools are registered in the standard tool registry and follow the existing `ToolDefinition` contract.
- The target manager phase reuses `executeInstructionTurn()` — no parallel execution infrastructure.
- Enrichment is synchronous within the turn but streams progress events so both surfaces can show status.
- Existing `--target <path>` behavior is fully backward compatible. The new flow only activates when `--target` is omitted.
- `TargetProfile` is persisted as `<target>/.shipyard/profile.json` and survives across sessions.
- The code phase system prompt may reference `TargetProfile` fields for better context but does not depend on them.
- Scaffold templates for `create_target` are minimal and opinionated — just enough structure for the agent to build on, not full framework starters.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| PTM-S01 | Target Manager Tools & Data Model | Build the 4 tools (`list_targets`, `select_target`, `create_target`, `enrich_target`), the `TargetProfile` type, and `profile.json` persistence. Pure backend — no UI or CLI changes. | Existing tool registry, discovery module |
| PTM-S02 | CLI Integration & Runtime Switching | Make `--target` optional, add `--targets-dir`, add `target` REPL command, wire up session save/load on switch. Terminal-complete. | PTM-S01 |
| PTM-S03 | Browser Workbench Target UI | Add WebSocket contracts for target manager events, target header bar, switch dropdown, creation dialog, and enrichment progress indicator. Both surfaces complete. | PTM-S01, PTM-S02 |

## Sequencing Rationale

- `PTM-S01` lands first because the tools and data model are the foundation everything else calls into. Testable in isolation with unit tests against the tool registry.
- `PTM-S02` adds the terminal experience on top of S01. This makes the feature usable end-to-end in the REPL without needing the browser.
- `PTM-S03` adds the richer browser surface last, since it depends on both the tools and the session switching logic being proven.

## Whole-Pack Success Signal

- A user can launch `shipyard` with no `--target` flag and be guided to pick or create a target.
- Enrichment produces a useful `TargetProfile` that the code phase can reference for better planning.
- A user mid-session can type `target switch` to change targets without losing prior session state.
- The browser workbench shows the active target and allows switching via the UI.
- All existing `--target <path>` behavior is unchanged (backward compatible).
