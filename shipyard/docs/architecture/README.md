# Shipyard Architecture

Shipyard is a local-first coding-agent runtime with two operator surfaces that
share one execution core:

- terminal REPL mode
- browser workbench mode via `--ui`

Both surfaces converge on the same session model, context envelope, tool
registry, and graph-or-fallback instruction executor.

## System Map

```mermaid
flowchart LR
  User["Operator"]
  CLI["CLI entry<br/>src/bin/shipyard.ts"]
  Loop["Terminal loop<br/>src/engine/loop.ts"]
  UiServer["UI server<br/>src/ui/server.ts"]
  Spa["React SPA<br/>ui/src/*"]
  Turn["Shared turn executor<br/>src/engine/turn.ts"]
  Context["Context layer<br/>src/context/*"]
  Graph["Graph runtime / fallback<br/>src/engine/graph.ts<br/>src/engine/raw-loop.ts"]
  Phase["Code phase<br/>src/phases/code/*"]
  Tools["Typed tools<br/>src/tools/*"]
  Target["Target repository"]
  Session["Session state<br/>target/.shipyard/sessions"]
  Checkpoints["Checkpoints<br/>target/.shipyard/checkpoints"]
  Traces["Tracing<br/>target/.shipyard/traces<br/>LangSmith optional"]

  User --> CLI
  CLI --> Loop
  CLI --> UiServer
  UiServer <--> Spa
  Loop --> Turn
  UiServer --> Turn
  Turn --> Context
  Turn --> Graph
  Graph --> Phase
  Phase --> Tools
  Tools --> Target
  Turn --> Session
  Graph --> Checkpoints
  Turn --> Traces
```

## Instruction Flow

```mermaid
sequenceDiagram
  participant Operator
  participant Entry as CLI or UI
  participant Turn as executeInstructionTurn
  participant Context as context/discovery + envelope
  participant Runtime as graph/raw runtime
  participant Tools as tool registry
  participant Target as target repo

  Operator->>Entry: submit instruction
  Entry->>Turn: instruction + session state + runtime mode
  Turn->>Context: refresh discovery / build envelope
  Context-->>Turn: stable + task + runtime + session context
  Turn->>Runtime: run code phase
  Runtime->>Tools: invoke read/write/search/run/git tools
  Tools->>Target: act on target repository
  Target-->>Tools: file or command results
  Tools-->>Runtime: structured tool results
  Runtime-->>Turn: final text + task plan + verification state
  Turn-->>Entry: streaming updates + final summary
```

## Runtime Artifact Layout

```mermaid
flowchart TD
  Target["Target directory"]
  Shipyard[".shipyard/"]
  Sessions["sessions/<sessionId>.json"]
  Checkpoints["checkpoints/<sessionId>/...checkpoint"]
  Traces["traces/<sessionId>.jsonl"]

  Target --> Shipyard
  Shipyard --> Sessions
  Shipyard --> Checkpoints
  Shipyard --> Traces
```

## Layer Responsibilities

- `src/bin/` parses process arguments, initializes discovery/session state, and
  chooses terminal or browser mode.
- `src/context/` inspects the target repository and serializes a reusable
  prompt context envelope, including target `AGENTS.md` rules when present.
- `src/engine/` owns the persistent loop, shared turn execution path, graph
  runtime, fallback raw loop, and session persistence.
- `src/agents/` holds the coordinator-only write boundary plus isolated
  helper runtimes such as the read-only explorer and verifier roles.
- `src/tools/` exposes the bounded file/search/command primitives available to
  the code phase.
- `src/checkpoints/` snapshots files before `edit_block` writes so recovery can
  revert failed attempts.
- `src/tracing/` writes local JSONL traces and attaches LangSmith when the
  required environment variables are configured.
- `src/ui/` is the backend half of browser mode. The React frontend lives under
  `ui/` and speaks to this layer over a typed WebSocket contract.

## Design Rules

- Keep instruction logic in `src/engine/turn.ts` so terminal mode and UI mode
  stay behaviorally aligned.
- Add new filesystem or process capabilities as typed tools under `src/tools/`,
  then expose them through the phase configuration rather than reaching around
  the tool registry.
- Treat `target/.shipyard/` as runtime output, not as hand-authored source.
- When documenting new features, prefer adding durable notes here and linking
  to any relevant story pack under `docs/specs/`.
