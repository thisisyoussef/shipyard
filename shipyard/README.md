# Shipyard

Shipyard is the runnable coding-agent application inside this workspace. It starts with a persistent CLI, stable target discovery, and a typed tool layer for file operations, search, command execution, checkpoints, and tracing.

## Layout

```text
shipyard/
  src/
    bin/
      shipyard.ts
    engine/
    phases/
    tools/
    agents/
    context/
    artifacts/
    checkpoints/
    tracing/
```

## Day 1 Goals

- persistent `shipyard --target <path>` process
- target discovery for existing or greenfield repositories
- safe read, write, edit, search, command, and git-diff primitives
- typed artifacts, context envelopes, checkpoints, and local tracing scaffolds

## Quick Start

From the repo root:

```bash
pnpm --dir shipyard install
pnpm --dir shipyard build
node shipyard/dist/bin/shipyard.js --target ../ship
```

From inside `shipyard/`:

```bash
pnpm install
pnpm build
node dist/bin/shipyard.js --target ../../ship
```

Once you want a bare `shipyard` command outside the repo, link the package with your preferred global package-manager workflow.
