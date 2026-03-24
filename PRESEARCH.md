# PRESEARCH

## Final Recommendation

Build Shipyard as a standalone TypeScript coding agent with a persistent local CLI, anchor-based surgical editing, a single writing coordinator, read-only explorer and verifier roles, and lightweight tracing that can graduate to LangSmith when credentials are present.

## Studied Inputs

- `docs/shipyard-prd.pdf`
- `docs/shipyard-presearch.pdf`
- local Ship repo patterns in `/Users/youss/Development/gauntlet/ship`

## Architecture Decisions

- Runtime: local Node.js process with a persistent REPL
- Project shape: standalone repo under `gauntlet`, not nested inside Ship
- Core loop: `src/engine/loop.ts` with session state and snapshots
- Tool model: typed registry where phases declare the tools they need
- Context model: target discovery plus a stable `ContextEnvelope` per turn
- Tracing: JSONL local log first, LangSmith when configured

## Editing Strategy

Anchor-based replacement is the Day 1 editing primitive because it is:

- safer than line-number replacement
- simpler than AST editing
- easier to verify than free-form regeneration
- compatible with TypeScript, JSON, Markdown, and config files

Guardrails:

- `oldString` must match exactly once
- stale hashes are rejected
- checkpoints are available before edits
- verification stays inside the loop rather than waiting until the end

## Multi-Agent Model

- `coordinator`: owns planning and all writes
- `explorer`: read-only search and context gathering
- `verifier`: read-only checks, tests, and lint runs

This keeps merge authority centralized while still leaving room for parallel read-only work.
