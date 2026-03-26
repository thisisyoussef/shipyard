# Technical Plan

## Metadata
- Story ID: RTH-S03
- Story Title: Continuation-Aware Routing and Subagent Visibility
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/ui/server.ts` or shared reporter plumbing if subagent activity needs to surface in the workbench
  - focused tests such as `shipyard/tests/graph-runtime.test.ts`, `shipyard/tests/turn-runtime.test.ts`, and `shipyard/tests/ui-runtime.test.ts`
- Public interfaces/contracts:
  - recent-target-path carry-forward contract used by coordinator heuristics
  - richer subagent loop-option forwarding for tool hooks and budget settings
  - reporter or trace metadata for visible subagent activity
- Data flow summary: the runtime records recent touched paths from bootstrap, edits, plans, and active tasks; coordinator heuristics consult that evidence before escalating; if a subagent still runs, its tool calls flow through the same outer reporting hooks used by the main acting loop.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - cheaper same-session continuation
  - visible heavy-path execution when escalation is justified
  - no hidden subagent loops consuming the same provider budget
- Story ordering rationale: this story follows the compaction and budget fixes because routing should be tuned against the stabilized runtime envelope and budget model.
- Gaps/overlap check: this story owns routing heuristics and subagent visibility only; bootstrap allowlist alignment is isolated in `RTH-S04`.
- Whole-pack success signal: Shipyard can explain why it stayed lightweight or why it escalated, and either path is visible in traces and UI evidence.

## Architecture Decisions
- Decision: route same-session follow-ups from recent local evidence first, and treat explorer or planner as an explicit escalation rather than the default for every broad continuation.
- Alternatives considered:
  - keep current broad-request heuristics unchanged
  - always re-run explorer or planner after the target stops being greenfield
  - hide subagent activity behind the existing final-response surface
- Rationale: Shipyard already has session, task, and tool evidence that should keep common follow-ups cheap, and invisible subagent loops undermine operator trust.

## Data Model / API Contracts
- Request shape:
  - current instruction
  - recent edited or bootstrapped target paths
  - active-task paths
  - prior execution-spec or context-report paths
- Response shape:
  - updated routing decision
  - visible subagent activity metadata such as tool calls, iteration count, or selected heavy path
- Storage/index changes:
  - optional `recentTouchedFiles` or equivalent runtime/session field if current state is insufficient
  - no new user-facing artifact format required if trace and reporter metadata are enough

## Dependency Plan
- Existing dependencies used: coordinator heuristics, graph runtime, bootstrap result handling, active-task/session state, and the outer reporter/tracing path.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: recent-path reuse becomes too sticky and skips needed discovery.
  - Mitigation: keep escalation heuristics explicit, prefer freshness-limited evidence, and test unrelated broad follow-ups separately.

## Test Strategy
- Unit tests:
  - routing helper prefers lightweight continuation when recent touched paths cover the request
  - routing helper still escalates when recent evidence is absent or stale
- Integration tests:
  - same-session follow-up after bootstrap or edit stays lightweight
  - genuinely broad existing-target follow-up still uses explorer or planner
  - subagent tool activity is forwarded through outer reporting or traces
- E2E or smoke tests:
  - live follow-up after scaffold/bootstrap shows either lightweight continuation or visible subagent work
- Edge-case coverage mapping:
  - unrelated pivot after recent edit
  - cancelled subagent
  - missing recent-path state
  - subagent loop that hits its own iteration cap

## Rollout and Risk Mitigation
- Rollback strategy: keep routing helpers and subagent-loop forwarding isolated so Shipyard can revert to current heuristics without touching explorer or planner contracts.
- Feature flags/toggles: optional if a staged rollout is needed for the routing heuristics.
- Observability checks: local logs, trace metadata, or workbench activity should reveal whether the turn stayed lightweight, which recent paths were reused, and what the subagent actually did if escalation happened.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
