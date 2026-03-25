# Technical Plan

## Metadata
- Story ID: PTM-S02
- Story Title: CLI Integration & Runtime Switching
- Author: Codex
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/src/bin/shipyard.ts` — make `--target` optional, add `--targets-dir`, handle target manager mode startup
  - `shipyard/src/engine/loop.ts` — add `target` command to REPL command registry, implement subcommand handlers
  - `shipyard/src/engine/state.ts` — add `switchTarget()` utility (save old session, load/create new session, update discovery)
  - `shipyard/src/engine/turn.ts` — phase selection logic (target manager vs code phase based on whether a target is active)
  - `shipyard/src/phases/target-manager/index.ts` — imported and used for the first turn when no target

- Public interfaces/contracts:
  - `CliOptions.targetPath` becomes `string | undefined`
  - `CliOptions.targetsDir` new optional string field
  - `switchTarget(currentState, newTargetPath): Promise<SessionState>` function
  - REPL `target` command with subcommands

- Data flow summary:
  1. CLI starts → if no `--target`, enter target manager phase
  2. Target manager LLM turn → user picks/creates target via tools
  3. `select_target` tool returns → runtime captures selected path
  4. Runtime creates session for selected target → switches to code phase
  5. Mid-session `target switch` → save state → resolve new target → load/create session → rebuild envelope → resume REPL

## Architecture Decisions

- Decision: Phase switching is a runtime concern, not a tool concern.
  - Rationale: Tools return data. The runtime decides what phase to use next based on tool results. `select_target` returns metadata; the engine interprets "target selected" and switches phases.

- Decision: The `target` REPL command calls the same underlying functions as the tools, not the tools themselves.
  - Rationale: REPL commands are synchronous user actions, not LLM-mediated tool calls. Calling the same functions avoids duplication without routing through the tool registry.

- Decision: `switchTarget()` is a pure state transition — it does not trigger enrichment automatically.
  - Rationale: Enrichment is optional and can be slow. The user can explicitly run `target enrich` after switching. The REPL can suggest it.

## Dependency Plan

- Existing dependencies used: Commander (CLI parsing), readline (REPL), session state, discovery, tool functions from PTM-S01.
- New dependencies proposed: none.

## Implementation Notes

- `parseArgs()` change: replace `.requiredOption("--target")` with `.option("--target")`. Add `.option("--targets-dir", "Directory containing target repos", "./test-targets/")`.
- `main()` change: if `options.targetPath` is undefined, skip discovery and session creation. Instead, enter a special "target selection" loop that runs one target manager turn.
- The target manager turn should have a concise system prompt: "You are helping the user select or create a project target. Use the target manager tools to list, select, or create targets. Once the user has chosen a target, call select_target to confirm."
- REPL command parsing: `target` with no args, or `target <subcommand>`. Subcommands: `switch`, `create`, `enrich`, `profile`.
- `switchTarget()` implementation: save current session via `saveSessionState()`, run `discoverTarget()` on new path, load existing session via `loadSessionState()` or create new one, load profile from `profile.json`, return new `SessionState`.

## Test Strategy

- Unit: `parseArgs()` with and without `--target` flag.
- Unit: `switchTarget()` with mock session state and filesystem.
- Unit: REPL `target` command parsing and dispatch.
- Integration: launch main() without `--target`, verify target manager phase is entered (mock the LLM turn).
- Integration: simulate a target switch and verify both sessions are persisted correctly.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
