# Shipyard

Shipyard is a standalone coding-agent repo that starts with a persistent CLI, stable target discovery, and a small tool layer for file operations, search, and command execution.

## Day 1 Goals

- persistent `shipyard --target <path>` process
- target discovery for existing or greenfield repositories
- tool layer with safe read, write, edit, search, and command primitives

## Quick Start

```bash
pnpm install
pnpm build
pnpm exec shipyard --target ../ship
```
