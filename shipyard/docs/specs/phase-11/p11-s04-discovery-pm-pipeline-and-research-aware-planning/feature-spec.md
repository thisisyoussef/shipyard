# Feature Spec

## Metadata
- Story ID: P11-S04
- Story Title: Discovery, PM Pipeline, and Research-Aware Planning
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

The current Shipyard runtime can build a task queue from an instruction, but it
cannot yet run the richer front half of a software-factory workflow. There is
no runtime-native DiscoveryBrief, epic, user story, technical spec, or ordered
backlog flow, and there is no read-only research lane that can consult official
docs or current best practices before planning a feature. Those workflows exist
as helper process outside the product. Shipyard needs discovery and PM phases
that can produce, gate, and persist those artifacts natively.

## Story Pack Objectives
- Objective 1: Let Shipyard go from a raw idea to approved discovery and PM
  artifacts before implementation starts.
- Objective 2: Add a read-only research lane that prefers official docs and
  primary sources when a story depends on unstable or unfamiliar systems.
- Objective 3: Produce a durable backlog that later TDD and coordination phases
  can consume directly.
- How this story contributes to the overall objective set: it turns the front
  half of the factory from a helper-harness discipline into a real Shipyard
  runtime lane.

## User Stories
- As an operator, I want Shipyard to talk through discovery, produce a brief,
  and pause for approval before it starts inventing implementation.
- As a PM phase, I want to write epics, stories, specs, and backlog entries as
  artifacts instead of informal text in chat.
- As a planner, I want to consult official documentation and repo-local context
  before finalizing a spec when the feature depends on external systems.

## Acceptance Criteria
- [ ] AC-1: Shipyard has runtime-native discovery and PM phases that can create
  discovery briefs, epics, user stories, technical specs, and backlog artifacts.
- [ ] AC-2: Discovery and PM phases can consume approved upstream artifacts
  through the pipeline runner rather than re-reading loose files.
- [ ] AC-3: Shipyard can run a read-only research lookup lane that records
  source attribution and distilled takeaways for planning artifacts.
- [ ] AC-4: Research lookup prefers official docs and other primary references
  when the story involves unstable APIs, new integrations, or other high-risk
  areas.
- [ ] AC-5: The operator can skip discovery or jump back into PM with explicit
  artifact and audit-trail support.
- [ ] AC-6: The PM phase emits an ordered backlog artifact that later TDD and
  coordination phases can query directly.

## Edge Cases
- Empty/null inputs: discovery with no usable brief fails early with a clear
  request for more operator input.
- Boundary values: a one-story backlog still uses the same artifact and status
  contracts as a multi-epic backlog.
- Invalid/malformed data: malformed research results or bad source metadata do
  not become approved planning artifacts.
- External-service failures: research failures fall back to local-repo findings
  plus explicit uncertainty instead of fabricated authority.

## Non-Functional Requirements
- Security: research tooling must remain read-only and avoid pulling secrets
  from repo or environment into artifacts.
- Performance: research lookup should stay bounded and source-limited rather
  than becoming an open-ended browse loop.
- Observability: source attribution, skipped research, and PM artifact lineage
  must be visible in traces and later audits.
- Reliability: backlog ordering and story IDs must remain deterministic enough
  to support later task-graph wiring.

## Out of Scope
- Brand and visual design phases.
- Kanban board UI.
- Fully automated competitive tear-downs or mood-board tooling.

## Done Definition
- Shipyard can produce approved discovery and PM artifacts, backed by read-only
  research, before implementation starts.
