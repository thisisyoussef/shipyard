# Phase 6: Subagents Story Pack

- Pack: Phase 6 Subagents
- Estimate: 3-4 hours
- Date: 2026-03-24
- Status: In progress

## Pack Objectives

1. Split information-gathering and verification into focused subagents so the coordinator stays narrow and readable.
2. Make explorer and verifier behavior explicit, isolated, and independently testable.
3. Update coordinator routing so it knows when to ask for discovery and when to delegate verification.

## Shared Constraints

- The subagents do not share the coordinator's conversation history.
- The explorer is read-only and can only inspect files.
- The verifier is command-only and can only run checks.
- The coordinator remains the only component that decides how to combine reports and proceed.
- Structured reports are the contract: `ContextReport` for exploration, `VerificationReport` for verification.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P6-S01 | Explorer Subagent | Build an isolated read-only subagent that searches a codebase and returns structured findings. | Phase 3 implementation, Phase 4 implementation |
| P6-S02 | Verifier Subagent | Build an isolated verification subagent that runs commands and returns structured verification reports. | Phase 3 implementation, Phase 4 implementation |
| P6-S03 | Coordinator Integration | Update coordinator heuristics so it spawns explorer and verifier at the right times and merges their outputs safely. | P6-S01, P6-S02 |

## Sequencing Rationale

- `P6-S01` lands first because the coordinator needs a reliable discovery source before it can route broadly scoped instructions.
- `P6-S02` lands next because verification should be a separate, structured step rather than ad hoc test execution inside the coordinator.
- `P6-S03` comes last because the coordinator should only integrate the subagents after both contracts are proven in isolation.

## Whole-Pack Success Signal

- The explorer can answer codebase questions without writing any files or inheriting coordinator history.
- The verifier can report pass/fail cleanly without dumping raw command noise into the coordinator context.
- The coordinator knows when to ask for exploration, when to delegate verification, and how to prioritize verification evidence over guesses.
