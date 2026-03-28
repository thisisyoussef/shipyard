# Spec Packs

The `docs/specs/` tree holds phase-oriented story packs. Each phase README
explains the goal of the pack, its sequencing, and the stories it contains.
Story folders typically include:

- `feature-spec.md`
- `technical-plan.md`
- `task-breakdown.md`
- `constitution-check.md`

Use these packs for implementation history and planned work. Use
[`../README.md`](../README.md) and [`../architecture/README.md`](../architecture/README.md)
for durable onboarding and architecture reference.

## Indexed Phase Packs

- [`phase-provider-agnostic-runtime/README.md`](./phase-provider-agnostic-runtime/README.md): provider-neutral model adapters, configurable provider/model routing, and OpenAI Responses integration
- [`phase-pre-2/README.md`](./phase-pre-2/README.md): introduces the browser runtime before Phase 2 finishes
- [`phase-2/README.md`](./phase-2/README.md): tool registry, file I/O, edit guardrails, and discovery smoke coverage
- [`phase-3/README.md`](./phase-3/README.md): Anthropic client contract and raw tool loop work
- [`phase-4/README.md`](./phase-4/README.md): graph runtime, checkpoints, context wiring, and LangSmith MVP verification
- [`phase-5/README.md`](./phase-5/README.md): local preview autorun and refresh behavior for previewable targets
- [`phase-6/README.md`](./phase-6/README.md): subagents for exploration, verification, and coordinator routing
- [`phase-7/README.md`](./phase-7/README.md): planner artifacts, richer evaluation, browser QA, and long-run handoff routing
- [`phase-8/README.md`](./phase-8/README.md): spec-driven operator planning, next-task execution, and shared greenfield bootstrap presets
- [`phase-9/README.md`](./phase-9/README.md): hosted Railway runtime, lightweight access control, browser file intake, and Vercel deploy flow for public Shipyard demos
- [`phase-10/README.md`](./phase-10/README.md): durable execution threads, policy controls, layered memory, repo indexing, background tasking, and readiness/governance workflow
- [`phase-11/README.md`](./phase-11/README.md): runtime-native artifact flow, approvals, skills, PM planning, GitHub-first source control, Railway-hosted execution, TDD lanes, coordination contracts, and master-coordinator groundwork
- [`phase-runtime-hardening/README.md`](./phase-runtime-hardening/README.md): long-loop context compaction, Anthropic budget recovery, continuation-aware routing, bootstrap guardrails, and long-run graph smoke coverage
- [`phase-runtime-hardening-follow-up/README.md`](./phase-runtime-hardening-follow-up/README.md): history-safe tool-turn storage, write-aware compaction, continuation-first handoffs, bootstrap-ready discovery, and task-aware replay budgets
- [`phase-stress-validation/README.md`](./phase-stress-validation/README.md): stress matrix, UI error-stream alignment, and loop flakiness hardening
- [`phase-ui-integration/README.md`](./phase-ui-integration/README.md): shared app spine, dashboard/editor/board runtime wiring, ultimate control plane, safe code browsing, and release-quality UX resilience
- [`phase-ui-revamp/README.md`](./phase-ui-revamp/README.md): visual system, activity/diff polish, and session UX refinements

## Reading Order

1. Read the phase README for pack-level intent and constraints.
2. Read the specific story folder for the implementation contract.
3. Cross-reference the durable docs if you need current runtime structure or
   directory ownership.
