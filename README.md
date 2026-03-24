# Shipyard Workspace

This repo now has two parallel surfaces:

- `.ai/` is a helper harness for planning, workflows, memory, and reusable execution rules.
- `shipyard/` is the actual TypeScript CLI application we are building.

## Working From The Repo Root

```bash
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
```

To run the current CLI build from the root:

```bash
node shipyard/dist/bin/shipyard.js --target ../ship
```

## Layout

```text
.
├── .ai/
│   ├── docs/
│   ├── memory/
│   ├── skills/
│   ├── state/
│   ├── templates/
│   └── workflows/
└── shipyard/
    ├── bin/
    ├── docs/
    ├── src/
    └── tests/
```
