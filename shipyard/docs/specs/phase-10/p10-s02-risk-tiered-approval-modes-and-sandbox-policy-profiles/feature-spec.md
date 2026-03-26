# Feature Spec

## Metadata
- Story ID: P10-S02
- Story Title: Risk-Tiered Approval Modes and Sandbox Policy Profiles
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard's tool surface is now powerful enough to edit files, run shell
commands, bootstrap targets, and deploy projects, but the shipped runtime still
defaults both phases to `approvalRequired: false`. That keeps local iteration
fast, yet it leaves too much policy hidden in prompts and too little runtime
evidence around risky actions. Shipyard now needs explicit approval modes,
sandbox profiles, and auditable risk decisions so the operator can trade speed
for safety intentionally rather than implicitly.

## Story Pack Objectives
- Objective 1: Make risky tool execution policy-driven and visible.
- Objective 2: Let approvals pause and later resume the runtime without losing
  execution context.
- Objective 3: Establish credential, filesystem, network, and deploy controls
  that later background-task and hosted stories can reuse.
- How this story contributes to the overall objective set: it gives the pack a
  trustworthy control plane around the now-durable runtime.

## User Stories
- As an operator, I want Shipyard to ask before dangerous actions instead of
  relying on hidden prompt conventions.
- As a reviewer, I want to see why a command or deploy step was allowed,
  blocked, or escalated.
- As a runtime owner, I want local and hosted execution profiles that can use
  different sandbox or credential rules without changing prompts.

## Acceptance Criteria
- [ ] AC-1: Tool and command execution is classified into explicit risk tiers
  with a typed policy decision artifact.
- [ ] AC-2: Shipyard exposes named approval modes and sandbox profiles in CLI
  and browser surfaces.
- [ ] AC-3: Risky actions can pause the durable thread for explicit approval and
  later resume with an audit trail.
- [ ] AC-4: Sandbox profiles can scope filesystem, network, and environment
  access for command-backed or deploy-backed work where supported.
- [ ] AC-5: Secrets and provider tokens are redacted from traces, approval
  prompts, and durable policy artifacts.
- [ ] AC-6: A clearly labeled permissive developer profile can preserve today's
  local ergonomics without masquerading as the safe default.

## Edge Cases
- Empty/null inputs: commands with no executable payload fail closed and produce
  a policy rejection reason.
- Boundary values: low-risk read-only tool calls should not trigger approval
  spam.
- Invalid/malformed data: malformed policy config falls back to the safest
  supported profile rather than silently widening access.
- External-service failures: unavailable sandbox backends or denied provider
  permissions fail clearly and do not auto-upgrade into permissive execution.

## Non-Functional Requirements
- Security: credentials stay out of approval logs and durable artifacts, and
  risky actions require explicit policy rationale.
- Performance: approval and policy checks must be cheap enough to run on every
  tool decision.
- Observability: traces should show which policy profile, risk tier, and
  approval path were used for each gated action.
- Reliability: approvals must compose cleanly with interruptions, resumes, and
  background tasks.

## UI Requirements (if applicable)
- Required states: pending approval, denied action, approved action, blocked by
  sandbox profile, and policy-warning banner.
- Accessibility contract: approval prompts must be keyboard reachable, screen
  reader friendly, and preserve enough context to make a trustworthy decision.

## Out of Scope
- Organization-wide RBAC or SSO.
- Full remote-container orchestration for every target.
- Billing or quota enforcement.

## Done Definition
- Shipyard can classify risky work, pause for approval, enforce named sandbox
  profiles, and explain those decisions in runtime evidence.
