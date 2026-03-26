# Durable Patterns

Capture repeatable patterns that match how this workspace actually works.

## Repo Layout

- Root `.ai/` holds the helper harness only.
- Root `shipyard/` holds the runnable application.
- Root-level validation from this workspace should target `shipyard/`.

## Shipyard App Structure

- CLI entrypoint: `shipyard/src/bin/shipyard.ts`
- Core runtime loop: `shipyard/src/engine/`
- Internal model/provider contract: `shipyard/src/engine/model-adapter.ts`
- Routed planning/task execution: `shipyard/src/plans/`
- Context discovery: `shipyard/src/context/`
- Tool registry and tool implementations: `shipyard/src/tools/`
- Agent role definitions: `shipyard/src/agents/`
- Phase contracts: `shipyard/src/phases/`
- Preview and hosted-workspace helpers: `shipyard/src/preview/`,
  `shipyard/src/hosting/`
- Local checkpoints and tracing: `shipyard/src/checkpoints/`, `shipyard/src/tracing/`
- New read-only capability surfaces should prefer dedicated tools with
  human-readable summaries plus structured `data`, so browser activity and
  later-turn `recentToolOutputs` can reuse the same result contract.
- Durable long-run resume state should live under
  `shipyard/.shipyard/artifacts/<sessionId>/` as typed artifacts, while session
  snapshots keep only a lightweight pointer such as `activeHandoffPath`.
- When a resumed turn needs prior long-run state, inject it as a dedicated
  structured context block like `latestHandoff` instead of inflating
  `rollingSummary` or copied prompt prose.
- Local JSONL traces and LangSmith metadata should carry the routing facts
  needed to debug coordinator decisions, including handoff load/emission state
  and reset reason when applicable.
- Shipyard now has three operator turn paths over the same session model:
  target-manager turns, `plan:` / `next` / `continue`, and standard code turns.
- The current browser workbench is a split-pane shell: transcript and composer
  on the left, file/output evidence on the right, and a drawer for
  session/history/context. Do not assume the older preview/live-view tab shell
  is still current.
- Hosted Railway deploys should treat the nested `shipyard/` directory as the
  app root. App-level `railway.json` commands run from that directory, so they
  should use plain `pnpm build` / `pnpm start -- --ui` instead of recursing
  back into `--dir shipyard`.
- Shared runtime code should depend on Shipyard-owned turn/tool contracts, while
  provider adapters project `ToolDefinition[]` into provider-specific wire
  formats inside adapter modules.

## Runtime Artifact Pattern

- Keep lightweight coordinator planning in `TaskPlan`, but use a richer typed
  `ExecutionSpec` for broad code-phase instructions so later evaluator and
  handoff stories can reuse the same contract.
- New read-only helper roles should follow the explorer/verifier/planner shape:
  isolated history, explicit tool allowlist, local Zod validation, and fail-
  closed parsing before coordinator code consumes the result.
- Plan larger runtime architecture work as ordered spec packs. The current
  `phase-10` sequence is: durable threads -> policy/sandboxing -> layered
  memory -> repo indexing -> routing/evals -> isolated background tasks ->
  evented jobs and readiness.
- Even when Shipyard borrows software-factory patterns, keep the single-writer
  coordinator for the main target and make any parallelism read-only,
  isolated, or review-before-apply.
- `src/tools/registry.ts` is the canonical generic tool boundary. If a provider
  needs a different tool schema, add a projection helper in the provider module
  instead of teaching the registry about that provider.

## Greenfield Bootstrap Pattern

- Shared scaffold definitions live in `shipyard/src/tools/target-manager/scaffolds.ts`.
- File creation for scaffolds is centralized in `shipyard/src/tools/target-manager/scaffold-materializer.ts`.
- New-target creation uses `create_target`; already-selected empty targets use `bootstrap_target`.
- Code phase should prefer `bootstrap_target` for standard workspace starters instead of many boilerplate `write_file` calls.

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
- Fresh story branches and worktrees should copy the required local `.env*` files from the working `main` setup before running project commands, and those files stay untracked.
- Runtime-facing README and architecture docs must be verified against the
  current code before reusing historic phase-pack wording.

## UI Workflow Pattern

- Visible UI stories default to `node scripts/generate-design-brief.mjs --story <story-id>` before TDD.
- The design brief bridge is Claude-first and falls back to Codex only when Claude is unavailable or errors.
- When Refero is configured, the UI workflow uses it during brainstorming/reference research before drafting the brief.
- The design brief bridge includes `.ai/agents/claude.md` and `.claude/CLAUDE.md` context so Claude follows the same imperative design skill chain Codex uses.
- Later UI phases can be scripted with `node scripts/run-ui-phase-bridge.mjs --phase <ui|qa|critic|polish> --story <story-id>`.
- `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES=1` makes those later scripted UI phase bridges Claude-first; leaving it unset keeps them Codex-first.
- Scripted UI phase bridges write artifacts under `.ai/state/ui-phase-bridge/<story-id>/`.
