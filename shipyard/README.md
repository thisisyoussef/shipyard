# Shipyard

Shipyard is the runnable coding-agent application inside this workspace. It starts with a persistent CLI, stable target discovery, and a typed tool layer for file operations, search, command execution, checkpoints, and tracing.

The current runtime now has two operator modes:

- terminal REPL mode for direct local iteration
- `--ui` mode for a browser-first developer surface over the same engine/session model

## Docs Map

- [`docs/README.md`](./docs/README.md): durable docs hub
- [`docs/demo/mvp-demo-script.md`](./docs/demo/mvp-demo-script.md): 3-5 minute presenter script for the current target-manager, chat/live-run, and preview workflow
- [`docs/architecture/README.md`](./docs/architecture/README.md): architecture diagrams and runtime flow
- [`src/README.md`](./src/README.md): source tree guide
- [`ui/README.md`](./ui/README.md): React frontend guide
- [`tests/README.md`](./tests/README.md): test suite map
- [`CODEAGENT.md`](./CODEAGENT.md): implementation contract and runtime notes
- [`PRESEARCH.md`](./PRESEARCH.md): concise architecture recommendation

## Current Capabilities

- persistent per-target sessions stored under `target/.shipyard/`
- browser workbench saved-run history with one-click resume for the current target
- chat-first browser workbench with a Lovable-style transcript view for multi-turn iteration
- browser file attachments that store supported text files under
  `target/.shipyard/uploads/<sessionId>/` and feed receipt-backed references
  into the next turn
- stepwise live-run playback that shows tool progress, sequential edits, before/after previews, and trace links while the run is still in flight
- target discovery for existing or greenfield repositories
- shared scaffold presets for new targets plus one-shot bootstrap of already-selected empty targets
- a shared instruction executor used by both terminal and browser mode
- active-turn interruption via `Ctrl+C` in the terminal REPL and `Cancel turn`
  in the browser workbench
- typed read, write, edit, list, search, command, and git-diff tools
- checkpoint-backed recovery for surgical edits
- local JSONL tracing with optional LangSmith trace export

## Quick Start

From the repo root:

```bash
pnpm --dir shipyard test-target:init
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
node shipyard/dist/bin/shipyard.js --target ./test-targets/tic-tac-toe
```

To start the browser runtime after a build:

```bash
pnpm --dir shipyard test-target:ui
```

From inside `shipyard/`:

```bash
pnpm test-target:init
pnpm install
pnpm build
node dist/bin/shipyard.js --target ../test-targets/tic-tac-toe
```

Once you want a bare `shipyard` command outside the repo, link the package with your preferred global package-manager workflow.

## Operator Controls

- In terminal mode, press `Ctrl+C` while a turn is running to cancel the active
  turn without closing Shipyard.
- In browser mode, use the composer's `Cancel turn` control to interrupt the
  active run. The composer keeps your draft so you can send the next
  instruction as soon as the session returns to ready.

## Repo Map

```text
shipyard/
  docs/          durable docs, architecture notes, and spec packs
  src/           CLI, runtime, tools, tracing, and UI backend
  tests/         Vitest suites and manual smoke scripts
  ui/            React + Vite browser workbench
../test-targets/
  tic-tac-toe/   checked-in greenfield test target scaffold for local Shipyard runs
```

## Request Lifecycle

1. `src/bin/shipyard.ts` resolves the target path, session, and runtime mode.
2. `src/context/discovery.ts` inspects the target repository.
3. `src/context/envelope.ts` loads target `AGENTS.md` rules and builds prompt context.
4. `src/engine/turn.ts` runs the shared instruction path.
5. `src/engine/graph.ts` or `src/engine/raw-loop.ts` drives planning, tool use,
   verification, and final response generation.
6. `src/tools/*` interacts with the target repository.
7. `src/tracing/*` and `.shipyard/` capture runtime artifacts.

For day-to-day local verification, the recommended target is
`../test-targets/tic-tac-toe` rather than pointing Shipyard at its own source
tree.

## UI Runtime

The pre-2 developer UI uses:

- Node's built-in `http` server plus `ws` for the local backend transport
- a single React SPA built with Vite into `shipyard/dist/ui`
- the same persisted Shipyard session and engine state used by terminal mode
- a live event bridge that streams thinking, tool calls, tool results, immediate edit previews, trace metadata, errors, and session snapshots over one WebSocket session
- browser-visible context injection receipts and reload-safe session rehydration for the active `--ui` session
- a dedicated `/api/uploads` intake that keeps pending upload receipts in the
  session model and clears them after the next turn handoff
- a three-tab center workspace: `Chat` for the conversation transcript,
  `Local preview` for the live target result, and `Live view` for step-by-step
  playback of the current or saved run

The backend half of this mode lives in `src/ui/`. The frontend shell lives in
`ui/`. Both are documented in the local README files for those directories.

Shipyard now prints both the active workspace path and target path when `--ui`
starts. If the requested UI port is already occupied by another local Shipyard
runtime, it will move to the next open port and say which existing session was
already holding the original port.

## Hosted Railway Baseline

Phase 9 introduces a hosted Railway path for the existing browser runtime.

- Keep the runtime in browser mode: `pnpm start -- --ui`
- Set `SHIPYARD_TARGETS_DIR=/app/workspace`
- Set `SHIPYARD_UI_HOST=0.0.0.0`
- Let Railway provide `PORT`; Shipyard falls back to it when
  `SHIPYARD_UI_PORT` is unset
- Attach a persistent volume at `/app/workspace` and enable
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1` once the mount exists
- Set `SHIPYARD_ACCESS_TOKEN` if the public workbench should require a shared
  unlock token
- Set `VERCEL_TOKEN` to enable automatic public publishing after successful
  edited turns and the underlying `deploy_target` tool
- Use `/api/health` for the service health check
- If Railway is connected to the full repo, set the service root directory to
  `shipyard/` and point config-as-code at [`railway.json`](./railway.json)

Hosted Phase 9 also adds browser-side reference-file upload and a dedicated
publish surface that keeps the shareable target-app URL primary and removes the
localhost preview panel from the hosted workbench.

See [`docs/architecture/hosted-railway.md`](./docs/architecture/hosted-railway.md)
for the hosted start contract, persistence behavior, and operator flow.
