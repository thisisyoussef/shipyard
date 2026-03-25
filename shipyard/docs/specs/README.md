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

- [`phase-pre-2/README.md`](./phase-pre-2/README.md): introduces the browser runtime before Phase 2 finishes
- [`phase-2/README.md`](./phase-2/README.md): tool registry, file I/O, edit guardrails, and discovery smoke coverage
- [`phase-3/README.md`](./phase-3/README.md): Anthropic client contract and raw tool loop work
- [`phase-4/README.md`](./phase-4/README.md): graph runtime, checkpoints, context wiring, and LangSmith MVP verification
- [`phase-5/README.md`](./phase-5/README.md): local preview autorun and refresh behavior for previewable targets
- [`phase-6/README.md`](./phase-6/README.md): subagents for exploration, verification, and coordinator routing
- [`phase-7/README.md`](./phase-7/README.md): planner artifacts, richer evaluation, browser QA, and long-run handoff routing
- [`phase-8/README.md`](./phase-8/README.md): spec-driven operator planning, next-task execution, and shared greenfield bootstrap presets
- [`phase-9/README.md`](./phase-9/README.md): hosted Railway runtime, lightweight access control, browser file intake, and Vercel deploy flow for public Shipyard demos
- [`phase-stress-validation/README.md`](./phase-stress-validation/README.md): stress matrix, UI error-stream alignment, and loop flakiness hardening
- [`phase-ui-revamp/README.md`](./phase-ui-revamp/README.md): visual system, activity/diff polish, and session UX refinements

## Reading Order

1. Read the phase README for pack-level intent and constraints.
2. Read the specific story folder for the implementation contract.
3. Cross-reference the durable docs if you need current runtime structure or
   directory ownership.
