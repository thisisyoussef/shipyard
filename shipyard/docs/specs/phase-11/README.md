# Phase 11: Runtime Factory Foundations Story Pack

- Pack: Runtime Factory Foundations
- Estimate: 36-48 hours
- Date: 2026-03-28
- Status: In progress; P11-S01, P11-S02, P11-S03, P11-S04, and P11-S05 implemented, remaining runtime-only stories planned

## Pack Objectives

1. Promote the best parts of the local `.ai/` harness into Shipyard-native runtime contracts instead of leaving them as operator-only discipline.
2. Make specs, plans, task breakdowns, approvals, skills, and handoff artifacts first-class, persisted, and queryable under the target-local Shipyard state tree.
3. Add specialized agent roles for discovery, PM, test authoring, implementation, review, and coordination without abandoning Shipyard's explicit safety boundaries.
4. Add research-aware planning so Shipyard can consult official documentation and current best practices when a story depends on external systems or unstable APIs.
5. Make GitHub the preferred canonical source for factory-managed projects across local and deployed runtimes, with explicit fallback behavior when GitHub auth or binding is unavailable.
6. Make the factory usable on Railway-hosted persistent workspaces instead of treating local-only execution as the default forever.
7. Lay the non-visual foundation for future kanban-style multi-agent execution: task graph metadata, coordination messages, leases, source-control state, hosted-runtime state, and board projections.
8. Keep the visual task-board and broader UI treatment in a separate pack so runtime architecture can move cleanly without colliding with active UI work.

## Shared Constraints

- `.ai/` remains helper scaffolding for this repository. Productized behavior and durable contracts belong under `shipyard/`.
- This pack builds on the already-drafted Phase 10 runtime direction and the existing Phase 9 Railway-hosted baseline instead of replacing them. Durable threads, policy profiles, hosted workspace constraints, and isolated task runtimes remain upstream assumptions.
- GitHub-backed repo binding is the preferred canonical source for factory-managed projects. Local and hosted working copies are materializations of that source when binding is available.
- Hosted and local auth paths must both work. Local `gh` CLI can be one adapter, but deployed runtimes must also support hosted-safe auth paths such as OAuth, GitHub App, or token-backed service credentials without assuming interactive shell access.
- When GitHub auth or repo binding is unavailable, Shipyard falls back to an explicit managed-local mode that keeps the project usable while marking PR or merge automation blocked until rebind succeeds.
- The coordinator remains the primary write authority for the main target until isolation, leases, and explicit apply flows are in place.
- New research capability must stay read-only, source-aware, and bounded. Prefer official docs and primary references before less authoritative material.
- All durable state remains target-local under `.shipyard/` and must integrate with current trace, session, and resume behavior in both local and Railway-hosted workspaces.
- This pack explicitly excludes the rendered kanban board, animation system, and broader board UX polish. It only defines the runtime and projection contracts that a later UI pack can consume.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P11-S01 | Versioned Artifact Registry and Query Surface | Replace ad hoc persisted files with one typed artifact store for specs, plans, reviews, reports, and decisions. | Phase 7/8/10 artifact and thread foundations |
| P11-S02 | Phase Pipeline Runner and Artifact Approval Gates | Execute multi-phase flows with pause, approve, reject, edit, and resume semantics between artifact-producing phases. | P11-S01, Phase 10 approval policy direction |
| P11-S03 | Runtime Skill Registry, Agent Profiles, and Role Loading | Make skills and role profiles runtime-native so phases can load conventions, tools, and bounded specialist behavior intentionally. | P11-S01, P11-S02, provider-neutral routing |
| P11-S04 | Discovery, PM Pipeline, and Research-Aware Planning | Add discovery briefs, epics, stories, specs, backlog artifacts, and read-only official-doc lookup before implementation starts. | P11-S01, P11-S02, P11-S03 |
| P11-S05 | Three-Role TDD Runtime and Reviewable Handoff Contracts | Turn the current docs-only TDD pipeline into a durable runtime lane with RED/GREEN guards and explicit handoffs. | P11-S01, P11-S03, P11-S04 |
| P11-S06 | GitHub Source of Truth, Branch Hygiene, and PR Merge Operations | Make GitHub-aware source control, repo binding, branch-per-story hygiene, PR lifecycle, and merge-conflict recovery first-class runtime contracts. | P11-S01, P11-S02, P11-S03, P11-S04 |
| P11-S07 | Railway Hosted Runtime and Remote Workspace Integration | Make the same factory runtime usable from Railway-hosted persistent workspaces with hosted-safe auth, durable workspaces, and explicit degraded modes. | Phase 9 hosted Railway baseline, P11-S01, P11-S02, P11-S06 |
| P11-S08 | Task Graph, Dependency Metadata, and Coordination Bus Contracts | Define the non-visual graph, assignment, board-projection, source-control, and lease contracts needed for safe multi-agent execution later. | P11-S01, P11-S02, P11-S04, P11-S05, P11-S06, P11-S07 |
| P11-S09 | Master Coordinator and Parallel Story Orchestration | Evolve `ultimate mode` into a true master coordinator that can supervise multiple stories, dependencies, hosted workers, and specialist agents. | P11-S02, P11-S03, P11-S04, P11-S05, P11-S06, P11-S07, P11-S08 |

