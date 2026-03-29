# Shipyard Docs

This directory is the durable documentation hub for the Shipyard application.
Use it for architecture notes, onboarding, and long-lived reference material.
Use `docs/specs/` for story packs and phased implementation plans.

## Start Here

- [`../README.md`](../README.md): product overview, quick start, and operator-facing commands
- [`demo/mvp-demo-script.md`](./demo/mvp-demo-script.md): short recorded walkthrough for the current target-selection, chat/live-run, and preview flow
- [`architecture/README.md`](./architecture/README.md): system diagrams and runtime flow
- [`architecture/hosted-railway.md`](./architecture/hosted-railway.md): hosted Railway runtime contract, persistence notes, access gate, upload intake, and deploy flow
- [`submissions/ship-rebuild/README.md`](./submissions/ship-rebuild/README.md): Ship rebuild submission pack, comparative analysis, development log, cost analysis, and rebuild log
- [`../src/README.md`](../src/README.md): source tree map and ownership guide
- [`../ui/README.md`](../ui/README.md): React SPA source guide
- [`../tests/README.md`](../tests/README.md): automated and manual test coverage
- [`specs/README.md`](./specs/README.md): indexed phase packs

## Reference Material

- [`shipyard-prd.pdf`](./shipyard-prd.pdf): original product requirements document
- [`shipyard-presearch.pdf`](./shipyard-presearch.pdf): presearch backing the architecture direction
- [`../PRESEARCH.md`](../PRESEARCH.md): concise checked-in recommendation summary
- [`../CODEAGENT.md`](../CODEAGENT.md): runtime contract and implementation notes

## What Belongs Here

- Stable runtime explanations that should survive multiple feature branches
- Diagrams for how the CLI, engine, tools, tracing, checkpoints, and UI fit together
- Index pages that help people navigate the codebase faster

## What Does Not Belong Here

- Temporary branch notes
- One-off debugging logs
- Story-specific acceptance criteria better captured in `docs/specs/<phase>/...`
