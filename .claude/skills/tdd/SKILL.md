---
name: tdd
description: Run TDD workflow for Shipyard — RED/GREEN/REFACTOR cycle with evidence. Use when implementing behavior changes.
---

# TDD Workflow

Execute the Shipyard TDD pipeline following `.ai/workflows/tdd-pipeline.md`.

## RED Phase (Test Author)

1. Read acceptance criteria and the technical plan
2. Write failing tests that capture the expected behavior
3. Run tests to confirm they fail for the right reason:
   ```bash
   pnpm --dir shipyard test
   ```
4. Record the RED checkpoint (which tests fail and why)

## GREEN Phase (Implementer)

1. Write the minimum implementation to pass the RED tests
2. Run tests to confirm they pass:
   ```bash
   pnpm --dir shipyard test
   ```
3. Add property tests for edge cases where appropriate
4. Run typecheck to ensure type safety:
   ```bash
   pnpm --dir shipyard typecheck
   ```
5. Record the GREEN checkpoint

## REFACTOR Phase (Reviewer)

1. Clean up implementation without changing behavior
2. Check for:
   - Code duplication
   - Naming clarity
   - Unnecessary complexity
   - Missing error handling at system boundaries
3. Run full validation:
   ```bash
   pnpm --dir shipyard test
   pnpm --dir shipyard typecheck
   pnpm --dir shipyard build
   ```
4. Record refactor notes and any follow-up items

## Evidence

Produce a TDD evidence summary:
- Tests written (count and description)
- RED checkpoint (which failed, why)
- GREEN checkpoint (all passing)
- Property tests added (if any)
- Refactor changes made
- Final validation result
