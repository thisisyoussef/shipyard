# Technical Plan

## Metadata
- Story ID: P11-S01
- Story Title: Versioned Artifact Registry and Query Surface
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/src/artifacts/handoff.ts`
  - `shipyard/src/plans/store.ts`
  - new registry helpers under `shipyard/src/artifacts/registry/`
  - `shipyard/src/engine/state.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/plans/turn.ts`
- Public interfaces/contracts:
  - `ArtifactRecord`
  - `ArtifactMetadata`
  - `ArtifactStatus`
  - `ArtifactContentKind`
  - `ArtifactQuery`
  - `ArtifactQueryResult`
- Data flow summary: phases and runtime helpers save artifacts through one
  registry boundary; metadata is indexed target-locally; query helpers return
  compact summaries or full content on demand; legacy plan and handoff files are
  projected or migrated into the shared registry.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - coordination and multi-story execution
- Story ordering rationale: later stories all need a single artifact vocabulary
  before they can exchange output safely.
- Gaps/overlap check: this story standardizes artifact persistence only. It does
  not define approval state machines or phase progression.
- Whole-pack success signal: every later phase can ask for "the latest approved
  spec/story/report" through one query surface instead of stitching together
  special-case files.

## Architecture Decisions
- Decision: use one typed registry for metadata plus content pointers, with
  content files remaining target-local and human-readable.
- Alternatives considered:
  - keep handoffs and plans as separate special systems
  - introduce a database-backed artifact service immediately
- Rationale: the first option blocks later factory workflow reuse, and the
  second is heavier than needed for the current local-first runtime.

## Data Model / API Contracts
- Request shape:
  - save artifact with typed metadata, optional version intent, and content
  - query by type, status, tag, parent, or dependency
- Response shape:
  - compact artifact summaries by default
  - full content on explicit load
- Storage/index changes:
  - extend `.shipyard/artifacts/` with versioned content plus sibling metadata
  - add a small registry index file or directory for faster lookup
  - keep legacy `.shipyard/plans/*.json` and `.shipyard/artifacts/**/*.handoff.json`
    as source files for now, then lazily project them into the registry on
    query/load instead of forcing an eager migration rewrite in this story

## Dependency Plan
- Existing dependencies used: current plan-store patterns, handoff persistence,
  session save helpers, local trace logging.
- New dependencies proposed (if any): none initially; use filesystem plus typed
  metadata first.
- Risk and mitigation:
  - Risk: legacy artifact migration causes duplicate or ambiguous records.
  - Mitigation: make migration explicit, idempotent, and logged.

## Test Strategy
- Unit tests:
  - metadata validation
  - version increment behavior
  - query filtering and sorting
- Integration tests:
  - save artifact then load latest approved version
  - project existing handoff or plan artifacts into the registry
- E2E or smoke tests:
  - planning or turn execution emits artifacts and later queries can retrieve
    them in a fresh session
- Edge-case coverage mapping:
  - duplicate IDs
  - corrupted metadata
  - missing content file
  - tag and dependency filtering

## Rollout and Risk Mitigation
- Rollback strategy: keep legacy artifact readers working while new writes land
  through the registry.
- Feature flags/toggles: allow registry-backed writes before forcing all reads
  through the new query surface.
- Observability checks: log save, version, migration, and query-failure events.

## Implementation Evidence

- `shipyard/src/artifacts/registry/index.ts`: the shipped design uses one
  target-local `index.json` plus per-version metadata/content siblings under
  `.shipyard/artifacts/registry/<type>/<id>/`, written atomically with temp-file
  renames.
- `shipyard/src/artifacts/registry/index.ts`: legacy plans and handoffs are
  projected lazily through `syncLegacyArtifacts()` so current writers and
  readers keep working while later Phase 11 stories can consume one registry
  query surface.
- `shipyard/src/engine/state.ts`: directory bootstrapping now includes the new
  registry root, which keeps runtime initialization centralized.
- `shipyard/tests/artifact-registry.test.ts`: the executed coverage maps
  directly to the plan's unit/integration goals, including malformed metadata
  isolation and legacy projection behavior.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
