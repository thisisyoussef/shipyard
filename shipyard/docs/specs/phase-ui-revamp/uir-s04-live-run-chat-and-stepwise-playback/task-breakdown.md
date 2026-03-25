# Task Breakdown

## Story
- Story ID: UIR-S04
- Story Title: Live Run Chat and Stepwise Playback

## Execution Notes
- Preserve the shared turn executor as the only source of browser activity.
- Prefer incremental evidence over end-of-run reconstruction.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extend tool success payloads and turn reporter events with immediate edit preview and trace metadata. | must-have | no | unit + integration |
| T002 | Update browser reducer/view models so step detail, repeated edits, and trace links persist in UI state. | blocked-by:T001 | no | unit |
| T003 | Build `Chat` and `Live view` workbench surfaces plus file-evidence updates. | blocked-by:T002 | yes | render + smoke |
| T004 | Run browser smoke and LangSmith finish checks, then update docs for the new operator flow. | blocked-by:T003 | yes | smoke + CLI |

## Completion Criteria

- Browser operators can watch the run unfold step by step while it is still in progress.
- Chat transcript, live playback, saved runs, and trace access all work from one persistent session.
