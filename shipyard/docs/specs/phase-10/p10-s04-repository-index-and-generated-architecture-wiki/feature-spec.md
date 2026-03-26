# Feature Spec

## Metadata
- Story ID: P10-S04
- Story Title: Repository Index and Generated Architecture Wiki
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard's explorer and planner can gather good context, but they still pay the
cost of rediscovering the same codebase facts repeatedly. For broad tasks that
touch many files, the runtime needs a durable repo index and generated
architecture notes so helper roles can start from a current code map rather
than a cold search every time.

## Story Pack Objectives
- Objective 1: Create a target-local index that summarizes important codebase
  structure and contracts.
- Objective 2: Generate durable architecture notes that planners, explorers,
  and operators can query or refresh.
- Objective 3: Reduce broad-turn context cost without sacrificing accuracy on
  changing repos.
- How this story contributes to the overall objective set: it turns codebase
  understanding into a reusable artifact layer instead of a repeated prompt
  exercise.

## User Stories
- As a planner, I want a codebase index and architecture summary so I can scope
  broad work faster and with fewer blind spots.
- As an operator, I want to see whether the codebase knowledge Shipyard is
  using is fresh or stale.
- As an explorer, I want targeted retrieval of files, modules, and architecture
  notes instead of rerunning broad search loops for every task.

## Acceptance Criteria
- [ ] AC-1: Shipyard can build and persist a target-local repository index with
  file, module, and architecture summary metadata.
- [ ] AC-2: Shipyard can generate or refresh an architecture wiki summary from
  that index and expose it as a named context source.
- [ ] AC-3: Planner and explorer flows can query the index or wiki when
  available and fall back gracefully when it is missing or stale.
- [ ] AC-4: Index freshness, last build time, and stale-state warnings are
  visible in runtime evidence and operator surfaces.
- [ ] AC-5: Large repositories are handled incrementally, with bounded work and
  clear skip reasons for unsupported paths or oversized surfaces.
- [ ] AC-6: Indexed artifacts stay target-local under `.shipyard/` and remain
  generic to Shipyard rather than app-specific backlog storage.

## Edge Cases
- Empty/null inputs: empty targets should produce a minimal empty index with an
  honest summary.
- Boundary values: small repos can build synchronously, while larger repos need
  incremental refresh.
- Invalid/malformed data: corrupted index entries are skipped or rebuilt rather
  than partially trusted.
- External-service failures: if an optional summarizer fails, the raw structural
  index remains usable and Shipyard reports that the wiki is stale.

## Non-Functional Requirements
- Security: indexed artifacts must avoid storing secrets or entire raw binary
  blobs.
- Performance: index refresh should be incremental and avoid full rebuild on
  every turn.
- Observability: traces and UI should show freshness, build duration, and
  whether planner or explorer used the index.
- Reliability: fall back to live search when index artifacts are missing or
  stale beyond tolerance.

## UI Requirements (if applicable)
- Required states: no index yet, indexing in progress, index available, index
  stale, wiki refresh failed.
- Accessibility contract: index freshness and refresh actions must be visible
  and keyboard accessible in the workbench.

## Out of Scope
- Autonomous code changes based only on the index.
- Cross-target shared knowledge stores.
- Semantic ranking over external internet sources.

## Done Definition
- Shipyard can persist and reuse codebase structure plus architecture notes
  instead of rediscovering broad repo context from scratch every time.
