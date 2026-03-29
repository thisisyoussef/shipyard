# Technical Plan

## Metadata
- Story ID: P11-S06
- Story Title: GitHub Source of Truth, Branch Hygiene, and PR Merge Operations
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - new source-control helpers under `shipyard/src/source-control/`
  - optional GitHub-specific adapters under `shipyard/src/github/`
  - `shipyard/src/tools/`
  - `shipyard/src/tools/registry.ts`
  - `shipyard/src/phases/phase.ts`
  - `shipyard/src/plans/store.ts`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/ui/contracts.ts`
- Public interfaces/contracts:
  - `SourceControlCapability`
  - `RepositoryBinding`
  - `StoryBranch`
  - `PullRequestArtifact`
  - `MergeDecision`
  - `ConflictResolutionTicket`
- Data flow summary: Shipyard resolves the active auth capability, creates or
  attaches a canonical GitHub repo binding when available, provisions a
  story-scoped branch, runs implementation work against that branch, hands PR
  and merge actions to a dedicated GitHub-ops role, and records any stale or
  conflicting work as explicit recovery state. If binding is unavailable, the
  same story contract runs in a managed local mode until rebind succeeds.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - GitHub-first and Railway-hosted runtime execution
  - coordination and multi-story execution
- Story ordering rationale: source-control contracts should exist before hosted
  execution, board projection, or multi-story coordination start reasoning
  about branch and PR state.
- Gaps/overlap check: this story handles source-control and merge lifecycle,
  not hosted workspace boot or task-graph projection.
- Whole-pack success signal: later hosted and coordinator stories can rely on
  one canonical repo contract instead of inferring source state from the local
  filesystem alone.

## Architecture Decisions
- Decision: introduce a normalized source-control capability layer rather than
  hard-coding local `gh` CLI checks into runtime policy.
- Alternatives considered:
  - require local `gh auth` for every mode
  - store a raw long-lived GitHub token directly in every runtime path
- Rationale: deployed runtimes need hosted-safe auth modes, while local flows
  still benefit from `gh` when it exists.
- Decision: keep an explicit degraded-local mode instead of blocking all work
  when GitHub binding is absent.
- Alternatives considered:
  - fail all project creation and execution until GitHub auth succeeds
  - silently keep working locally with no durable degraded status
- Rationale: hard failure hurts usability, while silent fallback makes source of
  truth ambiguous and creates hidden merge debt.

## Data Model / API Contracts
- Request shape:
  - resolve auth capability and supported adapter
  - create or attach canonical repo binding
  - provision or sync story branch
  - create, update, review, merge, or close PR
  - rebind a degraded local project to GitHub later
- Response shape:
  - normalized auth and binding status
  - branch sync result and divergence state
  - PR metadata and review status
  - merge outcome or conflict-resolution ticket
- Storage/index changes:
  - repo binding and auth mode under `.shipyard/source-control/`
  - branch and PR artifacts linked to story or task IDs
  - degraded-source transition history for later recovery

## Dependency Plan
- Existing dependencies used: artifact registry, pipeline runner, phase
  profiles, PM backlog artifacts, and current runtime event metadata.
- New dependencies proposed (if any): GitHub API or CLI adapters behind the
  normalized capability interface.
- Risk and mitigation:
  - Risk: local and hosted auth paths drift and create inconsistent behavior.
  - Mitigation: normalize both into one capability contract with shared tests.
  - Risk: degraded mode becomes a silent permanent state.
  - Mitigation: persist degraded reason, block merge-specific actions
    explicitly, and surface rebind guidance in runtime status.

## Test Strategy
- Unit tests:
  - auth-capability resolution and precedence
  - branch naming and sync policy
  - degraded-local fallback transitions
  - first-merge-wins stale-branch detection
- Integration tests:
  - project create -> repo bind -> story branch -> PR -> merge
  - hosted-safe auth adapter produces the same normalized capability as local
  - degraded local project rebinds to GitHub later without losing story state
- E2E or smoke tests:
  - one end-to-end story run emits branch and PR metadata into runtime status
- Edge-case coverage mapping:
  - auth expires mid-run
  - default branch renamed externally
  - PR merged outside Shipyard
  - branch deleted before merge

## Rollout and Risk Mitigation
- Rollback strategy: keep current local workspace git usage available while the
  normalized source-control contract lands additively.
- Feature flags/toggles: require GitHub binding for explicit factory mode while
  still allowing degraded local management during rollout.
- Observability checks: log auth-adapter choice, repo binding changes, branch
  sync results, PR lifecycle events, degraded-mode entries, and merge recovery
  creation.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```

