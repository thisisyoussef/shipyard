# Feature Spec

## Metadata
- Story ID: PTM-S01
- Story Title: Target Manager Tools & Data Model
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Target Manager

## Problem Statement

Shipyard requires a pre-existing directory path via `--target` before it can do anything. There is no way to browse available targets, create a new project from scratch, or get AI-generated context about what a target is. Users must manually set up directories and remember paths.

## Story Objectives

- Objective 1: Define the `TargetProfile` type that captures AI-enriched project metadata beyond static discovery.
- Objective 2: Implement four target manager tools (`list_targets`, `select_target`, `create_target`, `enrich_target`) in the standard tool registry.
- Objective 3: Persist `TargetProfile` as `<target>/.shipyard/profile.json` so enrichment survives across sessions.

## User Stories

- As a user, I want to see what targets are available in a directory so I can pick one without remembering paths.
- As a user, I want to create a new project from a description and have it scaffolded with starter files.
- As a user, I want AI-generated context about my project (description, architecture, complexity, task suggestions) so the coding agent understands what it is working on.

## Acceptance Criteria

- [ ] AC-1: `TargetProfile` interface is defined in `src/artifacts/types.ts` with all fields from the design (name, description, purpose, stack, architecture, keyPatterns, complexity, suggestedAgentsRules, suggestedScripts, taskSuggestions, enrichedAt, enrichmentModel, discoverySnapshot).
- [ ] AC-2: `list_targets` scans a directory and returns metadata for each subdirectory that looks like a repo.
- [ ] AC-3: `select_target` resolves a path, ensures `.shipyard/` directories, loads an existing profile if present, and returns target info.
- [ ] AC-4: `create_target` creates a directory, runs `git init`, scaffolds starter files based on `scaffoldType`, generates README.md and AGENTS.md from the user description, and runs discovery.
- [ ] AC-5: `enrich_target` runs discovery, reads key files, sends context to Claude, parses the response into `TargetProfile`, and writes `profile.json`.
- [ ] AC-6: For greenfield targets (no existing files), `enrich_target` uses the user-provided description instead of file reading.
- [ ] AC-7: All four tools are registered in the tool registry and conform to the `ToolDefinition` contract.
- [ ] AC-8: `profile.json` is loaded when a target is selected and available in `SessionState`.

## Edge Cases

- Empty directory: `list_targets` returns an empty array, not an error.
- Directory with non-repo subdirectories (e.g. `.git`, `node_modules`): filtered out of listing.
- Target already has a `profile.json`: `select_target` loads it; `enrich_target` overwrites it with fresh enrichment.
- Scaffold type not provided to `create_target`: defaults to `"empty"` (just git init + README + AGENTS.md).
- Enrichment model returns malformed JSON: fail gracefully with a descriptive error, do not write a corrupt profile.
- Very large repo (hundreds of files): `enrich_target` reads at most ~20 key files to keep context bounded.

## Non-Functional Requirements

- Performance: `list_targets` should complete in under 2 seconds for directories with up to 50 subdirectories.
- Reliability: scaffold templates are self-contained — no network fetches, no `npx create-*` calls.
- Observability: `enrich_target` emits `enrichment-started` and `enrichment-complete` progress events via the reporter.

## UI Requirements (if applicable)

- No UI in this story. Tools are backend-only and surfaced through the existing turn execution pipeline.

## Out of Scope

- CLI argument changes (`--target` optional, `--targets-dir`).
- REPL `target` command.
- Browser workbench UI.
- Code phase system prompt modifications to reference `TargetProfile`.

## Done Definition

- All four tools pass unit tests exercising happy path and edge cases.
- `TargetProfile` can be written to and read from `profile.json` with round-trip fidelity.
- `enrich_target` produces a meaningful profile for both existing repos and greenfield descriptions.
