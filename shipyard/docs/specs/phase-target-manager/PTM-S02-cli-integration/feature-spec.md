# Feature Spec

## Metadata
- Story ID: PTM-S02
- Story Title: CLI Integration & Runtime Switching
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Target Manager

## Problem Statement

Even with target manager tools built (PTM-S01), the CLI still requires `--target` as a mandatory flag and has no way to switch targets mid-session. Users must quit and relaunch to work on a different project.

## Story Objectives

- Objective 1: Make `--target` optional so Shipyard can launch into target manager mode when no target is specified.
- Objective 2: Add a `--targets-dir` flag that tells the target manager where to look for existing targets.
- Objective 3: Add a `target` REPL command that allows switching, creating, and enriching targets at any point during a session.
- Objective 4: Implement session save/load on target switch so no work is lost.

## User Stories

- As a user, I want to launch Shipyard without knowing a target path and be guided to pick or create one.
- As a user, I want to switch to a different project mid-session without quitting and relaunching.
- As a user, I want to re-enrich my current target if I have made significant changes since the last enrichment.

## Acceptance Criteria

- [ ] AC-1: `--target` is optional in `parseArgs()`. When omitted, the CLI enters target manager mode.
- [ ] AC-2: `--targets-dir <path>` is accepted and defaults to `./test-targets/` relative to cwd.
- [ ] AC-3: When no target is specified, the first turn uses `targetManagerPhase` instead of `codePhase`. The LLM greets the user and offers to list/select/create targets.
- [ ] AC-4: Once a target is selected (via tool call), the runtime switches to `codePhase` for all subsequent turns.
- [ ] AC-5: The REPL recognizes a `target` command with subcommands: (no args), `switch`, `create`, `enrich`, `profile`.
- [ ] AC-6: `target` (no args) prints the current target path, name, and profile summary.
- [ ] AC-7: `target switch` lists available targets and prompts for selection, then performs the switch.
- [ ] AC-8: On target switch: current session state is saved, new target is resolved, discovery runs, session is loaded or created, context envelope is rebuilt.
- [ ] AC-9: `target create` enters the creation flow using `create_target` tool logic.
- [ ] AC-10: `target enrich` re-runs AI enrichment on the current target.
- [ ] AC-11: `target profile` prints the full `TargetProfile` JSON for the current target.
- [ ] AC-12: Existing `--target <path>` behavior is completely unchanged (backward compatible).

## Edge Cases

- `--targets-dir` points to a non-existent directory: create it with a warning.
- User tries to switch to the same target they are already on: no-op with a message.
- Target switch when current session has unsaved state: save before switching.
- `target enrich` on a greenfield target with no files: prompt user for a description.
- `target switch` when `--targets-dir` was not provided: use the parent directory of the current target.

## Non-Functional Requirements

- Performance: target switch should complete in under 3 seconds (excluding enrichment).
- UX: the target manager greeting should be concise and action-oriented, not verbose.
- Reliability: session state must be fully persisted before switch. No partial state.

## UI Requirements (if applicable)

- Terminal only in this story. Browser workbench changes are in PTM-S03.

## Out of Scope

- Browser workbench UI for target switching.
- WebSocket message contracts for target events.
- Code phase system prompt changes to reference `TargetProfile`.

## Done Definition

- A user can launch `shipyard` with no `--target` and successfully select or create a target through conversation.
- A user mid-session can type `target switch` and change to a different project without losing session state.
- All existing `--target <path>` workflows are unaffected.
