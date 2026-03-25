# Task Breakdown

## Story
- Story ID: PTM-S04
- Story Title: Automatic Background Enrichment

## Execution Notes
- Keep `switchTarget()` pure and introduce auto-enrichment as orchestration logic around the existing switch/create flows.
- Browser create/switch should acknowledge the target first and let enrichment continue through streamed status updates afterward.
- Preserve the CLI recovery path even though the browser CTA goes away.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extend the target enrichment state contract for background lifecycle signaling, including a `queued` state and passive messaging expectations. | must-have | yes | `pnpm --dir shipyard typecheck` |
| T002 | Implement a helper that decides whether automatic enrichment should run, skip because a profile already exists, or surface a passive "needs more context" state. | blocked-by:T001 | yes | unit test |
| T003 | Wire CLI create/switch flows to auto-start enrichment when needed, including inline prompting only when the CLI can supply missing greenfield context. | blocked-by:T002 | no | integration test |
| T004 | Wire browser create/switch and initial target sync flows to queue and run background enrichment automatically when needed. | blocked-by:T002 | no | integration test |
| T005 | Update the workbench header and enrichment indicator to remove explicit enrich/retry buttons and render passive status-only UI. | blocked-by:T001 | yes | UI test / manual smoke test |
| T006 | Add stale-target guards so fast switches do not let an old background enrichment run overwrite the current target's state. | blocked-by:T004 | no | integration test |
| T007 | Add trace or runtime-log coverage that records whether enrichment started automatically or manually. | blocked-by:T003,T004 | yes | test or log assertion |
| T008 | Add regression coverage for browser auto-enrichment, CLI auto-enrichment, and missing-button UI expectations. | blocked-by:T003,T004,T005,T006 | no | `pnpm --dir shipyard test` |

## Completion Criteria

- Automatic enrichment runs after create/switch when Shipyard has enough context and no profile already exists.
- Browser target UX is passive and background-oriented instead of button-driven.
- CLI still supports explicit manual re-enrichment for recovery/debugging.
- Fast target switching cannot corrupt the visible enrichment state.
