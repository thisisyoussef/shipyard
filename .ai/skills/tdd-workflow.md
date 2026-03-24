# TDD Workflow (Three-Agent Pipeline)

## Purpose
Enforce test-first delivery for every behavior change in this workspace by isolating test design, implementation, and refactor review into separate agent stages.

## Non-Negotiables
- No implementation without a failing test first.
- Every bug fix starts with a reproducing test.
- Agent 1 writes the contract without implementation context.
- Agent 2 does not modify Agent 1 tests.
- Agent 3 refactors only while keeping tests green.
- Use `.ai/workflows/tdd-pipeline.md` plus `bash scripts/tdd_handoff.sh ...` as the canonical pipeline.

## Pipeline

### 1) Initialize
- Create `.ai/state/tdd-handoff/<story-id>/` with `bash scripts/tdd_handoff.sh init --story <story-id> --spec <spec-path>`.
- Treat files on disk as the only handoff boundary between stages.

### 2) Agent 1 - RED Contract
- Use `.ai/agents/tdd-spec-interpreter.md`.
- Write adversarial example tests and, when applicable, separate `*.property.test.ts` files.
- Run `bash scripts/tdd_handoff.sh check --story <story-id> --stage agent1 --expect red -- <focused-test-command>`.
- If the suite is already green, stop and escalate because the contract is weak or the feature already exists.

### 3) Agent 2 - GREEN Implementation
- Use `.ai/agents/tdd-implementer.md`.
- Implement the minimum code needed to satisfy Agent 1's fixed tests.
- Record objections in `agent2-escalations/` instead of editing tests.
- Enforce the 3 implementation attempts limit.
- Run `bash scripts/tdd_handoff.sh check --story <story-id> --stage agent2 --expect green -- <focused-test-command>`.

### 4) Property-Test Pass
- For data transforms, CRUD behavior, sorting/filtering, or state transitions, run Agent 1 property tests after example tests are green.
- Use `fast-check` with bounded dev runs and capture counterexamples in escalation output when needed.

### 5) Mutation Gate
- Run `bash scripts/run_targeted_mutation.sh --base <ref>` on changed story files.
- If mutation score is below 70%, send surviving mutants back for additional test coverage.
- After 2 mutation feedback rounds, continue only with an explicit warning in the quality report.

### 6) Agent 3 - Review and Refactor
- Use `.ai/agents/tdd-reviewer.md`.
- Review code plus results, then refactor only while keeping the suite green.
- Enforce the 2 failed refactor attempts limit.
- Finish with `bash scripts/tdd_handoff.sh check --story <story-id> --stage agent3 --expect green -- <focused-test-command>`.

## Completion Criteria
- New behavior is specified by Agent 1 tests, not implementation-aware assumptions.
- RED and GREEN checkpoints are recorded in `.ai/state/tdd-handoff/<story-id>/`.
- Property and mutation gates run when the story qualifies, or are explicitly skipped/blocked.
- All relevant suites pass after Agent 3 review.
