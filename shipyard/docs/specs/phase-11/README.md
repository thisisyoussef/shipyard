# Phase 11: Runtime Factory Foundations Story Pack

- Pack: Runtime Factory Foundations
- Estimate: 28-36 hours
- Date: 2026-03-28
- Status: Planned; runtime-only pack drafted, implementation not started

## Pack Objectives

1. Promote the best parts of the local `.ai/` harness into Shipyard-native runtime contracts instead of leaving them as operator-only discipline.
2. Make specs, plans, task breakdowns, approvals, skills, and handoff artifacts first-class, persisted, and queryable under the target-local Shipyard state tree.
3. Add specialized agent roles for discovery, PM, test authoring, implementation, review, and coordination without abandoning Shipyard's explicit safety boundaries.
4. Add research-aware planning so Shipyard can consult official documentation and current best practices when a story depends on external systems or unstable APIs.
5. Lay the non-visual foundation for future kanban-style multi-agent execution: task graph metadata, coordination messages, leases, and board projections.
6. Keep the visual task-board and broader UI treatment in a separate pack so runtime architecture can move cleanly without colliding with active UI work.

## Shared Constraints

- `.ai/` remains helper scaffolding for this repository. Productized behavior and durable contracts belong under `shipyard/`.
- This pack builds on the already-drafted Phase 10 runtime direction instead of replacing it. Durable threads, policy profiles, and isolated task runtimes remain upstream assumptions.
- The coordinator remains the primary write authority for the main target until isolation, leases, and explicit apply flows are in place.
- New research capability must stay read-only, source-aware, and bounded. Prefer official docs and primary references before less authoritative material.
- All durable state remains target-local under `.shipyard/` and must integrate with current trace, session, and resume behavior.
- This pack explicitly excludes the rendered kanban board, animation system, and broader board UX polish. It only defines the runtime and projection contracts that a later UI pack can consume.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P11-S01 | Versioned Artifact Registry and Query Surface | Replace ad hoc persisted files with one typed artifact store for specs, plans, reviews, reports, and decisions. | Phase 7/8/10 artifact and thread foundations |
| P11-S02 | Phase Pipeline Runner and Artifact Approval Gates | Execute multi-phase flows with pause, approve, reject, edit, and resume semantics between artifact-producing phases. | P11-S01, Phase 10 approval policy direction |
| P11-S03 | Runtime Skill Registry, Agent Profiles, and Role Loading | Make skills and role profiles runtime-native so phases can load conventions, tools, and bounded specialist behavior intentionally. | P11-S01, P11-S02, provider-neutral routing |
| P11-S04 | Discovery, PM Pipeline, and Research-Aware Planning | Add discovery briefs, epics, stories, specs, backlog artifacts, and read-only official-doc lookup before implementation starts. | P11-S01, P11-S02, P11-S03 |
| P11-S05 | Three-Role TDD Runtime and Reviewable Handoff Contracts | Turn the current docs-only TDD pipeline into a durable runtime lane with RED/GREEN guards and explicit handoffs. | P11-S01, P11-S03, P11-S04 |
| P11-S06 | Task Graph, Dependency Metadata, and Coordination Bus Contracts | Define the non-visual graph, assignment, board-projection, and lease contracts needed for safe multi-agent execution later. | P11-S01, P11-S02, P11-S04, P11-S05 |
| P11-S07 | Master Coordinator and Parallel Story Orchestration | Evolve `ultimate mode` into a true master coordinator that can supervise multiple stories, dependencies, and specialist agents. | P11-S02, P11-S03, P11-S04, P11-S05, P11-S06 |

## Sequencing Rationale

- `P11-S01` lands first because the rest of the pack needs a single artifact vocabulary instead of several unrelated storage shapes.
- `P11-S02` follows because approvals, retries, edits, and phase handoffs only make sense once artifacts are versioned and queryable.
- `P11-S03` makes skills and role identity runtime-native before downstream phases start depending on them.
- `P11-S04` introduces the product-management and research side once the runtime can actually persist and gate its output.
- `P11-S05` adds the implementation lane after PM artifacts and role loading exist.
- `P11-S06` defines the task graph and coordination substrate only after artifacts, approvals, PM output, and TDD stages are explicit enough to project.
- `P11-S07` lands last because the master coordinator should orchestrate proven lower-level contracts, not invent them mid-flight.

## Future UI Boundary

This pack intentionally stops at runtime and projection contracts. A later UI-focused pack should consume:

- artifact summaries and approval state from `P11-S01` and `P11-S02`
- role/profile metadata from `P11-S03`
- backlog and story/task metadata from `P11-S04`
- TDD-stage progress and review evidence from `P11-S05`
- board columns, dependency edges, assignment state, and lease status from `P11-S06`
- coordinator scheduling and active-agent status from `P11-S07`

That later pack can concentrate on board interaction design, transitions, visual hierarchy, and operator ergonomics without redefining runtime state.

## Whole-Pack Success Signal

- Shipyard can move from idea -> approved spec -> queued task -> TDD implementation -> reviewable result using runtime-native artifacts instead of manual workflow memory.
- Discovery, PM, planning, and TDD all produce durable artifacts that later turns and later agents can query explicitly.
- Skills, agent profiles, and model routing are phase-aware and inspectable rather than hidden in helper docs.
- Task dependencies, assignments, and coordination messages are durable enough to power a future kanban board and safe parallel execution.
- `ultimate mode` can eventually supervise a real multi-story runtime with human interrupts and approvals instead of just alternating with a simulator on one long loop.

## Implementation Evidence

- N/A - planning pack only. No implementation has landed yet.
