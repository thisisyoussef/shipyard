# Shipyard

Shipyard is the runnable coding-agent application inside this workspace. It starts with a persistent CLI, stable target discovery, and a typed tool layer for file operations, search, command execution, checkpoints, and tracing.

The current runtime now has two operator modes:

- terminal REPL mode for direct local iteration
- `--ui` mode for a browser-first developer surface over the same engine/session model

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

To start the browser runtime after a build:

```bash
pnpm --dir shipyard start -- --target ../ship --ui
```

From inside `shipyard/`:

```bash
pnpm install
pnpm build
node dist/bin/shipyard.js --target ../../ship
```

Once you want a bare `shipyard` command outside the repo, link the package with your preferred global package-manager workflow.

## UI Runtime

The pre-2 developer UI uses:

- Node's built-in `http` server plus `ws` for the local backend transport
- a single React SPA built with Vite into `shipyard/dist/ui`
- the same persisted Shipyard session and engine state used by terminal mode
- a live event bridge that streams thinking, tool calls, tool results, errors, and session snapshots over one WebSocket session
- browser-visible context injection receipts and reload-safe session rehydration for the active `--ui` session
