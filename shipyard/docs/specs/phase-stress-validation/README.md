# Phase Stress Validation: Supplemental Story Pack

- Pack: Stress Validation (Supplemental)
- Estimate: 3-5 hours
- Date: 2026-03-24
- Status: Backlog

## Pack Objectives

1. Prove Shipyard's MVP requirements hold under repeated, messy, real-world usage rather than only narrow happy-path tests.
2. Turn the current scattered smoke coverage into one explicit requirement matrix with clear pass/fail expectations.
3. Catch regressions early in the persistent loop, tool guardrails, UI runtime, context injection, and tracing surfaces.
4. Keep contract tests aligned with the runtime so failures indicate real product regressions, not stale assertions.

## Shared Constraints

- This pack is supplemental and should harden the current MVP, not redefine it.
- The pack should cover the current core requirements only: persistent loop, surgical editing, context injection, browser UI flow, and tracing.
- Stress and smoke coverage should stay deterministic enough for CI where practical, and isolate true soak/manual stress where it would be too slow for every run.
- Validation must cover both terminal mode and `--ui` mode where those requirements apply.
- The suite should exercise both configured runtime paths: graph mode and fallback mode.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| SV-S02 | UI Error-Stream Contract Alignment | Align UI runtime error-stream tests with the authoritative turn reporter contract and remove ordering flake. | Phase Pre-2 implementation |
| SV-S03 | Persistent Loop Test Flakiness Hardening | Make the persistent-loop integration test resilient to load and timing variance. | Phase 1 implementation |
| SV-S01 | MVP Stress and Smoke Matrix | Build one requirement-driven stress and smoke suite for the persistent loop, tools, context/runtime behavior, UI flow, and tracing evidence. | SV-S02, SV-S03 |

## Sequencing Rationale

- `SV-S02` and `SV-S03` land first so the matrix suite is built on stable, contract-accurate signals rather than flaky tests.
- `SV-S01` is then valuable because it can rely on those stable building blocks instead of rediscovering them.

## Whole-Pack Success Signal

- Every core MVP requirement is mapped to at least one automated smoke test and one deeper stress or failure-mode check.
- A contributor can answer "does Shipyard really behave under repeated use?" by reading one story and running one validation suite.
- Regressions in the persistent loop, surgical edits, browser workflow, and trace generation are caught before demo-time surprises.
