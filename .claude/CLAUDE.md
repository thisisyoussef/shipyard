# Shipyard Workspace Appendix

## Repo Shape

- Root `.ai/` directory: helper harness, workflows, templates, and memory
- Root `shipyard/` directory: runnable TypeScript CLI application

## Common Commands

From the repo root:

```bash
pnpm --dir shipyard build
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
node shipyard/dist/bin/shipyard.js --target ../ship
```

From inside `shipyard/`:

```bash
pnpm build
pnpm test
pnpm typecheck
```
