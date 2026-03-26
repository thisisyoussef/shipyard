# Technical Plan

## Metadata
- Story ID: P10-S02
- Story Title: Risk-Tiered Approval Modes and Sandbox Policy Profiles
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/phases/code/index.ts`
  - `shipyard/src/phases/target-manager/index.ts`
  - `shipyard/src/tools/registry.ts`
  - `shipyard/src/tools/run-command.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - new policy helpers under `shipyard/src/policy/`
- Public interfaces/contracts:
  - `PolicyDecision`
  - `RiskTier`
  - `ApprovalRequest`
  - `ApprovalMode`
  - `SandboxProfile`
- Data flow summary: every tool request is classified, policy yields allow,
  deny, or require-approval, approval requests become durable thread
  checkpoints, and execution proceeds only after the decision is resolved.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: approval and sandbox stories follow the durable
  thread work because paused runs need a safe place to resume.
- Gaps/overlap check: this story governs tool safety only. It does not yet
  decide when planner, verifier, or helper roles should run.
- Whole-pack success signal: later routing, task-board, and readiness stories
  can reason about risk as a first-class runtime signal instead of hidden
  prompt behavior.

## Architecture Decisions
- Decision: move policy out of prompt prose and into typed runtime decisions
  enforced before the tool call executes.
- Alternatives considered:
  - rely on model instructions only
  - require approval for every tool call
- Rationale: prompt-only policy is too brittle, while blanket approval creates
  fatigue. Risk-tiered decisions preserve trust without drowning the operator.

## Data Model / API Contracts
- Request shape:
  - tool invocation plus target, phase, profile, and command metadata
- Response shape:
  - explicit allow, deny, or require-approval decision with rationale and
    redaction-safe context
- Storage/index changes:
  - durable approval records under thread state
  - optional target-local policy config under `.shipyard/` or repo settings

## Dependency Plan
- Existing dependencies used: tool registry, durable thread model, UI event
  bridge, deploy tool, `run_command` execution path.
- New dependencies proposed (if any): none required for the first pass; sandbox
  adapters should be pluggable.
- Risk and mitigation:
  - Risk: approval prompts become noisy or are bypassed in practice.
  - Mitigation: classify read-only work as low risk, make permissive mode
    explicit, and add audit traces to see where friction is too high.

## Test Strategy
- Unit tests:
  - risk-tier classification
  - policy profile loading
  - redaction of secrets from policy artifacts
- Integration tests:
  - paused approval then resume
  - denied command or deploy action
  - permissive-profile fallback for local developer mode
- E2E or smoke tests:
  - browser workbench approval prompt and CLI approval flow
- Edge-case coverage mapping:
  - malformed policy file
  - unsupported sandbox backend
  - deploy command with missing credential
  - repeated approval on resumed task

## Rollout and Risk Mitigation
- Rollback strategy: keep a clearly labeled permissive profile available while
  the safer defaults are tuned.
- Feature flags/toggles: gate new sandbox enforcement independently from risk
  classification so policy visibility can land before strict blocking.
- Observability checks: log risk tier, policy profile, approval latency, deny
  reasons, and redaction outcomes.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
