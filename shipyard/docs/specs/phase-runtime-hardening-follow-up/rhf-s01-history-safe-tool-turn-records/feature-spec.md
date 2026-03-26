# Feature Spec

## Metadata
- Story ID: RHF-S01
- Story Title: History-Safe Tool Turn Records
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

Shipyard still stores full assistant `tool_use` blocks and full serialized `tool_result` payloads in message history. In write-heavy greenfield runs that means old `write_file.content` bodies and bulky command output keep getting replayed on every Anthropic request even after the files already exist on disk. The loop then spends its prompt budget on stale payloads instead of the next implementation step.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: replace raw historical tool payloads with compact, re-readable records.
- Objective 2: keep live tool reporting and traces rich without forcing replay history to stay raw.
- Objective 3: give later compaction and continuation logic bounded turn records to work with.
- How this story or pack contributes to the overall objective set: This is the highest-impact fix in the follow-up pack because every later history, handoff, and budget improvement depends on completed tool turns being compact by construction.

## User Stories
- As the raw loop, I want completed write-heavy tool turns stored as compact digests so later requests stay focused on the current task.
- As an operator sending a follow-up instruction, I want Shipyard to remember which files it just created or edited without replaying the full file bodies back to the model.

## Acceptance Criteria
- [ ] AC-1: Completed `write_file`, `edit_block`, `bootstrap_target`, and oversized `run_command` turns are stored in history as compact records instead of full raw `tool_use.input` or bulky `tool_result` payloads.
- [ ] AC-2: Each compact record preserves the tool name, relevant path or paths, success or failure, line or character count when available, a stable content fingerprint or hash when contents exist, and a short preview or error summary.
- [ ] AC-3: The active protocol tail stays verbatim until the provider no longer needs exact `tool_use` plus `tool_result` continuity for the current exchange.
- [ ] AC-4: Current-turn reporters, traces, and handoff artifacts can still access full live tool input or result data; only replay history becomes compact.
- [ ] AC-5: Focused replay tests prove historical prompt size no longer scales with full file bodies or long command output after the turn completes.

## Edge Cases
- Multiple tool calls in one assistant turn should each receive their own digest instead of collapsing into one vague sentence.
- Pathless tools still need a useful identity in history even when no file path exists.
- Failed tools, command timeouts, and provider-visible errors must keep a concise diagnostic preview.
- Compact records must tell the model to re-read from disk when exact contents are required.

## Non-Functional Requirements
- Reliability: compact storage must not break Anthropic message ordering or tool-use protocol continuity.
- Performance: replay history growth should flatten after completed write-heavy turns instead of growing with file-body size.
- Observability: digests should be inspectable in logs or traces so replay behavior is debuggable.
- Maintainability: the runtime should have one clear history-serialization path instead of ad hoc per-tool string handling.

## Out of Scope
- Removing full current-turn tool data from live UI events or traces.
- Replacing `write_file` or `edit_block` with different tool contracts.
- Depending on provider-side prompt caching as the only fix.

## Done Definition
- Completed tool turns are preserved as bounded digests in replay history, and write-heavy follow-up turns no longer drag raw historical file bodies back into every request.
