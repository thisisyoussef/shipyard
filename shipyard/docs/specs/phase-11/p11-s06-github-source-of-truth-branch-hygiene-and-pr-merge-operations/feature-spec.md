# Feature Spec

## Metadata
- Story ID: P11-S06
- Story Title: GitHub Source of Truth, Branch Hygiene, and PR Merge Operations
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard's current runtime still treats the local workspace as the practical
source of truth. That is not enough for a real factory. New projects need one
canonical repo lifecycle so stories can branch cleanly, open reviewable PRs,
merge safely, and recover when concurrent work collides. Just as importantly,
that GitHub lifecycle must work in deployed environments too. Local `gh auth`
is useful, but it cannot be the only way the factory authenticates or manages
repos once Shipyard is running on Railway or another hosted service. Shipyard
therefore needs a runtime source-control contract that prefers GitHub as the
canonical upstream, supports both local and hosted auth paths, and falls back
gracefully when GitHub is temporarily unavailable so the project can still be
managed.

## Story Pack Objectives
- Objective 1: Make GitHub-backed source control a first-class runtime contract
  instead of an operator habit.
- Objective 2: Normalize branch-per-story hygiene, PR lifecycle, and merge
  operations behind a dedicated runtime role.
- Objective 3: Support local and deployed GitHub auth paths without assuming an
  interactive shell is always available.
- Objective 4: Preserve project manageability through an explicit degraded local
  mode when GitHub auth or binding is unavailable.
- How this story contributes to the overall objective set: it gives the pack a
  canonical source-control spine that later hosted, board, and coordinator
  stories can trust.

## User Stories
- As an operator, I want new factory-managed projects to bind to GitHub by
  default so merges, reviews, and recovery all happen against one canonical
  upstream.
- As a deployed runtime owner, I want the same source-control behavior to work
  on Railway without depending on local `gh auth`.
- As a merge reviewer, I want one dedicated PR-ops role to handle PR creation,
  updates, merge, and cleanup instead of scattering that logic across other
  phases.
- As a fallback operator, I want the project to remain manageable even when
  GitHub auth is unavailable, with clear signals about what is blocked versus
  what can continue locally.

## Acceptance Criteria
- [x] AC-1: Shipyard defines a normalized `SourceControlCapability` contract
  that supports at least local `gh` CLI auth, hosted-safe auth such as OAuth,
  GitHub App, or service-token modes, and an explicit degraded-local fallback.
- [x] AC-2: New factory-managed projects prefer GitHub repo creation or attach
  flow at project start and persist canonical repo plus default-branch binding
  when available.
- [x] AC-3: If GitHub auth or binding is unavailable, Shipyard still creates or
  resumes a managed local repo state, marks GitHub automation as degraded, and
  preserves a later rebind path.
- [x] AC-4: Story execution follows branch-per-story or bug-per-story hygiene,
  including naming, sync-from-default-branch, validation-before-merge, and
  branch cleanup semantics.
- [x] AC-5: Shipyard exposes a dedicated GitHub-ops or PR-merge role that owns
  PR creation, update, review guidance, merge execution, and post-merge branch
  cleanup.
- [x] AC-6: The merge policy is explicit: first merge to the canonical default
  branch wins, and later conflicting work is surfaced as stale and routed into
  a visible recovery flow.
- [x] AC-7: Source-control auth mode, repo binding, branch state, PR state, and
  degraded-source status persist as durable runtime metadata for later hosted,
  task-graph, and coordinator stories.

## Edge Cases
- Empty/null inputs: a project with no remote binding still gets a valid local
  managed repo status rather than crashing the runtime.
- Boundary values: a one-story project still uses the same branch and PR
  contracts as a larger backlog.
- Invalid/malformed data: missing default branch, externally deleted branch, or
  a PR merged outside Shipyard fails clearly and updates status instead of
  silently assuming success.
- External-service failures: expired GitHub auth, rate limiting, or service API
  failures move the project into degraded mode without discarding local state.

## Non-Functional Requirements
- Security: auth adapters must not require committed secrets or leak tokens into
  traces or logs.
