# Feature Spec

## Metadata
- Story ID: P11-S07
- Story Title: Railway Hosted Runtime and Remote Workspace Integration
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Phase 9 established a Railway-hosted Shipyard baseline, but the new factory
pack still risks reading as local-first. Discovery, PM, TDD, GitHub branch
management, approvals, and coordinator state all need to work when Shipyard is
running on Railway with a persistent mounted workspace, not just from a local
terminal. The hosted runtime also cannot rely on local `gh auth`; it needs a
deployed-safe way to authenticate to GitHub, and it needs a clear fallback when
GitHub binding is unavailable so the project can remain manageable. Shipyard
therefore needs a Railway-hosted factory contract that reuses the existing
hosted runtime baseline, restores projects from persistent workspaces, consumes
the normalized source-control capability from `P11-S06`, and exposes clear
hosted preview or deploy state without confusing the Shipyard service URL with
the target app URL.

## Story Pack Objectives
- Objective 1: Make the same runtime factory behavior available from Railway,
  not only from local operator machines.
- Objective 2: Support hosted-safe GitHub auth and repo sync inside the Railway
  runtime without assuming interactive shell access.
- Objective 3: Preserve project manageability when hosted GitHub auth or binding
  is unavailable through an explicit degraded hosted mode.
- Objective 4: Keep the hosted Shipyard URL, private preview state, and target
  app public URLs clearly separated.
- How this story contributes to the overall objective set: it turns the pack
  from a local-only architecture sketch into a credible hosted factory path.

## User Stories
- As a hosted operator, I want to open Shipyard on Railway and run the same
  artifact, planning, and implementation flow without local shell setup.
- As a runtime owner, I want Railway-hosted projects to restore from a
  persistent volume and resume the same GitHub-backed or degraded-local state
  they had before a restart.
- As a deployment-minded user, I want GitHub-backed management to work in the
  deployed product too, not only on my laptop.
- As a fallback operator, I want the hosted project to remain usable even when
  GitHub auth is unavailable, with blocked actions called out clearly.

## Acceptance Criteria
- [ ] AC-1: Shipyard defines a Railway-hosted factory runtime contract that
  builds on the Phase 9 hosted baseline and keeps all factory artifacts and
  runtime state under the persistent workspace path.
- [ ] AC-2: Railway-hosted Shipyard can use a deployed-safe GitHub auth adapter
  such as OAuth, GitHub App, or service token instead of relying on local `gh`.
- [ ] AC-3: Hosted projects can clone, pull, resume, and sync canonical GitHub
  bindings inside the Railway workspace when auth is available.
- [ ] AC-4: If GitHub auth or binding is unavailable in hosted mode, Shipyard
  still creates or resumes a managed local workspace, records degraded-source
  status, and keeps non-merge phases usable.
- [ ] AC-5: Hosted runtime status clearly distinguishes the Shipyard service
  URL, any private preview URL, and the target app's public deployment URL.
- [ ] AC-6: Railway-specific env vars, volume requirements, health checks, and
  secret requirements are explicit for model provider, GitHub capability,
  deploy tokens, and persistent workspace state.
- [ ] AC-7: Local and hosted runtimes share the same artifact, source-control,
  and coordinator contracts so later stories do not fork behavior by platform.

## Edge Cases
- Empty/null inputs: a fresh hosted workspace with no bound repo still enters a
  valid degraded local mode.
- Boundary values: a single small project uses the same hosted restore contract
  as a larger multi-story workspace.
- Invalid/malformed data: missing volume mount, stale repo binding, or a hosted
  auth adapter with insufficient scopes fails clearly and preserves workspace
  state.
- External-service failures: GitHub auth expiry, Railway restart, missing public
  domain, or browser dependency gaps degrade specific capabilities without
  pretending the whole project is lost.

## Non-Functional Requirements
- Security: hosted secrets stay in provider configuration, not committed files
  or user-visible traces.
- Reliability: hosted workspace restore and degraded-source recovery must be
  restart-safe.
- Observability: hosted auth mode, workspace mount health, preview status, and
  deploy status must be visible in runtime traces and health surfaces.
- Compatibility: the same runtime contracts must still work locally when Railway
  env vars are absent.

## Out of Scope
- A new hosted UI pack or board design.
- Non-Railway infrastructure providers in this story.
- Full target-app production deployment logic beyond surfacing existing deploy
  outputs and dependencies.

## Done Definition
- Shipyard has one credible Railway-hosted factory runtime contract that can
  manage GitHub-backed or degraded-local projects without relying on local shell
  auth assumptions.
