# Task Breakdown

## Story
- Story ID: UIR-S02
- Story Title: Activity and Diff Experience Overhaul

## Execution Notes
- Keep tool activity scannable for long runs.
- Avoid breaking the event schema; map events instead.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define activity card layout and status mapping. | must-have | no | UI smoke |
| T002 | Implement diff component with explicit add/remove labels. | must-have | yes | UI smoke |
| T003 | Add collapse/filter controls for long runs. | blocked-by:T001 | yes | UI smoke |
| T004 | Run UI QA critic and capture findings. | blocked-by:T003 | yes | critic brief |

## Completion Criteria

- Activity feed and diff view are both scannable without scrolling fatigue.
- Errors and retries are obvious in the activity list.
