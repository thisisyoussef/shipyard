# TDD Pipeline Workflow

**Purpose**: Replace single-agent red-green-refactor with an isolated three-agent TDD pipeline that uses files on disk as the handoff boundary.

---

## When To Run

Run this workflow for implementation stories that add or change tests and production code:
- feature stories,
- bug fixes after the reproduction contract exists,
- architecture refactors that change behavior.

Skip only for read-only discovery or documentation-only stories.

---

## Step 1: Initialize Handoff Storage

Before Agent 1 writes anything, create the story handoff structure:

```bash
bash scripts/tdd_handoff.sh init --story <story-id> --spec <spec-path>
```

Reference layout:
- `.ai/state/tdd-handoff/README.md`

---

## Step 2: Agent 1 - Spec Interpreter / Test Author

Use:
- `.ai/agents/tdd-spec-interpreter.md`

Allowed context:
- story spec / acceptance criteria,
- public API surface only,
- existing tests for conventions.

Forbidden context:
- implementation files,
- implementation plan/history,
- internal module layout beyond public interfaces.

Required outputs:
- example-based tests in the story scope,
- adversarial edge cases,
- when applicable, separate `*.property.test.ts` files for property-based coverage,
- `agent1-meta.json` updated through `scripts/tdd_handoff.sh`.

Agent 1 must write tests that catch a bad implementation, not merely confirm the intended good one.

---

## Step 3: RED Guard

Run the focused example-test command and require it to fail before Agent 2 starts:

```bash
bash scripts/tdd_handoff.sh check --story <story-id> --stage agent1 --expect red -- <focused-test-command>
```

If tests pass immediately:
- stop,
- record the unexpected green result,
- escalate because the feature may already exist or the tests are too weak.

Do not start implementation until RED is real.

---

## Step 4: Agent 2 - Implementer

Use:
- `.ai/agents/tdd-implementer.md`

Allowed context:
- Agent 1 test files from disk,
- full repo codebase,
- story spec,
- **design brief** from `.ai/state/design-brief/<story-id>/brief.md` (when it exists).

For UI implementation stories, Agent 2 should read the design brief first, then apply the **UI Skill Chain Phase 2** (Build & Refine) from `.ai/codex.md`:
- `typeset` — typography hierarchy and font loading
- `colorize` — strategic color introduction
- `arrange` — layout, spacing, visual rhythm
- `animate` — entrance, micro-interactions, state transitions
- `bolder` — amplify visual impact when design feels safe/generic

If you want a scripted delegate for this phase instead of manual execution, run:

```bash
node scripts/run-ui-phase-bridge.mjs --phase ui --story <story-id>
```

These skills guide implementation decisions, not spec decisions. Use them to make concrete CSS/component choices that match the design direction established in Phase 1 during spec-driven-delivery.

Forbidden behavior:
- modifying Agent 1 test files,
- silently weakening the contract.

If Agent 2 believes a test is wrong:
- write an escalation note in `.ai/state/tdd-handoff/<story-id>/agent2-escalations/`,
- stop for review instead of editing the test.

Loop limit:
- maximum 3 implementation attempts before escalation.

After each attempt, require example tests to go green:

```bash
bash scripts/tdd_handoff.sh check --story <story-id> --stage agent2 --expect green -- <focused-test-command>
```

---

## Step 5: Conditional Property-Test Pass

When the story touches data transformation, CRUD behavior, sorting/filtering, or state transitions:
- Agent 1 should also provide property tests with `fast-check`,
- keep them in separate `*.property.test.ts` files,
- run them after example tests are green,
- capture any counterexample in Agent 2 escalation output when implementation cannot satisfy the property quickly.

Keep dev runs bounded (for example 100 runs) and reserve heavier settings for CI.

---

## Step 6: Conditional Mutation Gate

After Agent 2 reaches green, run targeted mutation testing on changed files:

```bash
bash scripts/run_targeted_mutation.sh --base HEAD~1
```

Rules:
- if mutation score is at least 70%, continue,
- if mutation score is below 70%, send surviving mutants back to Agent 1 for additional tests,
- re-run the green check and mutation check,
- after 2 mutation feedback rounds, continue only with an explicit quality warning in `agent3-quality.json`.

Mutation scope must stay limited to story-touched files.

---

## Step 7: Agent 3 - Reviewer / Refactorer

Use:
- `.ai/agents/tdd-reviewer.md`

Allowed context:
- full repo including Agent 1 tests and Agent 2 implementation,
- test results,
- coverage and mutation output,
- story spec.

For UI implementation stories, Agent 3 should apply the **UI Skill Chain Phase 3** (Quality Gate) from `.ai/codex.md`:
- `critique` — structured design evaluation
- `audit` — accessibility, performance, theming, responsive audit
- `fixing-accessibility` — WCAG compliance fixes
- `fixing-motion-performance` — animation perf fixes

If you want a scripted delegate for this phase instead of manual execution, run:

```bash
node scripts/run-ui-phase-bridge.mjs --phase qa --story <story-id>
```

These skills guide the refactor pass: Agent 3 uses critique/audit output to identify quality gaps, then fixes them while keeping tests green.

Forbidden context:
- Agent 2 debugging history or false starts.

Required outputs:
- refactored implementation when warranted,
- missing-test recommendations,
- `agent3-quality.json` with coverage/mutation/code-smell notes,
- for UI stories: critique/audit skill output summary.

Loop limit:
- maximum 2 failed refactor attempts before escalation.

Agent 3 must leave the suite green:

```bash
bash scripts/tdd_handoff.sh check --story <story-id> --stage agent3 --expect green -- <focused-test-command>
```

---

## Step 8: Handoff Requirements

Before broader validation gates:
- handoff directory exists,
- Agent 1/2/3 metadata is present,
- any escalations are explicit on disk,
- loop-limit breaches are surfaced to the user instead of silently iterating.

Then continue with:
- repo validation commands,
- `.ai/workflows/story-handoff.md`,
- `.ai/workflows/git-finalization.md`.

---

## Exit Criteria

- Three-agent TDD flow used instead of single-agent black-box TDD
- RED and GREEN guards recorded on disk
- Agent 2 did not modify Agent 1 tests
- Property tests generated when story shape qualifies
- Mutation gate run or explicitly recorded as skipped/blocked
- Loop limits enforced with escalation instead of unbounded retries
