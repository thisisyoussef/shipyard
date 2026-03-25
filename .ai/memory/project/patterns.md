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
- New read-only capability surfaces should prefer dedicated tools with
  human-readable summaries plus structured `data`, so browser activity and
  later-turn `recentToolOutputs` can reuse the same result contract.

## Runtime Artifact Pattern

- Keep lightweight coordinator planning in `TaskPlan`, but use a richer typed
  `ExecutionSpec` for broad code-phase instructions so later evaluator and
  handoff stories can reuse the same contract.
- New read-only helper roles should follow the explorer/verifier/planner shape:
  isolated history, explicit tool allowlist, local Zod validation, and fail-
  closed parsing before coordinator code consumes the result.

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

## UI Workflow Pattern

- Visible UI stories default to `node scripts/generate-design-brief.mjs --story <story-id>` before TDD.
- The design brief bridge is Claude-first and falls back to Codex only when Claude is unavailable or errors.
- When Refero is configured, the UI workflow uses it during brainstorming/reference research before drafting the brief.
- The design brief bridge includes `.ai/agents/claude.md` and `.claude/CLAUDE.md` context so Claude follows the same imperative design skill chain Codex uses.
- Later UI phases can be scripted with `node scripts/run-ui-phase-bridge.mjs --phase <ui|qa|critic|polish> --story <story-id>`.
- `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES=1` makes those later scripted UI phase bridges Claude-first; leaving it unset keeps them Codex-first.
- Scripted UI phase bridges write artifacts under `.ai/state/ui-phase-bridge/<story-id>/`.
