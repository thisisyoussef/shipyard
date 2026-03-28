# Feature Spec

## Metadata
- Story ID: P11-S01
- Story Title: Versioned Artifact Registry and Query Surface
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard already persists useful runtime data, but it does so through several
special-purpose formats: plans under `.shipyard/plans/`, handoffs under
`.shipyard/artifacts/`, checkpoints elsewhere, and ad hoc session fields for
active work. That is enough for the current runtime, but not enough for a true
spec-driven factory flow. Discovery briefs, epics, user stories, technical
plans, task breakdowns, verification reports, bug reports, approvals, and
coordination notes all need one shared artifact vocabulary that can be saved,
versioned, queried, and handed between phases.

## Story Pack Objectives
- Objective 1: Make artifacts the durable contract between planning,
  implementation, review, and orchestration phases.
- Objective 2: Reuse Shipyard's target-local persistence model instead of
  introducing a second external state system too early.
- Objective 3: Preserve today's handoffs and plan queues while giving later
  phases a richer artifact substrate to build on.
- How this story contributes to the overall objective set: it is the pack's
  storage and query foundation. Every later approval, PM, TDD, and coordination
  story depends on a shared artifact model.

## User Stories
- As an operator, I want every important planning or verification output saved
  as a named artifact so I can inspect and approve it later.
- As a phase runner, I want to query the latest approved artifact of a given
  type instead of reconstructing context from chat history.
- As a future coordinator, I want story, spec, bug, and task artifacts to share
  one metadata model for dependency and status tracking.

## Acceptance Criteria
- [ ] AC-1: Shipyard has a typed artifact contract with metadata for ID, type,
  parent, version, status, produced-by, timestamps, tags, and dependencies.
- [ ] AC-2: Shipyard can save a new artifact version and preserve older
  versions without data loss.
- [ ] AC-3: Shipyard can query artifacts by type, status, tags, and parent or
  dependency metadata.
- [ ] AC-4: Existing persisted outputs such as plan queues and handoffs can be
  projected into or referenced from the new artifact registry without breaking
  current runtime flows.
- [ ] AC-5: Artifact content can be stored as human-readable Markdown or typed
  JSON while sharing one metadata/query layer.
- [ ] AC-6: Artifact summaries are compact enough to feed later turns without
  replaying full artifact bodies unless a phase explicitly asks for them.

## Edge Cases
- Empty/null inputs: querying a type with no artifacts returns an explicit empty
  result, not an ambiguous failure.
- Boundary values: artifacts with many prior versions remain queryable and
  sorted predictably.
- Invalid/malformed data: corrupted metadata or content fails clearly and does
  not poison unrelated artifact reads.
- External-service failures: if indexing or query-cache helpers fail, Shipyard
  still preserves the raw artifact files.

## Non-Functional Requirements
- Security: artifact metadata and content must not accidentally store provider
  secrets or raw access tokens.
- Performance: querying recent approved artifacts should stay fast enough for
  per-turn planning use.
- Observability: artifact creation, version bumps, migrations, and failed loads
  should appear in local traces and operator diagnostics.
- Reliability: artifact writes must be atomic enough that partial writes do not
  leave the registry in an ambiguous state.

## Out of Scope
- Approval workflow semantics.
- Visual artifact browsers or editors.
- Full-text semantic search beyond bounded metadata and content retrieval.

## Done Definition
- Shipyard can treat specs, plans, reports, and future coordination outputs as
  first-class persisted artifacts instead of one-off file formats.
