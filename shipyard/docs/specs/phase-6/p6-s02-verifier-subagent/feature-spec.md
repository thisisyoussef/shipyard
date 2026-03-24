# Feature Spec

## Metadata
- Story ID: P6-S02
- Story Title: Verifier Subagent
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 6 subagents

## Problem Statement

The coordinator should not run test commands directly after edits. A dedicated verifier subagent keeps the coordinator context clean, turns long command output into structured evidence, and makes pass/fail decisions easier to reason about.

## Story Objectives

- Objective 1: Create an isolated verifier invocation with `run_command` only.
- Objective 2: Make the verifier return structured `VerificationReport` output.
- Objective 3: Keep verification output compact enough for the coordinator to act on quickly.

## User Stories

- As a coordinator, I want to delegate command execution so I can focus on planning and recovery.
- As a developer, I want verification failures to be structured and actionable rather than buried in raw terminal noise.

## Acceptance Criteria

- [ ] AC-1: The verifier uses only `run_command`.
- [ ] AC-2: The verifier does not inherit the coordinator's conversation history.
- [ ] AC-3: The verifier returns structured JSON matching `VerificationReport` with command, exit code, pass/fail, stdout, stderr, and summary.
- [ ] AC-4: The verifier can run the project's test suite, type checker, or a targeted command.
- [ ] AC-5: The coordinator can consume the verifier result without parsing raw shell logs.

## Edge Cases

- No command available: return a structured failure, not an exception dump.
- Command times out: capture exit code and combined output cleanly.
- Long stderr/stdout: trim or summarize while preserving the failure signal.

## Non-Functional Requirements

- Reliability: verifier output should be stable across repeated runs.
- Observability: the summary should identify the exact command that failed.
- Security: command execution stays constrained to the target directory.

## UI Requirements (if applicable)

- If surfaced in the UI, verifier runs should show as command execution with clear pass/fail state.

## Out of Scope

- Editing files.
- Coordinator heuristics.
- Explorer discovery logic.

## Done Definition

- A standalone verifier subagent can execute commands and return structured `VerificationReport` results without contaminating coordinator context.