- Reliability: repo binding and degraded-mode transitions must be restart-safe.
- Observability: auth mode, repo binding, branch sync result, PR state, and
  merge conflicts must be visible in runtime traces and status payloads.
- Compatibility: local CLI-driven workflows continue to work while deployed
  runtimes can use hosted-safe auth.

## Out of Scope
- GitHub Issues or Projects synchronization.
- Branch protection policy management in the GitHub UI.
- Zero-touch semantic merge conflict resolution with no coordinator involvement.

## Done Definition
- Shipyard has one coherent GitHub-first source-control contract that works in
  local and deployed runtimes, and it can degrade gracefully without making the
  project unmanageable.

## Implementation Evidence

- `shipyard/src/source-control/contracts.ts`, `shipyard/src/source-control/store.ts`,
  and `shipyard/src/source-control/runtime.ts`: add the durable
  `SourceControlCapability`, `RepositoryBinding`, `StoryBranch`,
  `PullRequestArtifact`, `MergeDecision`, `ConflictResolutionTicket`, and
  workbench projection contracts; persist them under
  `.shipyard/source-control/runtime.json`; and implement GitHub-token /
  GitHub-app / OAuth / `gh` CLI capability resolution, explicit degraded-local
  fallback, branch-per-story naming, PR lifecycle updates, default-branch
  revision tracking, and first-merge-wins stale/conflict recovery.

  ```ts
  export const sourceControlAuthModeSchema = z.enum([
    "github-app",
    "github-token",
    "oauth-token",
    "github-cli",
    "degraded-local",
  ]);
  ```

- `shipyard/src/tools/source-control.ts`, `shipyard/src/tools/index.ts`, and
  `shipyard/src/phases/code/index.ts`: register the new
  `manage_source_control` tool so runtime turns can query and mutate the
  canonical source-control contract instead of treating GitHub as an
  out-of-band operator habit.

- `shipyard/src/agents/profiles.ts`: adds the dedicated `pr-ops` profile so PR
  creation, merge execution, cleanup, and stale-merge recovery are explicitly
  owned by one runtime role.

- `shipyard/src/engine/state.ts`,
  `shipyard/src/tools/target-manager/create-target.ts`,
  `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`, and
  `shipyard/src/ui/server.ts`: create the target-local
  `.shipyard/source-control/` directory, seed source-control state when new
  targets are created, and publish compact auth / binding / branch / PR /
  degraded summaries into `workbenchState.sourceControl` for later hosted,
  board, and coordinator consumers.

- `shipyard/tests/source-control-runtime.test.ts`: adds focused coverage for
  hosted-safe auth precedence, explicit degraded local fallback, durable repo
  binding persistence, first-merge-wins stale-branch marking, dedicated
  `pr-ops` ownership, conflict-ticket creation, and session/workbench
  projection.

- `shipyard/tests/loop-runtime.test.ts`: includes the narrow duplicate-property
  cleanup needed to restore the repo's TypeScript green baseline while this
  story was in flight.

## LangSmith / Monitoring

- Fresh deterministic finish-check traces on project
  `shipyard-p11-s06-finishcheck`:
  - happy-path merge trace:
    `019d3703-2225-7000-8000-05a9facbb402`
  - stale-merge blocked trace:
    `019d3703-3aaa-7000-8000-02ad171adf25`
- Commands reviewed:
  - traced runtime script via
    `pnpm --dir shipyard exec node --import tsx -`
  - `pnpm --dir shipyard exec langsmith trace list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --limit 5 --full`
  - `pnpm --dir shipyard exec langsmith trace get <trace-id> --project "$LANGSMITH_PROJECT" --full`
  - `pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --trace-ids <trace-ids> --full`
  - `pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  - `pnpm --dir shipyard exec langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3`
- The reviewed traces confirmed:
  - the happy-path scenario resolved `github-token` auth, bound
    `acme/shipyard-target`, completed a merge, and marked the competing PR
    stale with one generated conflict ticket
  - the blocked scenario recorded an expected `blocked` merge decision, kept
    the merge path under `pr-ops`, and surfaced a concrete conflict-ticket id
    instead of a silent force-merge
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  returned `[]` for the isolated finish-check project.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null` for the isolated finish-check project.
