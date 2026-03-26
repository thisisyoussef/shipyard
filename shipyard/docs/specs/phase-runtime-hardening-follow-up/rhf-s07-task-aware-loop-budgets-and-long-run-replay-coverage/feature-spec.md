# Feature Spec

## Metadata
- Story ID: RHF-S07
- Story Title: Task-Aware Loop Budgets and Long-Run Replay Coverage
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

Once history churn, prompt policy, handoff quality, continuation semantics, and bootstrap-ready routing are fixed, Shipyard still needs a smarter acting-iteration budget than a universal `25`. Narrow edits should stay cheap, but broad greenfield app builds can legitimately need `40` to `50` acting iterations. Raising the limit everywhere would hide regressions and waste time, so the last step is task-aware budget sizing paired with replay coverage that proves the earlier reread spiral is actually gone.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: keep the default acting budget tight for narrow work.
- Objective 2: allow broader greenfield builds more room only when earlier hardening fixes are already in place.
- Objective 3: lock the whole pack in with replay and smoke coverage that reflects the Trello and Jira failure class.
- How this story or pack contributes to the overall objective set: This story is intentionally last because it should amplify the earlier fixes, not substitute for them.

## User Stories
- As an operator making a narrow fix, I want Shipyard to keep the fast lightweight iteration budget.
- As an operator asking for a large greenfield app build, I want Shipyard to get a larger acting budget only when the runtime has enough context stability to use it productively.

## Acceptance Criteria
- [ ] AC-1: Shipyard derives the acting-iteration budget from task characteristics, keeping `25` for narrow or exact-path work and using a higher bounded budget such as `40` to `50` for broad greenfield builds.
- [ ] AC-2: The budget decision uses explicit signals such as bootstrap readiness, task breadth, recent touched-file evidence, or expected new-file volume rather than a blanket global constant.
- [ ] AC-3: Chosen acting budgets are visible in logs, traces, or runtime metadata so regressions can be diagnosed.
- [ ] AC-4: Replay tests or manual smoke coverage exercise Trello or Jira-like greenfield builds and same-session follow-ups, and prove the fix is no longer a reread spiral hidden behind a larger limit.
- [ ] AC-5: The docs for long-run smoke or replay coverage explain the task-aware budget expectations and the scenarios they protect.

## Edge Cases
- A broad request may still resolve to a small scoped change once recent touched-file evidence is available.
- A greenfield task can continue from a handoff and should not lose its larger budget if the continuation is still part of the same broad build.
- A higher acting budget must not override blocked-file or provider-budget safeguards.
- Replay fixtures should remain deterministic enough to distinguish budget sizing from unrelated provider noise.

## Non-Functional Requirements
- Reliability: task-aware sizing must stay explicit and reproducible.
- Performance: narrow paths should not pay the cost of greenfield-sized budgets.
- Observability: traces and smoke artifacts should record why a larger or smaller budget was chosen.
- Maintainability: budget sizing should live in one decision point rather than many scattered overrides.

## Out of Scope
- Replacing continuation or handoff semantics.
- Provider timeout or `max_tokens` sizing changes from the first runtime-hardening pack.
- New target bootstrap presets.

## Done Definition
- Acting-iteration budgets reflect task shape, and replay coverage proves the runtime now progresses farther because the reread spiral is gone, not just because the limit got bigger.
