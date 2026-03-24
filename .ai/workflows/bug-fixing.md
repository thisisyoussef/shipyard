# Bug Fixing Workflow

**Purpose**: Reproduce, isolate, fix, and verify bugs with TDD discipline.

---

## Phase 0: Story Preflight and Routing

### Step 0.1: Run Preflight Before Reproduction
- Run `agent-preflight`
- Deliver a concise preflight brief before test/code edits

### Step 0.2: Run Story Lookup Before Reproduction
- Run `.ai/workflows/story-lookup.md`
- Gather local + external bug-domain guidance
- Publish the lookup brief before writing reproduction tests

### Step 0.3: Size the Story
- Run `.ai/workflows/story-sizing.md`
- Publish `lane: trivial` or `lane: standard`
- Trivial bug stories skip the flight lock and go straight to focused reproduction/fix work

### Step 0.4: Standard-Lane Lock Only
If `lane: standard`:
- run `.ai/workflows/parallel-flight.md`
- claim the single writer lock via `bash scripts/flight_slot.sh claim ...`

---

## Phase 1: Reproduce

### Step 1: Capture Bug Contract
- Define expected vs actual behavior
- Capture reproduction inputs and environment
- Record stack traces and logs in `.ai/memory/session/blockers.md` if needed
- If the bug affects AI behavior, add the failure example to the eval regression set or planned eval brief

### Step 2: Write a Failing Reproduction Test
- Add a test that fails for the current bug
- Prefer the lowest level that reproduces reliably
- Confirm the test fails for the right reason

---

## Phase 2: Diagnose

### Step 3: Identify Root Cause
- Trace call flow and state transitions
- Confirm assumptions with logs/fixtures
- Avoid speculative fixes without evidence

### Step 4: Expand Safety Tests
- Add edge-case tests adjacent to the reproduction
- Add regression tests for similar code paths
- For AI bugs, add regression eval cases covering the original failure mode plus adjacent edge/adversarial variants

---

## Phase 3: Fix

### Step 5: Minimal Corrective Change
- Run `.ai/workflows/tdd-pipeline.md` to keep test authoring, implementation, and refactor review isolated
- Implement the smallest change that makes the reproduction pass
- Keep interfaces stable unless the bug requires a contract change

### Step 6: Refactor if Needed
- Clean up complexity introduced by the fix
- Keep tests green during each small refactor

---

## Phase 4: Verify

### Step 7: Run Validation Gates
- Run the project-specific validation commands required by the active workflow

### Step 8: Document and Log
- Add a concise bug summary in session decisions
- Log an anti-pattern if the bug exposed one
- Update SSOT if milestone-impacting

---

## Phase 5: Completion

### Step 9: Run the Combined Completion Gate
- Run `.ai/workflows/story-handoff.md`
- Include the finalization plan in the same packet as the user audit checklist
- Release the single writer lock if this story claimed it
- After user approval, run `.ai/workflows/git-finalization.md`

---

## Exit Criteria
- Reproduction test added and passing
- Related regressions covered
- Quality gates pass
- Documentation updated
- Combined completion gate delivered with **User Audit Checklist (Run This Now)** and user feedback ingested
- Claimed single writer lock released when standard lane was used
