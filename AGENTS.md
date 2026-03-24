# Workspace Agent Instructions

`AGENTS.md` is the primary checked-in rulebook for this repository.
If another checked-in instruction file disagrees with this file, follow `AGENTS.md`.

## Read Order

Load context in this order before making non-trivial changes:

1. `AGENTS.md`
2. `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
3. `.ai/codex.md`
4. `shipyard/README.md`
5. `shipyard/CODEAGENT.md`
6. `shipyard/PRESEARCH.md` when architecture or intent needs extra context
7. `.claude/CLAUDE.md` as a secondary appendix for repo layout and command reminders

## Working Model

- Treat `.ai/` as helper scaffolding for this workspace, not as product code.
- Treat `shipyard/` as the runnable application surface.
- Keep the harness repo-scoped and generic to Shipyard work; do not import external-project backlog, deploy, or feature memory into `.ai/`.
- Prefer checked-in docs and code over chat memory when deciding what to build next.

## Story Rules

- Start non-trivial work on a fresh `codex/` branch.
- Do a preparation pass before edits: inspect the relevant code, contracts, and docs first.
- Use TDD for behavior changes when practical.
- Keep narrow corrections narrow; do not silently expand scope.
- When a change has non-obvious tradeoffs, pause and confirm direction before taking the more expensive path.

## Validation Rules

Run the app's validation commands from the repo root unless you are already inside `shipyard/`:

- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- `git diff --check`

If the change touches `.ai/`, re-read the source-of-truth files and verify the harness still matches the actual repo layout.

## Finalization Default

- Do not assume deploy work exists unless the story explicitly adds it.
- Keep final git actions explicit. If the user does not ask for commit/push/PR work, stop after validated local changes and report the result clearly.
