# Shipyard Workspace — Claude Code Entry Point

This is the primary instruction file for Claude Code sessions in this workspace.

## Read Order (Mandatory for Non-Trivial Work)

Before making non-trivial changes, load context in this order:

1. **This file** (`.claude/CLAUDE.md`) — entry point and orchestrator
2. **`AGENTS.md`** — primary checked-in rulebook; overrides all other files on conflict
3. **`.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`** — current phase, focus, and guardrails
4. **`shipyard/README.md`** — app overview, docs map, request lifecycle
5. **`shipyard/CODEAGENT.md`** — agent architecture, editing strategy, UI contract
6. **`shipyard/PRESEARCH.md`** — architecture recommendation (when intent needs context)

For deeper context, also read:
- `.ai/memory/project/patterns.md` — durable repo patterns
- `.ai/memory/project/anti-patterns.md` — known failures to avoid
- `.ai/memory/session/active-context.md` — current task and goals

## Workspace Layout

```
.ai/           Helper harness (NOT product code) — workflows, templates, memory
shipyard/      Runnable TypeScript CLI application (product code lives here)
test-targets/  Greenfield test scaffolds for local Shipyard runs
AGENTS.md      Primary rulebook (highest priority)
```

**Rule**: `.ai/` is scaffolding for this workspace only. Product code, tests, and app docs live under `shipyard/`.

## Validation Commands

Run from repo root:

```bash
pnpm --dir shipyard test       # Vitest suites
pnpm --dir shipyard typecheck  # Strict TypeScript
pnpm --dir shipyard build      # Full production build
git diff --check               # Whitespace/conflict markers
```

From inside `shipyard/`:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Story Rules

- Start non-trivial work on a fresh `codex/` branch (Claude Code worktrees also work).
- If the current worktree already contains unrelated in-progress changes or another active story, start the new story in a fresh worktree/branch instead of layering onto the shared dirty tree.
- Do a **preparation pass** before edits: read relevant code, contracts, and docs first.
- Use **TDD** for behavior changes when practical.
- Keep narrow corrections narrow — do not silently expand scope.
- When a change has non-obvious tradeoffs, **pause and confirm** before taking the expensive path.

## Workflow Routing

Route tasks through the `.ai/workflows/` system:

| Task Type | Workflow |
|-----------|----------|
| Feature | `.ai/workflows/feature-development.md` → `spec-driven-delivery.md` |
| Bug fix | `.ai/workflows/bug-fixes.md` |
| Performance | `.ai/workflows/performance-optimization.md` |
| Security | `.ai/workflows/security-review.md` |
| Deployment | `.ai/workflows/deployment-setup.md` |
| TDD coordination | `.ai/workflows/tdd-pipeline.md` |
| AI/harness changes | `.ai/workflows/ai-architecture-change.md` |
| UI stories | Also use `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md` + `.ai/workflows/ui-qa-critic.md` |

### Story Lifecycle Gates

For non-trivial stories, follow these gates in order:

1. **Story Lookup** (`.ai/workflows/story-lookup.md`) — gather local + external context
2. **Story Sizing** (`.ai/workflows/story-sizing.md`) — classify `trivial` vs `standard`
3. **Spec-Driven Delivery** (`.ai/workflows/spec-driven-delivery.md`) — constitution, spec, plan, tasks (standard only)
4. **TDD Pipeline** (`.ai/workflows/tdd-pipeline.md`) — RED/GREEN/REFACTOR with handoff artifacts
5. **Story Handoff** (`.ai/workflows/story-handoff.md`) — combined completion gate with user audit
6. **Git Finalization** (`.ai/workflows/git-finalization.md`) — commit, push, PR, merge to `main`

For **trivial** stories (single file, no API/schema/contract changes): skip steps 3-4, go directly to focused TDD then handoff.

## Finalization Default

- A story is **not complete until merged to `main`** unless user explicitly pauses.
- Before merging: update impacted docs/diagrams or explicitly record `N/A`.
- When a story or spec pack is complete: update the relevant `shipyard/docs/specs/**` files with code references and short representative snippets, or explicit `N/A`.
- For traced AI/runtime behavior changes: run `.ai/workflows/langsmith-finish-check.md` before merge.
- Unrelated dirty state is not a valid reason to stop at local validation. Preserve it, isolate the current story in a clean branch/worktree, rerun validation there, and continue through commit → push → PR → merge → cleanup.
- Escalate only when ownership or overlap cannot be disentangled safely without risking someone else's work.
- Default to full GitHub flow: commit → push → PR → merge → cleanup.

## Memory System

| Location | Purpose |
|----------|---------|
| `.ai/memory/project/` | Durable repo truths (architecture, patterns, anti-patterns, edge-cases, tech-debt) |
| `.ai/memory/session/` | Current task notes (active-context, decisions-today, blockers) |
| `.ai/memory/codex/` | Agent-facing memory |

After completing work, update the memory update set:
- `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
- `.ai/memory/project/architecture.md`
- `.ai/memory/project/patterns.md`
- `.ai/memory/project/anti-patterns.md`
- `.ai/memory/session/decisions-today.md`

## Templates & Skills

- **Spec templates**: `.ai/templates/spec/` (constitution, feature spec, technical plan, task breakdown, UI specs)
- **Skills reference**: `.ai/skills/` (code standards, TDD, frontend design, security, performance, refactoring)
- **Software factory**: `.ai/skills/software-factory/` (generators for API, config, frontend, migration, tests)

## Shipyard App Architecture

- **CLI entry**: `shipyard/src/bin/shipyard.ts`
- **Engine loop**: `shipyard/src/engine/` (turn.ts, graph.ts, raw-loop.ts)
- **Context**: `shipyard/src/context/` (discovery.ts, envelope.ts)
- **Tools**: `shipyard/src/tools/` (typed registry with read, write, edit, list, search, command, git-diff)
- **Agents**: `shipyard/src/agents/` (coordinator writes, explorer/verifier read-only)
- **Phases**: `shipyard/src/phases/` (phase contracts)
- **Tracing**: `shipyard/src/tracing/` (JSONL local + LangSmith export)
- **UI backend**: `shipyard/src/ui/` (HTTP + WebSocket)
- **UI frontend**: `shipyard/ui/` (React + Vite SPA)
- **Tests**: `shipyard/tests/` (Vitest)

### Editing Strategy

Shipyard uses anchor-based surgical editing:
- `read-file` returns contents + SHA-256 hash
- `edit-block` re-reads, compares hash, rejects stale edits
- `oldString` must match exactly once
- No full-file rewrites, no ambiguous multi-match, no stale writes

### Multi-Agent Model

- `coordinator`: owns planning and all writes
- `explorer`: read-only search and context gathering
- `verifier`: read-only checks, tests, lint runs
