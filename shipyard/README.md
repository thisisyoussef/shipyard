# Shipyard

Shipyard is the runnable coding-agent application inside this workspace. It
combines a persistent session model, explicit graph runtime, typed tool layer,
target-manager flow, persisted plan/task queues, browser workbench, and
target-local runtime artifacts under `.shipyard/`.

Shipyard currently exposes two operator surfaces over one shared runtime:

- terminal REPL mode for direct local iteration
- `--ui` mode for the browser workbench

Within those surfaces, Shipyard routes work through three turn types:

- target-manager turns when Shipyard is started without `--target`
- planning turns for `plan:`, followed by `next` and `continue`
- standard code turns through the graph runtime with raw fallback parity

## Docs Map

- [`docs/README.md`](./docs/README.md): durable docs hub
- [`docs/demo/mvp-demo-script.md`](./docs/demo/mvp-demo-script.md): short demo
  walkthrough for target-manager, chat, and file/output evidence flow
- [`docs/architecture/README.md`](./docs/architecture/README.md): runtime,
  graph, and session-artifact diagrams
- [`docs/architecture/hosted-railway.md`](./docs/architecture/hosted-railway.md):
  hosted Railway contract and deploy flow
- [`src/README.md`](./src/README.md): source tree guide
- [`src/plans/README.md`](./src/plans/README.md): persisted planning/task-runner
  guide
- [`ui/README.md`](./ui/README.md): React frontend guide
- [`tests/README.md`](./tests/README.md): test suite map
- [`CODEAGENT.md`](./CODEAGENT.md): implementation contract and runtime notes
- [`PRESEARCH.md`](./PRESEARCH.md): concise architecture recommendation

## Current Capabilities

- persistent per-target sessions stored under `target/.shipyard/`
- target-manager mode that can list, select, create, and enrich targets before
  code execution starts
- persisted plan queues stored under `target/.shipyard/plans/` with `plan:`,
  `next`, and `continue`
- shared turn execution used by terminal and browser mode for both code and
  target-manager phases
- graph runtime with explicit `triage -> plan -> act -> verify -> recover -> respond`
  routing plus raw fallback parity
- coordinator heuristics that can escalate to explorer, planner, verifier, and
  browser-evaluator helpers when the request needs them
- browser file attachments stored under
  `target/.shipyard/uploads/<sessionId>/` and injected back as bounded receipts
- shared scaffold presets for new targets plus one-shot bootstrap of an
  already-selected empty target
- first-class `load_spec`, `bootstrap_target`, and `deploy_target` tool support
  in the code phase
- browser workbench file diff previews, command output history, saved-run
  resume, target switching, enrichment status, and deploy status in one shell
- active-turn interruption via `Ctrl+C` in the terminal REPL and `Cancel turn`
  in the browser workbench
- checkpoint-backed recovery for surgical edits
- local JSONL tracing with optional LangSmith trace export
- per-turn execution fingerprints surfaced in terminal output, browser
  completion state, and trace metadata so local vs hosted/runtime routing is
  visible without digging through code
- long-run `ExecutionHandoff` artifacts for reset-aware resume flows

## Quick Start

From the repo root:

```bash
pnpm --dir shipyard test-target:init
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
node shipyard/dist/bin/shipyard.js --targets-dir ./test-targets
```

To run directly against the checked-in sample target:

```bash
node shipyard/dist/bin/shipyard.js --target ./test-targets/tic-tac-toe
```

To start the browser workbench after a build:

```bash
pnpm --dir shipyard test-target:ui
```

From inside `shipyard/`:

```bash
pnpm test-target:init
pnpm install
pnpm build
node dist/bin/shipyard.js --targets-dir ../test-targets
```

Once you want a bare `shipyard` command outside the repo, link the package with
your preferred global package-manager workflow.

## Model Provider Defaults

Shipyard now defaults to OpenAI through the Responses API. Set
`OPENAI_API_KEY` before running live turns. The shipped OpenAI model default is
`gpt-5.4`.

If you want to route turns through Anthropic instead, set
`SHIPYARD_MODEL_PROVIDER=anthropic` and provide `ANTHROPIC_API_KEY`.

Optional OpenAI tuning env vars:

- `SHIPYARD_OPENAI_TIMEOUT_MS`
- `SHIPYARD_OPENAI_MAX_RETRIES`
- `SHIPYARD_OPENAI_MODEL`
- `SHIPYARD_OPENAI_MAX_TOKENS`

Optional Anthropic tuning env vars:

- `SHIPYARD_ANTHROPIC_TIMEOUT_MS`
- `SHIPYARD_ANTHROPIC_MAX_RETRIES`
- `SHIPYARD_ANTHROPIC_MODEL`
- `SHIPYARD_ANTHROPIC_MAX_TOKENS`

For one-shot external spec-pack runs, use:

```bash
pnpm --dir shipyard manual:spec-pack -- --spec-root /abs/path/to/spec-pack --instruction-file /abs/path/to/prompt.md
```

