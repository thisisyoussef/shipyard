# Task Breakdown

## Story
- Story ID: P9-S06
- Story Title: Browser File Upload and Shipyard Context Intake

## Execution Notes
- Keep upload transport and prompt transport separate. The browser should hand
  the server a file through a dedicated intake path, then hand the agent a
  receipt-backed context reference on the next turn.
- Stay honest about current capability. The first story should be text-first
  and bounded rather than pretending Shipyard can already interpret every
  binary artifact a hosted user might select.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for upload validation, receipt persistence, reconnect hydration, and next-turn attachment context synthesis. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/ui-view-models.test.ts` |
| T002 | Add the backend upload-intake helper, safe storage path, validation rules, and persisted pending-attachment session state. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Add the browser attach control, upload lifecycle UI, receipt badges, and attach-to-turn submission behavior in the composer flow. | blocked-by:T002 | no | `pnpm --dir shipyard build` |
| T004 | Run the full validation pass and perform one hosted smoke that uploads a supported file, refreshes, then submits a turn using the recovered attachment. | blocked-by:T002,T003 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Hosted Shipyard can accept a supported browser-selected file into the active
  session.
- Upload receipts survive reconnect and turn into bounded next-turn context.
- Unsupported uploads fail clearly without leaking unsafe storage details.
