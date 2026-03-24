# CODEAGENT

## Agent Architecture

Shipyard runs as a persistent local Node process with a terminal loop in `src/engine/loop.ts`. The loop holds session state across instructions, bootstraps discovery for the selected target, and rebuilds a stable `ContextEnvelope` as the session evolves.

The architecture is split into small layers:

- `src/engine/` owns the loop, state snapshots, and a generic graph abstraction
- `src/context/` builds target discovery and per-turn context envelopes
- `src/tools/` exposes file, search, command, and git primitives through a dynamic registry
- `src/agents/` defines coordinator, explorer, and verifier roles
- `src/phases/` defines phase contracts and the initial code-phase configuration
- `src/checkpoints/` prepares backup and restore support before edits
- `src/tracing/` supports LangSmith configuration plus a local JSONL fallback log

The coordinator is the only writer. Explorer and verifier are modeled as read-only role definitions so the orchestration boundary is explicit before the multi-agent runtime is added.

## File Editing Strategy

Shipyard uses anchor-based surgical editing.

1. `read-file` reads the target file and returns both contents and a SHA-256 hash.
2. `edit-block` re-reads the file, compares the hash to the caller's `expectedHash`, and rejects stale edits.
3. The edit only proceeds when `oldString` matches exactly once.
4. The tool replaces only that anchored block and re-reads the file to return the new contents and hash.

This keeps Day 1 simple while still covering the critical guardrails from the PRD:

- no full-file rewrites for targeted edits
- no ambiguous multi-match replacements
- no stale writes after the file changes
- typed results the coordinator can inspect and trace