## Sequencing Rationale

- `P11-S01` lands first because the rest of the pack needs a single artifact vocabulary instead of several unrelated storage shapes.
- `P11-S02` follows because approvals, retries, edits, and phase handoffs only make sense once artifacts are versioned and queryable.
- `P11-S03` makes skills and role identity runtime-native before downstream phases start depending on them.
- `P11-S04` introduces the product-management and research side once the runtime can actually persist and gate its output.
- `P11-S05` adds the implementation lane after PM artifacts and role loading exist.
- `P11-S06` makes that lane source-controlled and mergeable across local and deployed runtimes without assuming local shell auth forever.
- `P11-S07` turns the same contracts into a credible Railway-hosted runtime instead of leaving factory execution local-only.
- `P11-S08` defines the task graph and coordination substrate only after artifacts, approvals, TDD, source-control, and hosted-runtime state are explicit enough to project.
- `P11-S09` lands last because the master coordinator should orchestrate proven lower-level contracts, not invent them mid-flight.

## Future UI Boundary

This pack intentionally stops at runtime and projection contracts. A later UI-focused pack should consume:

- artifact summaries and approval state from `P11-S01` and `P11-S02`
- role/profile metadata from `P11-S03`
- backlog and story/task metadata from `P11-S04`
- TDD-stage progress and review evidence from `P11-S05`
- GitHub binding, auth mode, branch, and PR metadata from `P11-S06`
- hosted workspace, preview, and deployment availability state from `P11-S07`
- board columns, dependency edges, assignment state, source-control state, and lease status from `P11-S08`
- coordinator scheduling, active-agent status, and conflict-recovery state from `P11-S09`

That later pack can concentrate on board interaction design, transitions, visual hierarchy, and operator ergonomics without redefining runtime state.

## Whole-Pack Success Signal

- Shipyard can move from idea -> approved spec -> queued task -> branch-backed or explicitly degraded implementation lane -> reviewable result using runtime-native artifacts instead of manual workflow memory.
- Discovery, PM, planning, and TDD all produce durable artifacts that later turns and later agents can query explicitly.
- Skills, agent profiles, and model routing are phase-aware and inspectable rather than hidden in helper docs.
- GitHub-backed source control and Railway-hosted runtime execution share one coherent contract, with explicit degraded fallback when auth or binding is unavailable.
- Task dependencies, assignments, source-control refs, hosted-runtime state, and coordination messages are durable enough to power a future kanban board and safe parallel execution.
- `ultimate mode` can eventually supervise a real multi-story runtime with human interrupts, source-control conflicts, and approvals instead of just alternating with a simulator on one long loop.

## Implementation Evidence

- `shipyard/docs/specs/phase-11/p11-s01-versioned-artifact-registry-and-query-surface/feature-spec.md`:
  records the first shipped Phase 11 foundation story, including checked
  acceptance criteria and code-level evidence.
- `shipyard/docs/specs/phase-11/p11-s02-phase-pipeline-runner-and-artifact-approval-gates/feature-spec.md`:
  records the shipped pipeline runner, approval-gate semantics, and code-level
  evidence for explicit `pipeline ...` execution.
- `shipyard/docs/specs/phase-11/p11-s03-runtime-skill-registry-agent-profiles-and-role-loading/feature-spec.md`:
  records the shipped runtime skill manifests, agent profiles, phase-default
  skill loading, and browser/trace-visible runtime-assist state.
