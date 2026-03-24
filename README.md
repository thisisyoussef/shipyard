# Shipyard Workspace

This repository is split into two checked-in surfaces that work together but
have different responsibilities:

- `.ai/` is the helper harness for workflows, memory, templates, and execution
  rules used while working in this workspace.
- `shipyard/` is the runnable TypeScript coding-agent application: CLI entry,
  shared runtime, browser mode backend, React UI shell, tests, and product docs.

## Documentation Map

- [`AGENTS.md`](./AGENTS.md): primary repository rulebook
- [`.ai/README.md`](./.ai/README.md): helper-harness navigation guide
- [`shipyard/README.md`](./shipyard/README.md): product overview and quick start
- [`shipyard/docs/README.md`](./shipyard/docs/README.md): durable docs hub
- [`shipyard/docs/architecture/README.md`](./shipyard/docs/architecture/README.md):
  architecture diagrams and runtime flow notes
- [`shipyard/src/README.md`](./shipyard/src/README.md): source tree guide
- [`shipyard/tests/README.md`](./shipyard/tests/README.md): test suite map

## Working From The Repo Root

```bash
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
```

To run the built CLI from the root:

```bash
node shipyard/dist/bin/shipyard.js --target ../ship
```

To start the browser-first runtime after building:

```bash
pnpm --dir shipyard start -- --target ../ship --ui
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
- Story packs under `shipyard/docs/specs/` explain phased implementation work.
  Durable onboarding and architecture notes live in the new docs hub instead of
  being hidden inside individual spec folders.
