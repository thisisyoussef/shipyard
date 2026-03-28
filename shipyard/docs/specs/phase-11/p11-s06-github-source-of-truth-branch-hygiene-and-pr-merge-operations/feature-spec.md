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
- [ ] AC-1: Shipyard defines a normalized `SourceControlCapability` contract
  that supports at least local `gh` CLI auth, hosted-safe auth such as OAuth,
  GitHub App, or service-token modes, and an explicit degraded-local fallback.
- [ ] AC-2: New factory-managed projects prefer GitHub repo creation or attach
  flow at project start and persist canonical repo plus default-branch binding
  when available.
- [ ] AC-3: If GitHub auth or binding is unavailable, Shipyard still creates or
  resumes a managed local repo state, marks GitHub automation as degraded, and
  preserves a later rebind path.
- [ ] AC-4: Story execution follows branch-per-story or bug-per-story hygiene,
  including naming, sync-from-default-branch, validation-before-merge, and
  branch cleanup semantics.
- [ ] AC-5: Shipyard exposes a dedicated GitHub-ops or PR-merge role that owns
  PR creation, update, review guidance, merge execution, and post-merge branch
  cleanup.
- [ ] AC-6: The merge policy is explicit: first merge to the canonical default
  branch wins, and later conflicting work is surfaced as stale and routed into
  a visible recovery flow.
- [ ] AC-7: Source-control auth mode, repo binding, branch state, PR state, and
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
