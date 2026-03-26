# Task Breakdown

## Story
- Story ID: P9-S07
- Story Title: Hosted Production Runtime Outcome Hardening

## Execution Notes
- Keep the first fix centered on honest degradation and bounded recovery, not a
  broad rewrite of coordinator routing.
- Preserve strong verification when the environment is healthy; the goal is to
  stop infrastructure failures from masquerading as code failures.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing regression coverage for the hosted Railway failure class: existing previewable target, browser evaluator unavailable, and long-lived dev server reaching ready state before timeout. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts` |
| T002 | Implement hosted verification capability detection and safe degradation so browser-unavailable environments stop retrying impossible checks. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Adjust command verification semantics to recognize ready long-lived preview servers and gate recovery on code-failure evidence rather than infra-only verifier failure. | blocked-by:T001 | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/ui-runtime.test.ts` |
| T004 | Thread degraded-verification diagnostics into traces, logs, and any existing hosted runtime status surface needed for operator clarity. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T005 | Document Railway browser-dependency expectations, fallback behavior, and hosted smoke guidance for future regression checks. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |
| T006 | Run the full validation suite plus one hosted/manual smoke or trace replay that proves the old recovery spiral is gone. | blocked-by:T002,T003,T004,T005 | no | `pnpm --dir shipyard test && pnpm --dir shipyard typecheck && pnpm --dir shipyard build && git diff --check` |

## Completion Criteria

- Hosted verifier failures caused only by missing browser support or
  long-lived dev-server semantics no longer degrade the working file.
- Trace evidence makes the environment-vs-code distinction obvious.
- Railway-hosted Shipyard stays trustworthy enough that a good local result is
  not turned into a bad production outcome by runtime scaffolding.
