# Technical Plan

## Metadata
- Story ID: PTM-S01
- Story Title: Target Manager Tools & Data Model
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/artifacts/types.ts` — new `TargetProfile` interface
  - `shipyard/src/tools/target-manager/list-targets.ts` — directory scanning tool
  - `shipyard/src/tools/target-manager/select-target.ts` — target validation and profile loading
  - `shipyard/src/tools/target-manager/create-target.ts` — scaffolding and git init
  - `shipyard/src/tools/target-manager/enrich-target.ts` — AI enrichment pipeline
  - `shipyard/src/tools/target-manager/index.ts` — barrel export and tool registration
  - `shipyard/src/tools/target-manager/scaffolds/` — minimal starter templates per scaffold type
  - `shipyard/src/tools/target-manager/profile-io.ts` — read/write `profile.json`
  - `shipyard/src/engine/state.ts` — `SessionState` gains optional `targetProfile: TargetProfile`
  - `shipyard/src/phases/target-manager/index.ts` — phase definition with tool list
  - `shipyard/src/phases/target-manager/prompts.ts` — system prompt for the target manager LLM turn

- Public interfaces/contracts:
  - `TargetProfile` type (exported from artifacts/types)
  - Four tool input/output schemas (JSON Schema via tool registry)
  - `loadTargetProfile(targetPath)` / `saveTargetProfile(targetPath, profile)` utilities
  - `targetManagerPhase` phase definition

- Data flow summary:
  1. `list_targets` scans a directory → returns `TargetListEntry[]`
  2. `select_target` resolves path → loads profile → returns `{ path, discovery, profile? }`
  3. `create_target` creates dir + scaffold + git init → returns `{ path, discovery }`
  4. `enrich_target` reads discovery + key files → calls Claude → returns `TargetProfile`

## Architecture Decisions

- Decision: Scaffold templates are static file content in source, not external generators.
  - Rationale: No network dependency, no version drift, fast and deterministic. The coding agent can evolve the scaffold after creation.

- Decision: Enrichment uses a single focused Claude call with structured output, not a multi-turn conversation.
  - Rationale: Enrichment is a one-shot extraction task. Multi-turn adds latency and complexity for no benefit.

- Decision: `enrich_target` reads at most ~20 files capped at 500 lines each.
  - Rationale: Keeps the enrichment context bounded and fast. Key files (README, package.json, main entry points, config) are prioritized.

- Decision: Profile is a flat JSON file, not embedded in session state.
  - Rationale: Profiles outlive sessions. A target's identity doesn't change when you start a new session against it.

## Dependency Plan

- Existing dependencies used: tool registry (`src/tools/registry.ts`), discovery module (`src/context/discovery.ts`), session state (`src/engine/state.ts`), Anthropic client (for enrichment call).
- New dependencies proposed: none.

## Implementation Notes

- Scaffold types: `react-ts`, `express-ts`, `python`, `go`, `empty`. Each is a small set of template files (3-6 files max).
- `react-ts` scaffold: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`.
- `express-ts` scaffold: `package.json`, `tsconfig.json`, `src/index.ts`.
- `python` scaffold: `pyproject.toml`, `src/__init__.py`, `src/main.py`.
- `go` scaffold: `go.mod`, `main.go`.
- `empty` scaffold: just `README.md` and `AGENTS.md`.
- The enrichment prompt should ask for JSON output matching `TargetProfile` with explicit field descriptions. Use Anthropic's structured output or a JSON extraction prompt pattern.
- File selection heuristic for enrichment: README, AGENTS.md, package.json/pyproject.toml/go.mod, tsconfig.json, top-level config files, then the first few source files alphabetically.

## Test Strategy

- Unit: tool input validation, scaffold file generation, profile serialization round-trip, discovery integration.
- Unit: `list_targets` with mock directory structures (empty, mixed repos, non-repos).
- Unit: `enrich_target` with mocked Claude response to verify parsing and profile shape.
- Integration: create a temp directory, run `create_target`, then `enrich_target`, verify `profile.json` exists and is valid.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
