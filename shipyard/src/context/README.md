# Context

The context layer builds the stable project understanding shipped into each
instruction turn.

## Files

- `discovery.ts`: inspects the target directory to determine whether it is
  greenfield or existing, which language/framework/package manager it uses,
  which scripts are available, and whether `README` or `AGENTS.md` exists
- `envelope.ts`: loads target rules from `AGENTS.md` and serializes the stable,
  task, runtime, and session slices used in the system prompt

## Why It Matters

This folder is the bridge between "raw target directory on disk" and "usable
prompt context." When behavior depends on repository shape or project rules, it
should usually start here rather than inside the CLI or tool layer.
