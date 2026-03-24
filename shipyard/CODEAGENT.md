# CODEAGENT

## Agent Architecture

Shipyard runs as a persistent local Node process with a terminal loop in `src/engine/loop.ts`. The loop holds session state across instructions, bootstraps discovery for the selected target, and rebuilds a stable `ContextEnvelope` as the session evolves.

The architecture is split into small layers:

- `src/bin/` owns the CLI entrypoint
- `src/engine/` owns the loop, state snapshots, and a generic graph abstraction
- `src/context/` builds target discovery and per-turn context envelopes
- `src/tools/` exposes file, search, command, and git primitives through a dynamic registry
- `src/agents/` defines coordinator, explorer, and verifier roles
- `src/phases/` defines phase contracts and the initial code-phase configuration
- `src/checkpoints/` prepares backup and restore support before edits
- `src/tracing/` supports LangSmith configuration plus a local JSONL fallback log

When `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, and `LANGCHAIN_PROJECT` are set, Shipyard traces both runtime paths automatically. Graph mode runs under LangGraph/LangChain callbacks, fallback mode wraps the raw Claude loop with LangSmith `traceable`, and the Anthropic client is wrapped so model calls appear as nested spans.

The coordinator is the only writer. Explorer and verifier are modeled as read-only role definitions so the orchestration boundary is explicit before the multi-agent runtime is added.

## UI Runtime Contract

Shipyard's browser mode is an alternate runtime surface over the same session and engine state, not a second product.

- `src/bin/shipyard.ts` selects terminal mode or `--ui`
- `src/engine/turn.ts` owns the shared per-instruction execution path used by both terminal and browser mode
- `src/ui/contracts.ts` owns the typed WebSocket request/response protocol
- `src/ui/events.ts` maps shared turn events into browser-safe messages
- `src/ui/server.ts` owns the local HTTP and WebSocket runtime
- `ui/` contains the React SPA source
- `vite.config.ts` builds that SPA into `dist/ui`

For MVP, the local backend stack is Node `http` + `ws`, and the frontend build path is React + Vite. The UI must stay local-only and should never require a second agent runtime or duplicate session state.

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

## MVP Trace Links

- Successful graph-mode file creation trace: [LangSmith trace](https://smith.langchain.com/o/4610debb-3062-47a4-a18d-faee6ddaa4c3/projects/p/debcf987-99bc-4986-b3e1-5af61ee1ff78/r/019d21b3-0b13-7000-8000-04db046b4bd7?trace_id=019d21b3-0b13-7000-8000-04db046b4bd7&start_time=2026-03-24T21:14:35.155001)
- Fallback-mode missing-file error trace: [LangSmith trace](https://smith.langchain.com/o/4610debb-3062-47a4-a18d-faee6ddaa4c3/projects/p/debcf987-99bc-4986-b3e1-5af61ee1ff78/r/019d21b3-2e81-7000-8000-07611bad5091?trace_id=019d21b3-2e81-7000-8000-07611bad5091&start_time=2026-03-24T21:14:44.225001)
