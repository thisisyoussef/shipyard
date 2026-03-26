# Shipyard Workspace

This repository has two primary checked-in surfaces that work together but
serve different jobs:

- `.ai/` is the helper harness for workflows, memory, templates, and execution
  rules used while building inside this workspace.
- `shipyard/` is the runnable TypeScript coding-agent application: CLI entry,
  shared runtime, target-manager flow, planning/task-runner flow, browser
  workbench backend, React frontend, tests, and product docs.
- `test-targets/` holds checked-in sample targets for local verification
  without pointing Shipyard back at its own source tree.

## Documentation Map

- [`AGENTS.md`](./AGENTS.md): primary repository rulebook
- [`.ai/README.md`](./.ai/README.md): helper-harness navigation guide
- [`shipyard/README.md`](./shipyard/README.md): product overview, quick start,
  and operator flows
- [`shipyard/docs/README.md`](./shipyard/docs/README.md): durable product docs
  hub
- [`shipyard/docs/architecture/README.md`](./shipyard/docs/architecture/README.md):
  runtime, graph, session-artifact, and browser-workbench diagrams
- [`shipyard/src/README.md`](./shipyard/src/README.md): source tree guide
- [`shipyard/src/plans/README.md`](./shipyard/src/plans/README.md): persisted
  task-queue and task-runner flow
- [`shipyard/src/ui/README.md`](./shipyard/src/ui/README.md): browser-runtime
  backend guide
- [`shipyard/tests/README.md`](./shipyard/tests/README.md): automated and
  manual verification map

## Working From The Repo Root

```bash
pnpm --dir shipyard test-target:init
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
```

To run the built CLI against a specific target:

```bash
node shipyard/dist/bin/shipyard.js --target ./test-targets/tic-tac-toe
```

To start Shipyard in target-manager mode from the repo root:

```bash
node shipyard/dist/bin/shipyard.js --targets-dir ./test-targets
```

To launch the browser workbench after building:

```bash
pnpm --dir shipyard test-target:ui
```

## Layout

```text
.
├── .ai/
│   ├── docs/
│   ├── memory/
│   ├── skills/
│   ├── templates/
│   └── workflows/
├── test-targets/
│   └── tic-tac-toe/
└── shipyard/
    ├── docs/
    ├── src/
    ├── tests/
    └── ui/
```

## Working Model

- Product code and product-facing documentation live under `shipyard/`.
- Helper-harness changes belong under `.ai/` and should stay generic to this
  repository.
- Shipyard keeps one shared session model but supports three operator turn
  paths: target-manager turns, planning turns (`plan:`, `next`, `continue`),
  and code turns.
- Story packs under `shipyard/docs/specs/` explain phased delivery work.
  Durable onboarding and architecture notes live in the docs hub instead of
  being hidden inside individual spec folders.