## Implemented Shape

- `shipyard/src/source-control/contracts.ts`: defines the normalized
  source-control contract, including auth capability modes, repository
  binding, degraded fallback state, story branches, PR artifacts,
  first-merge-wins decisions, conflict tickets, and compact workbench
  projection helpers.
- `shipyard/src/source-control/store.ts`: persists restart-safe runtime state to
  `.shipyard/source-control/runtime.json` with atomic writes.
- `shipyard/src/source-control/runtime.ts`: resolves auth precedence across
  GitHub App, GitHub token, OAuth token, and local `gh` CLI; synthesizes repo
  binding and degraded state; provisions story branches; opens PR records;
  applies first-merge-wins semantics; and raises conflict tickets for stale
  merges under the dedicated `pr-ops` owner.
- `shipyard/src/tools/source-control.ts`,
  `shipyard/src/tools/index.ts`, and
  `shipyard/src/phases/code/index.ts`: expose the
  `manage_source_control` tool to runtime turns so source-control actions run
  through one typed interface.
- `shipyard/src/agents/profiles.ts`: introduces the `pr-ops` profile so PR
  creation, merge, cleanup, and conflict recovery are explicitly routed to one
  role instead of being blurred into the implementer lane.
- `shipyard/src/engine/state.ts`,
  `shipyard/src/tools/target-manager/create-target.ts`,
  `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`, and
  `shipyard/src/ui/server.ts`: create the target-local source-control
  directory, seed state for new targets, sync session-level source-control
  metadata, and publish compact auth/binding/branch/PR/degraded summaries into
  the workbench snapshot for downstream hosted and coordinator stories.
- `shipyard/tests/source-control-runtime.test.ts`: covers hosted-safe auth
  precedence, explicit degraded-local fallback, durable repo binding,
  first-merge-wins stale marking, `pr-ops` ownership, and conflict-ticket
  creation.
- `shipyard/tests/loop-runtime.test.ts`: includes the narrow duplicate-property
  cleanup that restored the repo's green baseline while landing the story.

## Validation Notes

- Focused runtime validation passed:
  - `pnpm --dir shipyard exec vitest run tests/source-control-runtime.test.ts --reporter=verbose`
  - `pnpm --dir shipyard exec vitest run tests/source-control-runtime.test.ts tests/loop-runtime.test.ts --reporter=verbose`
  - `pnpm --dir shipyard exec vitest run tests/ui-view-models.test.ts tests/source-control-runtime.test.ts --reporter=verbose`
- Required repo-level validation passed:
  - `pnpm --dir shipyard typecheck`
  - `pnpm --dir shipyard build`
  - `git diff --check`
- The plain `pnpm --dir shipyard test` command was attempted first but hit the
  repo's known idle Vitest worker hang after launching `vitest run`. The
  authoritative full-suite proof for this story is the deterministic CI-style
  command:
  - `CI=1 pnpm --dir shipyard exec vitest run --pool forks --no-file-parallelism --maxWorkers 1 --reporter=verbose`
  - Result: `Test Files 64 passed (64)`, `Tests 442 passed | 2 skipped (444)`
- LangSmith finish-check evidence was captured in the isolated project
  `shipyard-p11-s06-finishcheck`, including both a successful merge trace and
  an expected blocked stale-merge trace with no unexpected error runs.
