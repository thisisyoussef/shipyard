# Decisions Today

- 2026-03-24: Moved the runnable application into `shipyard/` so the repo root can host a parallel `.ai/` helper harness.
- 2026-03-24: Imported the harness baseline from the source repo's fuller worktree snapshot instead of its sparse root `.ai/`, because the root copy only contained state files.
- 2026-03-24: Reset imported project memory so the harness starts as Shipyard-specific scaffolding rather than reused product history.
- 2026-03-24: Standardized root-level validation to `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`, and `pnpm --dir shipyard build`.
