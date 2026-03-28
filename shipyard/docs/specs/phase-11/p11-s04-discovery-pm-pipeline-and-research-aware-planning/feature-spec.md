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
- [x] AC-1: Shipyard has runtime-native discovery and PM phases that can create
  discovery briefs, epics, user stories, technical specs, and backlog artifacts.
- [x] AC-2: Discovery and PM phases can consume approved upstream artifacts
  through the pipeline runner rather than re-reading loose files.
- [x] AC-3: Shipyard can run a read-only research lookup lane that records
  source attribution and distilled takeaways for planning artifacts.
- [x] AC-4: Research lookup prefers official docs and other primary references
  when the story involves unstable APIs, new integrations, or other high-risk
  areas.
- [x] AC-5: The operator can skip discovery or jump back into PM with explicit
  artifact and audit-trail support.
- [x] AC-6: The PM phase emits an ordered backlog artifact that later TDD and
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

## Implementation Evidence

- `shipyard/src/artifacts/types.ts`: adds the runtime-native discovery,
  research, epic, user-story, technical-spec, and backlog artifact contracts so
  the pipeline persists PM outputs through the registry instead of treating
  them as loose chat text.

  ```ts
  export interface ResearchLookupResult {
    query: string;
    lookupStatus: ResearchLookupStatus;
    sources: ResearchSourceRecord[];
  }
  ```

- `shipyard/src/phases/discovery/index.ts`, `shipyard/src/phases/pm/index.ts`,
  and `shipyard/src/pipeline/defaults.ts`: define the shipped discovery ->
  research -> epics -> user-stories -> technical-spec -> backlog pipeline with
  typed phase contracts, approval gates, and explicit artifact dependencies.

  ```ts
  phases: [
    createDiscoveryPipelinePhase(),
    createResearchPipelinePhase(),
    createEpicsPipelinePhase(),
    createUserStoriesPipelinePhase(),
    createTechnicalSpecPipelinePhase(),
    createBacklogPipelinePhase(),
  ],
  ```

- `shipyard/src/research/lookup.ts` and
  `shipyard/src/tools/lookup-official-docs.ts`: implement the bounded
  read-only research lane, ranking official documentation ahead of lower-tier
  sources and falling back clearly to repo-local context when external research
  is unavailable.

  ```ts
  if (normalized.lookupStatus === "external" && normalized.sources.length > 0) {
    return normalized;
  }
  ```

- `shipyard/src/pipeline/planning-artifacts.ts` and
  `shipyard/src/pipeline/turn.ts`: normalize PM JSON artifacts, support
  alternate and optional consumed-artifact requirements such as
  `discovery-brief|pipeline-brief` and `research-brief?`, and generate a
  deterministic ordered backlog from approved stories/specs.

  ```ts
  const orderedStories = [...stories.stories].sort((left, right) => {
    const priorityDelta = left.priority - right.priority;
    return priorityDelta !== 0 ? priorityDelta : left.id.localeCompare(right.id);
  });
  ```

- `shipyard/tests/discovery-pm-pipeline.test.ts` and
  `shipyard/tests/research-lane.test.ts`: verify the default pipeline produces
  discovery, research, epic, story, technical-spec, and backlog artifacts; that
  approval-gated resume works; that backlog ordering is deterministic; and that
  official-doc ranking plus repo-local fallback are preserved.

## LangSmith / Monitoring

- Fresh deterministic finish-check traces on project `shipyard`:
  - start trace: `019d36d5-26a3-7000-8000-00d8abe04305`
  - discovery approval trace: `019d36d5-3e49-7000-8000-0023efabd79d`
  - completed backlog trace: `019d36d5-54f5-7000-8000-061d6a20bf5f`
- The verification run completed the default discovery/PM pipeline with a fake
  model adapter plus injected research lookup, then approved discovery and
  technical-spec gates before finishing backlog generation.
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 5 --error --limit 10 --full`
  returned `[]`.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null`.
