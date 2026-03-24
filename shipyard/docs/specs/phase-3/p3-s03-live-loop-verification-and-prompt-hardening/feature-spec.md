# Feature Spec

## Metadata
- Story ID: P3-S03
- Story Title: Live Loop Verification and Prompt Hardening
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 3 Wire Tools To Claude, step 3.2

## Problem Statement

The raw loop only matters if the live model actually uses the tools correctly. Phase 3 therefore needs a moment-of-truth verification pass that proves Claude reads files with `read_file`, edits existing files surgically with `edit_block`, and creates new files with `write_file`. If Claude chooses the wrong tool during surgical editing, the fix belongs in the system prompt and tool wording before any higher-level orchestration is added.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Verify the live model uses the right tool for each task shape.
- Objective 2: Preserve byte-for-byte safety outside the targeted surgical edit.
- Objective 3: Tighten prompts only in response to observed live failure modes.
- How this story or pack contributes to the overall objective set: This story turns the raw loop from an implementation into a proven workflow.

## User Stories
- As a Shipyard developer, I want a direct live verification harness so I can watch Claude use the new tools and confirm it edits files surgically instead of rewriting them wholesale.

## Acceptance Criteria
- [ ] AC-1: Add a direct verification harness or smoke script that creates a temp target directory and runs the raw loop against three live scenarios: read, surgical edit, and greenfield creation.
- [ ] AC-2: In the read scenario, Claude uses `read_file` and correctly reports which functions are defined in the test file.
- [ ] AC-3: In the surgical-edit scenario, Claude uses `edit_block` rather than `write_file`, changes only the requested function, and leaves every other byte in the file unchanged.
- [ ] AC-4: In the greenfield scenario, Claude uses `write_file` and produces the requested new file content.
- [ ] AC-5: If the surgical-edit scenario fails because Claude rewrites a file or chooses the wrong tool, update the relevant system prompt or tool descriptions with clearer surgical-edit guidance and rerun until the scenario passes.
- [ ] AC-6: The story ends with the repo validation commands and a commit once the live scenarios pass.

## Edge Cases
- Empty/null inputs: the harness fails fast if no Anthropic API key is present.
- Boundary values: the surgical-edit verification compares the entire file before and after, not just the changed function.
- Invalid/malformed data: if Claude returns an incomplete answer or wrong tool choice, the harness records that result explicitly.
- External-service failures: Anthropic/network failures are reported separately from prompt-behavior failures.

## Non-Functional Requirements
- Security: live verification fixtures stay local and disposable.
- Performance: fixture files and prompts remain intentionally small.
- Observability: logs and saved transcripts should make it obvious which tool Claude chose in each scenario.
- Reliability: the surgical-edit assertion must compare the untouched regions byte-for-byte, not semantically.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Building a generalized evaluation framework.
- Replacing the raw loop with LangGraph.
- Larger benchmark suites beyond the three required scenarios.

## Done Definition
- The live harness passes all three scenarios.
- Prompt hardening is applied only if live behavior proves it is needed.
- The repo is validated and the working phase is committed.
