# Technical Plan

## Metadata
- Story ID: P10-S04
- Story Title: Repository Index and Generated Architecture Wiki
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/context/discovery.ts`
  - `shipyard/src/agents/explorer.ts`
  - `shipyard/src/agents/planner.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
  - new indexing helpers under `shipyard/src/indexing/`
- Public interfaces/contracts:
  - `RepositoryIndex`
  - `RepositoryIndexEntry`
  - `ArchitectureWiki`
  - `IndexFreshnessReport`
- Data flow summary: index builders walk the target, persist structural
  metadata under `.shipyard/index/`, generate a bounded architecture summary,
  and retrieval helpers let planner or explorer reference those artifacts by
  stable named sources.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: indexing follows memory layering so the index can
  become a new memory layer rather than another parallel context path.
- Gaps/overlap check: this story provides durable knowledge only. P10-S05
  decides when helpers should use it, and P10-S08 later turns indexing into a
  first-class job surface.
- Whole-pack success signal: broad planning can start from current architecture
  artifacts rather than re-running broad search loops on every turn.

## Architecture Decisions
- Decision: store the index target-locally and expose it through named retrieval
  helpers instead of pushing repo knowledge into one global memory store.
- Alternatives considered:
  - rely only on live `rg`-style search
  - build a remote shared index service first
- Rationale: live search alone wastes turns on broad tasks, while a remote
  service would add too much operational surface for the current stage.

## Data Model / API Contracts
- Request shape:
  - target path plus optional incremental refresh scope
- Response shape:
  - structural index entries, wiki summary, and freshness metadata
- Storage/index changes:
  - `.shipyard/index/index.json`
  - `.shipyard/index/wiki.md`
  - optional per-refresh metadata for incremental rebuild

## Dependency Plan
- Existing dependencies used: target discovery, planner and explorer helpers,
  layered memory receipts, UI event stream.
- New dependencies proposed (if any): none required for a first pass.
- Risk and mitigation:
  - Risk: index drift makes planner decisions worse rather than better.
  - Mitigation: attach freshness metadata, allow explicit refresh, and fall back
    to live discovery when confidence is low.

## Test Strategy
- Unit tests:
  - index entry generation
  - incremental refresh and stale detection
  - wiki-summary loading
- Integration tests:
  - planner or explorer retrieval against a fresh index
  - fallback to live search when the index is missing or stale
- E2E or smoke tests:
  - operator refreshes index and sees status in the workbench
- Edge-case coverage mapping:
  - empty target
  - oversized directories skipped with reasons
  - corrupted index file
  - wiki generation failure with structural index fallback

## Rollout and Risk Mitigation
- Rollback strategy: keep index use opt-in or soft-preferred until freshness and
  retrieval quality prove stable.
- Feature flags/toggles: allow architecture wiki generation to ship after raw
  structural indexing if needed.
- Observability checks: record build duration, file counts, skipped paths,
  freshness, and helper usage.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
