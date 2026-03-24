# Phase 5: Local Preview Story Pack

- Pack: Phase 5 Local Preview
- Estimate: 3-4 hours
- Date: 2026-03-24
- Status: Planned

## Pack Objectives

1. Let Shipyard run a previewable target project locally so the user can immediately see the result of an edit.
2. Reuse target-native dev, watch, and hot-reload behavior when it already exists instead of inventing a second app runtime.
3. Make preview lifecycle state visible in the browser workbench, including unavailable, starting, running, refreshing, and error states.

## Shared Constraints

- Product code and product docs stay under `shipyard/`; `.ai/` remains helper-only.
- Preview is local-only, loopback-bound, and should never imply deployment or public hosting.
- Shipyard should prefer target discovery plus existing package scripts before falling back to custom watch logic.
- The preview supervisor must not block the core agent runtime or leave orphan long-running processes behind.
- Targets that do not expose a local preview surface should show a clear `not applicable` state instead of guessing.
- Auto refresh should piggyback on target-native HMR/watch behavior when available, with Shipyard-triggered reload or restart only as a fallback.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P5-S01 | Local Preview Runtime and Auto Refresh | Detect previewable targets, launch a local preview, surface it in the browser workbench, and keep it fresh after edits. | Phase 4 implementation, Phase Pre-2 implementation |

## Sequencing Rationale

- Phase 4 already provides the shared runtime, session model, and bounded command execution needed to supervise a preview process safely.
- Phase Pre-2 already established the browser workbench, which is the natural place to show preview state and the rendered result.
- Keeping preview lifecycle work in its own pack prevents it from being buried inside later coordinator/subagent stories.

## Whole-Pack Success Signal

- A previewable target can be launched from Shipyard without separate manual terminal setup.
- The workbench shows preview availability, URL, lifecycle state, and recent logs clearly.
- Edits made through Shipyard keep the visible preview current without repeated manual restarts.
- Targets without a preview surface fail gracefully with a clear explanation.
