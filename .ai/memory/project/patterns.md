# Durable Patterns

Capture repeatable patterns that match how this workspace actually works.

## Repo Layout

- Root `.ai/` holds the helper harness only.
- Root `shipyard/` holds the runnable application.
- Root-level validation from this workspace should target `shipyard/`.

## Shipyard App Structure

- CLI entrypoint: `shipyard/bin/shipyard.ts`
- Core runtime loop: `shipyard/src/engine/`
- Context discovery: `shipyard/src/context/`
- Tool registry and tool implementations: `shipyard/src/tools/`
- Agent role definitions: `shipyard/src/agents/`
- Phase contracts: `shipyard/src/phases/`
- Local checkpoints and tracing: `shipyard/src/checkpoints/`, `shipyard/src/tracing/`

## Testing and Validation

- Tests live in `shipyard/tests/` and use Vitest.
- The app uses strict TypeScript and a separate build config.
- The baseline validation set is:
  - `pnpm --dir shipyard test`
  - `pnpm --dir shipyard typecheck`
  - `pnpm --dir shipyard build`

## Documentation Pattern

- Repo rules and harness truth live at the root.
- Product-specific implementation docs stay under `shipyard/`.
- Durable workflow notes go in `.ai/memory/project/`; current-task notes go in `.ai/memory/session/`.
