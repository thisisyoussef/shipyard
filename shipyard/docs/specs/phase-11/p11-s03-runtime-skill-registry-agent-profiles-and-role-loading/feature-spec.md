# Feature Spec

## Metadata
- Story ID: P11-S03
- Story Title: Runtime Skill Registry, Agent Profiles, and Role Loading
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard already has a rich skill vocabulary and role discipline in `.ai/`, but
the product runtime cannot load or reason about those skills directly. Skills
are currently helper-harness guidance, not runtime contracts. The same is true
for agent personalities: the runtime has helper roles, but it does not have a
first-class profile model for discovery, PM, TDD, QA, deploy, or coordination
agents. To support multi-phase factory execution, Shipyard needs a runtime skill
registry plus agent profiles that phases can load explicitly and trace
deterministically.

## Story Pack Objectives
- Objective 1: Make conventions and specialist behavior runtime-native instead
  of depending on external workflow files alone.
- Objective 2: Let phases declare default skills and profile requirements so
  later orchestration is inspectable and deterministic.
- Objective 3: Prepare a bounded way to add specialized subagents without
  letting every phase improvise its own role semantics.
- How this story contributes to the overall objective set: it gives later
  discovery, PM, TDD, QA, and coordinator stories a shared way to load skills
  and role identity.

## User Stories
- As a phase runner, I want to load the right skill set automatically when a
  phase starts so the model sees the correct conventions without manual prompt
  sprawl.
- As an operator, I want to know which profile and which skills a given phase or
  helper role is using.
- As a future orchestrator, I want specialized agents to be selected through a
  typed role/profile system instead of informal prompt naming.

## Acceptance Criteria
- [x] AC-1: Shipyard has a runtime skill manifest format with prompt fragments,
  optional tools, optional references, optional validators, and compatible
  phase metadata.
- [x] AC-2: Shipyard can discover local runtime skills, list them, load them,
  unload them, and expose loaded-skill state to phases and traces.
- [x] AC-3: Phases can declare default skills that load automatically when the
  phase begins.
- [x] AC-4: Shipyard has typed agent profiles for core runtime roles such as
  discovery, PM, implementer, reviewer, QA, deploy, and coordinator.
- [x] AC-5: Profile metadata includes model-route, personality, and token or
  temperature guidance without leaking provider-specific wire types into phase
  logic.
- [x] AC-6: Runtime-native skills can coexist with the existing `.ai/` helper
  docs while Shipyard gradually promotes the most important ones into the
  product runtime.

## Edge Cases
- Empty/null inputs: requesting an unknown skill fails clearly without mutating
  the active phase state.
- Boundary values: multiple loaded skills merge predictably and preserve their
  declared order.
- Invalid/malformed data: invalid manifests, bad validators, or duplicate skill
  names fail closed during discovery.
- External-service failures: profile routing still works when a phase has no
  optional validator or reference files available.

## Non-Functional Requirements
- Security: skill loading must not silently widen tool access beyond the phase
  contract.
- Performance: skill discovery should be cheap enough to run at session or
  phase start.
- Observability: loaded skill names and active profile IDs should appear in run
  metadata and diagnostics.
- Reliability: phases should still start deterministically when optional skill
  references are missing.

## Out of Scope
- A remote public skill marketplace.
- Automatic installation of third-party packages.
- Full UI for browsing or editing skill manifests.

## Done Definition
- Shipyard can load phase-aware skills and agent profiles as runtime state
  rather than relying on helper docs alone.

## Implementation Evidence

- `shipyard/src/skills/contracts.ts`, `shipyard/src/skills/registry.ts`, and
  `shipyard/skills/**`: add the runtime manifest format, discovery/load/unload
  logic, prompt assembly, tool ownership/unload boundaries, and the initial
  built-in skill set (`artifact-writing`, `runtime-safety`,
  `target-manager-ops`, `spec-writing`, `technical-planning`).

  ```ts
  export async function resolveRuntimeLoadout(
    options: ResolveRuntimeLoadoutOptions,
  ): Promise<RuntimeLoadout> {
    const activeProfile = options.agentProfileId
      ? requireAgentProfile(options.agentProfileId)
      : null;
    // ...
  }
  ```

- `shipyard/src/agents/profiles.ts`: defines the typed runtime profile catalog
  for coordinator, discovery, PM, implementer, reviewer, QA, deploy, explorer,
  planner, verifier, browser-evaluator, human-simulator, and target-enrichment.

  ```ts
  export interface AgentProfile {
    id: AgentRoleId;
    name: string;
    role: string;
    personality: string;
    modelRoute: ModelRouteId;
  }
  ```

- `shipyard/src/phases/phase.ts`, `shipyard/src/phases/code/index.ts`,
  `shipyard/src/phases/target-manager/index.ts`, and
  `shipyard/src/pipeline/defaults.ts`: let phases declare `agentProfileId` and
  `defaultSkills`, then seed the first runtime-native defaults for code,
  target-manager, discovery, feature-spec, and technical-plan phases.

- `shipyard/src/context/envelope.ts`, `shipyard/src/engine/turn.ts`, and
  `shipyard/src/pipeline/turn.ts`: compose the active profile block plus loaded
  skill prompt block into system prompts, apply profile-derived routing/token
  guidance, and persist `runtimeAssist` into session state and trace metadata.

  ```ts
  composeRuntimeLoadoutPrompt({
    activeProfile: options.runtimeLoadout.activeProfile,
    skillPromptBlock: options.runtimeLoadout.skillPromptBlock,
  })
  ```

- `shipyard/src/ui/contracts.ts` and `shipyard/src/ui/workbench-state.ts`:
  expose `workbenchState.runtimeAssist` so the browser/runtime snapshot can show
  the active profile and loaded runtime skills deterministically.

- `shipyard/tests/runtime-skills.test.ts`, `shipyard/tests/turn-runtime.test.ts`,
  `shipyard/tests/pipeline-runtime.test.ts`, and
  `shipyard/tests/ui-runtime.test.ts`: verify manifest discovery, duplicate and
  invalid validator failures, tool registration/unload behavior, ordered prompt
  assembly, profile-aware turn prompts, pipeline runtime-assist propagation, and
  browser-visible runtime-assist snapshots.

## LangSmith / Monitoring

- Fresh live verification traces on project `shipyard`:
  - instruction-turn trace: `019d36c4-f3e7-7000-8000-006d41f4e3b4`
  - pipeline-turn trace: `019d36c5-180f-7000-8000-0677e7d9bd52`
- The instruction trace recorded `activeProfileId=implementer` and
  `loadedSkills=["runtime-safety"]` in both the root trace metadata and the
  returned runtime result.
- The pipeline trace recorded `activeProfileId=discovery` and
  `loadedSkills=["artifact-writing"]` in both the root trace metadata and the
  returned runtime result.
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  returned `[]`.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null`.
