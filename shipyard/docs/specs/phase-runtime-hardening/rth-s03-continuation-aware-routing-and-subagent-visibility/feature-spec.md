# Feature Spec

## Metadata
- Story ID: RTH-S03
- Story Title: Continuation-Aware Routing and Subagent Visibility
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening supplemental pack

## Problem Statement

Once a target stops being greenfield, Shipyard currently routes broad follow-up requests into explorer or planner too aggressively, even when the same session just scaffolded or edited the relevant files. At the same time, subagent tool activity is largely invisible to the outer turn reporter because only a narrow subset of raw-loop options gets forwarded. The result is expensive escalation, opaque iteration failures, and follow-up turns that look idle even when subagents are burning the same underlying loop budget.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Prefer the lightweight path for same-session follow-ups when recent edits already identify the likely working set.
- Objective 2: Carry forward recent target-file evidence from bootstrap, edits, active tasks, and prior plans before deciding to escalate.
- Objective 3: Surface explorer and planner activity through the same reporter or trace path the outer runtime already uses.
- How this story or pack contributes to the overall objective set: This story keeps heavy routing rare and visible, which is critical once longer turns and follow-up sessions become viable again.

## User Stories
- As a Shipyard operator, I want a follow-up request against files Shipyard just created or edited to stay on the lightweight path instead of immediately paying for explorer or planner again.
- As a maintainer, I want subagent tool activity to be visible through the outer runtime so iteration failures are diagnosable instead of opaque.

## Acceptance Criteria
- [ ] AC-1: Same-session follow-up requests that extend recently bootstrapped or edited files can stay on the lightweight path even when the target is no longer greenfield.
- [ ] AC-2: Coordinator routing considers recent edited files, bootstrap-created files, active-task file paths, prior execution specs, and prior context findings before deciding to spawn explorer or planner.
- [ ] AC-3: `createSubagentLoopOptions()` forwards reporter-compatible tool hooks and Anthropic budget options, not only `client`, `logger`, `maxIterations`, and `signal`.
- [ ] AC-4: When explorer or planner still runs, outer turn reporting or trace metadata shows their tool activity and iteration count instead of only surfacing a final opaque failure.
- [ ] AC-5: Focused tests cover same-session continuation after bootstrap or edit, a genuinely broad existing-target request that still needs explorer or planner, and visible subagent activity.

## Edge Cases
- A same-session follow-up can still be broad enough to need explorer or planner if recent local evidence does not identify the working set.
- A cancelled subagent should surface partial progress and cancellation clearly instead of disappearing.
- Follow-up routing should not pin Shipyard forever to stale recent paths if the operator pivots to a different area of the repo.
- Any new recent-path cache must stay target-relative and safe to serialize in session/runtime state.

## Non-Functional Requirements
- Reliability: routing heuristics should reduce unnecessary escalation without hiding the cases where exploration or planning is genuinely needed.
- Performance: same-session follow-ups should avoid redundant model hops whenever recent local evidence already exists.
- Maintainability: new recent-path evidence should reuse existing runtime/session surfaces instead of introducing a parallel memory layer.
- Observability: subagent activity should be visible through the same run evidence stream operators already trust.

## Out of Scope
- Rewriting explorer or planner prompts from scratch.
- Adding new write-capable subagents.
- A full multi-agent orchestration redesign beyond recent-path reuse and visibility.

## Done Definition
- Same-session follow-ups stay on the lightweight path when recent local evidence already identifies the target files, and any remaining subagent work is visible in the outer run evidence.

## Implementation Evidence

### Code References

- [`../../../../src/engine/graph.ts`](../../../../src/engine/graph.ts):
  converts raw-loop iteration-threshold exits into resumable graph responses,
  carries touched-file evidence out of the acting loop, and preserves the
  lightweight graph path instead of surfacing a hard failure.
- [`../../../../src/engine/turn.ts`](../../../../src/engine/turn.ts) and
  [`../../../../src/artifacts/handoff.ts`](../../../../src/artifacts/handoff.ts):
  persist recent touched files into session state and emitted handoff artifacts
  so the next turn can resume from concrete file evidence instead of starting
  from scratch.
- [`../../../../src/phases/code/prompts.ts`](../../../../src/phases/code/prompts.ts):
  distinguishes between editing existing files and creating brand-new modules,
  which keeps same-session scaffold follow-ups on the lightweight path.
- [`../../../../tests/graph-runtime.test.ts`](../../../../tests/graph-runtime.test.ts)
  and [`../../../../tests/handoff-artifacts.test.ts`](../../../../tests/handoff-artifacts.test.ts):
  cover the resumable iteration-threshold path and touched-file carry-forward.

### Representative Snippets

```ts
if (loopResult.status === "limit_reached") {
  return {
    status: "responding",
    response: loopResult.finalText,
    touchedFiles: loopResult.touchedFiles,
  };
}
```

```ts
touchedFiles: finalState.touchedFiles ?? [],
```

### Notes

- This patch implements the continuation-aware touched-file and resumable
  checkpoint parts of the story.
- Subagent visibility remains follow-up work and did not change in this patch.
