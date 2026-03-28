# Technical Plan

## Metadata
- Story ID: P11-S03
- Story Title: Runtime Skill Registry, Agent Profiles, and Role Loading
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/phases/phase.ts`
  - `shipyard/src/engine/model-routing.ts`
  - new skill helpers under `shipyard/src/skills/`
  - new profile helpers under `shipyard/src/agents/profiles.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/plans/turn.ts`
  - `shipyard/src/ui/contracts.ts`
- Public interfaces/contracts:
  - `RuntimeSkillManifest`
  - `LoadedRuntimeSkill`
  - `AgentProfile`
  - `AgentRoleId`
  - `PhaseDefaultSkillSet`
- Data flow summary: session or phase startup discovers skills, phases request
  default loads, loaded prompt fragments and tools are folded into the active
  phase context, and role/profile metadata informs downstream agent routing and
  reporting.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: skills and profiles need to exist before discovery,
  PM, and TDD phases can depend on them.
- Gaps/overlap check: this story defines runtime loading and profile identity,
  not the behavior of discovery or TDD phases themselves.
- Whole-pack success signal: later stories can say "run PM with these default
  skills and this role profile" through one explicit contract.

## Architecture Decisions
- Decision: introduce a dedicated runtime skill registry separate from the
  general tool registry.
- Alternatives considered:
  - keep skills as helper-doc concepts only
  - overload tools to also represent prompt fragments and validators
- Rationale: tools and skills solve different problems. Treating them as one
  object would blur capability boundaries.

## Data Model / API Contracts
- Request shape:
  - list available skills
  - load or unload a named skill
  - resolve a phase's default skills and active profile
- Response shape:
  - manifest summaries
  - active loaded skills
  - profile metadata and route selection
- Storage/index changes:
  - local skills under `shipyard/skills/` or target-local `.shipyard/skills/`
  - optional persisted loaded-skill state in session or pipeline context

## Dependency Plan
- Existing dependencies used: typed tool registry, model-routing, phase config,
  session persistence.
- New dependencies proposed (if any): none initially.
- Risk and mitigation:
  - Risk: skills implicitly expand tool access.
  - Mitigation: keep phase tools authoritative and let skills request only
    declared additions that still pass phase/policy checks.

## Test Strategy
- Unit tests:
  - manifest validation
  - skill merge and unload behavior
  - profile resolution
- Integration tests:
  - phase startup with default skills
  - skill-loaded tool registration through the active runtime
- E2E or smoke tests:
  - status surfaces show active profile and loaded skills
- Edge-case coverage mapping:
  - duplicate skill names
  - invalid validators
  - missing references
  - unknown profile id

## Rollout and Risk Mitigation
- Rollback strategy: keep current phase prompts functioning even if runtime
  skill loading is disabled.
- Feature flags/toggles: enable skill loading per phase while the first set of
  runtime-native skills is proven.
- Observability checks: emit loaded skills, active profile, and route decisions
  into traces and browser state.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```

## Implementation Evidence

- `shipyard/src/skills/registry.ts`: the shipped runtime registry discovers
  built-in and target-local skills, validates manifests/tools/validators,
  registers skill-owned tools with owner IDs, and resolves phase loadouts into
  `{ profile, route, temperature, maxTokens, loadedSkills }`.
- `shipyard/src/tools/registry.ts`: tool registration now tracks owner IDs and
  supports `unregisterToolsByOwner`, which gives runtime skills a reversible
  tool-loading boundary instead of leaking capabilities between phases.
- `shipyard/src/agents/profiles.ts`: profile selection is centralized and
  provider-neutral, so phase logic only deals in role IDs and model routes
  rather than raw provider-specific settings.
- `shipyard/src/engine/turn.ts` and `shipyard/src/pipeline/turn.ts`: both turn
  executors now resolve runtime loadouts before execution, inject the formatted
  profile/skill block into prompts, and publish `runtimeAssist` into session and
  LangSmith metadata.
- `shipyard/src/ui/contracts.ts` and `shipyard/src/ui/workbench-state.ts`: the
  workbench contract now carries a compact `runtimeAssist` slice that survives
  reconnects and later UI work.
