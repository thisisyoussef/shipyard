# Feature Spec

## Metadata
- Story ID: P6-S01
- Story Title: Explorer Subagent
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 6 subagents

## Problem Statement

The coordinator needs a dedicated way to ask, "What files matter here?" without polluting its own conversation history or risking accidental edits. Right now that responsibility is described conceptually, but the explorer subagent needs a concrete isolated contract so it can be used reliably.

## Story Objectives

- Objective 1: Create an isolated explorer invocation with read-only tools only.
- Objective 2: Make the explorer return structured findings as `ContextReport`, not a free-form essay.
- Objective 3: Keep coordinator history out of the explorer so its context stays narrow and task-specific.

## User Stories

- As a coordinator, I want to ask a focused codebase question and receive structured findings I can trust for planning.
- As a developer, I want the explorer to stay read-only so it cannot mutate files by accident.

## Acceptance Criteria

- [ ] AC-1: The explorer uses only `read_file`, `list_files`, and `search_files`.
- [ ] AC-2: The explorer does not inherit the coordinator's conversation history.
- [ ] AC-3: The explorer returns structured JSON matching `ContextReport` with file path, excerpt, and relevance.
- [ ] AC-4: The explorer can answer broad discovery questions such as “find all files that handle authentication.”
- [ ] AC-5: The explorer's output is easy for the coordinator to merge into its own planning context.

## Edge Cases

- No matches found: return an empty structured report, not a failure.
- Ambiguous discovery: include enough file context to make follow-up search possible.
- Large codebases: keep output bounded and relevant.

## Non-Functional Requirements

- Security: no write-capable tools in the explorer runtime.
- Reliability: the explorer should fail closed if a non-read tool is requested.
- Observability: findings should be specific enough to drive edits directly.

## UI Requirements (if applicable)

- If surfaced in the UI, explorer runs should show as read-only discovery work with no mutation events.

## Out of Scope

- Any file mutation.
- Coordinator routing heuristics.
- Verification command execution.

## Done Definition

- A standalone explorer subagent can search, summarize, and return `ContextReport` results without modifying the codebase.
