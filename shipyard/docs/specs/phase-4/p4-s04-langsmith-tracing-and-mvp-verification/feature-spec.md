# Feature Spec

## Metadata
- Story ID: P4-S04
- Story Title: LangSmith Tracing and MVP Verification
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 4 LangGraph State Machine, step 4.5 and MVP success test

## Problem Statement

Phase 4 is only complete when Shipyard can execute real natural-language tasks and produce inspectable traces. The current repo has LangSmith config detection, but not yet the final proof path: one clean task trace, one error trace, and the saved URLs that future contributors can use as the MVP examples in `CODEAGENT.md`.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Ensure LangGraph or fallback execution produces complete LangSmith traces.
- Objective 2: Verify the MVP on one successful task and one failing task.
- Objective 3: Preserve those two trace URLs as durable repo documentation.
- How this story or pack contributes to the overall objective set: This story is the acceptance gate for the entire MVP.

## User Stories
- As a Shipyard developer, I want to run two real tasks and inspect their LangSmith traces so I can confirm model calls, tool executions, state transitions, and failures are all visible.

## Acceptance Criteria
- [ ] AC-1: If the runtime uses LangGraph/LangChain, tracing is enabled by the documented environment variables and produces nested runs automatically.
- [ ] AC-2: If the runtime falls back to the raw loop, that loop is wrapped with LangSmith `traceable` instrumentation so inputs, outputs, and timing appear in LangSmith.
- [ ] AC-3: Run one successful natural-language task and one intentionally failing task, and confirm both traces appear in `smith.langchain.com`.
- [ ] AC-4: Save the two resulting trace URLs into `shipyard/CODEAGENT.md` as the MVP trace links.
- [ ] AC-5: The successful run proves Shipyard can read, edit, or create files from natural-language instructions end to end.
- [ ] AC-6: The failing run proves errors or blocked-file outcomes still produce complete traces and a usable final response.
- [ ] AC-7: The phase ends with validation and a commit covering the full MVP state.

## Edge Cases
- Empty/null inputs: missing tracing or model env vars fail with guidance before a live task run starts.
- Boundary values: the failing task can be a bad edit instruction or a request to edit a missing file, as long as it exercises recovery/error behavior.
- Invalid/malformed data: missing or incomplete trace URLs are treated as an incomplete acceptance gate.
- External-service failures: LangSmith ingestion failures are distinguished from model/runtime failures.

## Non-Functional Requirements
- Security: trace references saved in docs must not embed secrets.
- Performance: the MVP verification should stay as small and cheap as possible while still exercising success and failure paths.
- Observability: traces should show model calls, tool invocations, and runtime state transitions nested under the top-level run.
- Reliability: `CODEAGENT.md` should point to two real working trace URLs, not placeholders.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Generalized evaluation dashboards.
- Larger regression suites or benchmark infrastructure.
- Production monitoring beyond the two MVP traces.

## Done Definition
- Two real LangSmith traces exist and are documented.
- The runtime has been exercised successfully and unsuccessfully from natural-language input.
- The repo is validated as far as the current baseline allows and the MVP commit is recorded.