The runner mounts the pack at `.shipyard/spec` inside a disposable target so
the model can read it with target-relative tool paths without tripping the
bootstrap empty-target guard.

## Operator Controls

- In terminal mode, `help` shows built-in commands including `target`,
  `plan:`, `next`, and `continue`.
- In terminal mode, press `Ctrl+C` while a turn is running to cancel the active
  turn without closing Shipyard.
- In browser mode, use the composer's `Cancel turn` control to interrupt the
  active run. The composer keeps your draft so you can send the next
  instruction as soon as the session returns to ready.

## Repo Map

```text
shipyard/
  docs/          durable docs, architecture notes, and spec packs
  src/           CLI, runtime, tools, plans, preview, hosting, and UI backend
  tests/         Vitest suites and manual smoke scripts
  ui/            React + Vite browser workbench
../test-targets/
  tic-tac-toe/   checked-in greenfield test target scaffold for local Shipyard runs
```

## Request Lifecycle

1. `src/bin/shipyard.ts` resolves either a concrete target or a targets
   directory, restores or creates a session, and chooses terminal or browser
   mode.
2. `src/engine/loop.ts` and `src/ui/server.ts` route `plan:` to
   `src/plans/turn.ts`, route `next` / `continue` to
   `src/plans/task-runner.ts`, and send standard instructions to
   `src/engine/turn.ts`.
3. `src/context/discovery.ts`, `src/context/envelope.ts`, and
   `src/engine/runtime-context.ts` build the stable, task, runtime, and session
   context for the selected phase.
4. `src/engine/graph.ts` first classifies the request in `triage`, then decides
   whether to stay lightweight or go planner-backed in `plan`, executes the
   raw tool loop in `act`, verifies with command checks and optional browser
   evaluation in `verify`, and restores checkpoints in `recover`.
5. `src/tools/*` and `src/tools/target-manager/*` interact with the target
   repository, target catalog, spec files, bootstrap presets, and deploy
   provider.
6. `src/tracing/*` and `target/.shipyard/` capture sessions, plans, uploads,
   checkpoints, artifacts, browser-evaluator captures, and traces.

For day-to-day local verification, the recommended target is
`../test-targets/tic-tac-toe` rather than pointing Shipyard at its own source
tree.

## UI Runtime

The current browser workbench uses:

- Node's built-in `http` server plus `ws` for the local backend transport
- a single React SPA built with Vite into `shipyard/dist/ui`
- the same persisted Shipyard session and engine state used by terminal mode
- a typed event bridge that streams session state, tool activity, file events,
  turn summaries, preview state, target-manager state, deploy state, uploads,
  and trace metadata over one WebSocket connection
- browser-visible context receipts and reload-safe session rehydration for the
  active session
- a dedicated `/api/uploads` intake that stores supported text attachments under
  `.shipyard/uploads/<sessionId>/` and clears pending receipts after the next
  turn handoff
- a split-pane shell: transcript and composer on the left, file diff plus
  command output on the right, and a drawer for session details, run history,
  and injected context
- a target header that surfaces enrichment state, deploy readiness, publish
  errors, and the latest production URL when one exists
- an optional hosted access gate when `SHIPYARD_ACCESS_TOKEN` is configured

The backend half of this mode lives in `src/ui/`. The frontend shell lives in
`ui/`. Both are documented in the local README files for those directories.

Shipyard prints both the active workspace path and target path when `--ui`
starts. If the requested UI port is already occupied by another local Shipyard
runtime, it will move to the next open port and report which session already
held the original port.

## Hosted Railway Baseline

The current hosted Railway path keeps the existing browser runtime and
target-manager flow:

- run Shipyard in browser mode: `pnpm --dir shipyard start -- --ui`
- set `SHIPYARD_TARGETS_DIR=/app/workspace`
- set `SHIPYARD_UI_HOST=0.0.0.0`
- let Railway provide `PORT`; Shipyard falls back to it when
  `SHIPYARD_UI_PORT` is unset
- attach a persistent volume at `/app/workspace` and enable
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1` once the mount exists
- set `SHIPYARD_ACCESS_TOKEN` if the public workbench should require a shared
  unlock token
- keep the current hosted token in the ignored `shipyard/.env` file for local
  operator convenience; `node scripts/print-hosted-access-url.mjs` prints a
  bootstrap link from that file
- set `VERCEL_TOKEN` to enable `deploy_target` and automatic public publishing
  after successful edited turns
- use `/api/health` for the service health check
- point Railway config-as-code at [`railway.json`](./railway.json)

Hosted Shipyard keeps preview supervision for capability checks and browser
evaluation, but the operator surface emphasizes target selection, file/output
evidence, and the deployed app URL rather than a loopback preview tab.

See [`docs/architecture/hosted-railway.md`](./docs/architecture/hosted-railway.md)
for the hosted start contract, persistence behavior, and operator flow.