- `shipyard/docs/specs/phase-11/p11-s04-discovery-pm-pipeline-and-research-aware-planning/feature-spec.md`:
  records the shipped discovery -> research -> PM runtime lane, official-doc
  preference, deterministic backlog output, and trace-backed verification.
- `shipyard/src/artifacts/types.ts`, `shipyard/src/artifacts/registry/index.ts`,
  and `shipyard/src/engine/state.ts`: implement the shared artifact registry
  contract, target-local registry layout, versioned save/load/query helpers,
  and lazy projection of legacy plans and handoffs.
- `shipyard/src/pipeline/contracts.ts`, `shipyard/src/pipeline/store.ts`,
  `shipyard/src/pipeline/defaults.ts`, and `shipyard/src/pipeline/turn.ts`:
  implement durable pipeline runs, approval decisions, default phase presets,
  and the explicit pipeline command executor.
- `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/workbench-state.ts`,
  `shipyard/src/ui/server.ts`, and `shipyard/src/engine/loop.ts`: route
  `pipeline ...` commands through the CLI/browser runtimes and publish compact
  approval-wait state through the persisted workbench snapshot.
- `shipyard/src/skills/contracts.ts`, `shipyard/src/skills/registry.ts`,
  `shipyard/src/agents/profiles.ts`, `shipyard/src/context/envelope.ts`,
  `shipyard/src/engine/turn.ts`, and `shipyard/src/pipeline/turn.ts`:
  implement runtime-native skill discovery/loadouts, typed profile routing, and
  prompt/session/trace propagation of the active runtime assist state.
- `shipyard/src/research/lookup.ts`,
  `shipyard/src/tools/lookup-official-docs.ts`,
  `shipyard/src/phases/discovery/index.ts`,
  `shipyard/src/phases/pm/index.ts`,
  `shipyard/src/pipeline/planning-artifacts.ts`,
  `shipyard/src/pipeline/defaults.ts`, and `shipyard/src/pipeline/turn.ts`:
  implement the discovery/research/PM phase factories, official-doc-first
  research with repo-local fallback, artifact normalization, deterministic
  backlog generation, and optional or alternate consumed-artifact resolution.
- `shipyard/src/tdd/contracts.ts`, `shipyard/src/tdd/store.ts`,
  `shipyard/src/tdd/turn.ts`, `shipyard/src/engine/turn.ts`,
  `shipyard/src/engine/state.ts`, `shipyard/src/engine/loop.ts`,
  `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/workbench-state.ts`,
  `shipyard/src/ui/server.ts`, and `shipyard/src/agents/profiles.ts`:
  implement the runtime-native three-role TDD lane, `tdd start|continue|status`
  routing, durable lane persistence, workbench-visible stage summaries, the
  `test-author` profile, RED/GREEN guards, immutable test enforcement, and
  structured handoff/escalation/quality artifacts.
- `shipyard/skills/**`: provides the first built-in runtime skill manifests and
  prompt fragments used by code, target-manager, discovery, feature-spec, and
  technical-plan phases.
- `shipyard/tests/artifact-registry.test.ts`: validates versioning, compact
  summary behavior, malformed metadata isolation, and legacy artifact
  projection without breaking the current runtime.
- `shipyard/tests/pipeline-runtime.test.ts` and `shipyard/tests/ui-runtime.test.ts`:
  validate required/advisory gates, edited approvals, reject/rerun behavior,
  restart-safe resume, and browser-visible approval-wait session snapshots.
- `shipyard/tests/runtime-skills.test.ts` and `shipyard/tests/turn-runtime.test.ts`:
  validate runtime skill discovery, duplicate/invalid manifest handling,
  reversible tool loading, ordered prompt assembly, and profile-aware turn
  prompts with persisted runtime-assist metadata.
- `shipyard/tests/discovery-pm-pipeline.test.ts` and
  `shipyard/tests/research-lane.test.ts`: validate the default
  discovery/research/PM pipeline, approval-gated resume behavior, deterministic
  backlog ordering, official-doc ranking, and explicit repo-local fallback when
  external research is unavailable.
- `shipyard/tests/tdd-runtime.test.ts` and `shipyard/tests/loop-runtime.test.ts`:
  validate RED-before-implementer guards, already-green escalations,
  restart-safe lane persistence, immutable test protection, reviewer quality
  reports, optional-check downgrade behavior, and `tdd` command routing through
  the main loop and browser runtimes.
