# Performance Optimization Workflow

**Purpose**: Improve latency or throughput using measured, reversible changes.

---

## Phase 0: Story Preflight and Routing

### Step 0.1: Run Preflight Before Baseline Work
- Run `agent-preflight`
- Deliver a concise preflight brief before changes

### Step 0.2: Run Story Lookup Before Baseline Work
- Run `.ai/workflows/story-lookup.md`
- Gather local + external performance best practices relevant to the current path
- Publish the lookup brief before benchmarking/changes

### Step 0.3: Size the Story
- Run `.ai/workflows/story-sizing.md`
- Publish `lane: trivial` or `lane: standard`
- Most performance stories remain `standard`; only truly bounded one-file mechanical changes should take the trivial lane

### Step 0.4: Standard-Lane Lock Only
If `lane: standard`:
- run `.ai/workflows/parallel-flight.md`
- claim the single writer lock via `bash scripts/flight_slot.sh claim ...`

---

## Phase 1: Baseline

### Step 1: Define Metric and Budget
- Choose the target metric
- Set an acceptance threshold aligned with SSOT
- If optimizing an AI path, also define the quality metric that must not regress

### Step 2: Capture Baseline
- Measure before changes with representative workloads
- Record the baseline in `.ai/memory/session/decisions-today.md`

---

## Phase 2: Profile and Hypothesize

### Step 3: Find Bottlenecks
- Profile hotspots
- Confirm whether the bottleneck is CPU, network, I/O, or query strategy

### Step 4: Form an Optimization Hypothesis
- Propose one change with expected impact and risk
- Define the rollback trigger and validation method

---

## Phase 3: Implement Incrementally

### Step 5: Add a Performance Guard Test
- Add a benchmark or smoke test where stable
- Ensure the test is deterministic enough for CI thresholds

### Step 6: Apply One Optimization at a Time
- Keep changes measured and reversible
- Do not mix unrelated cleanup into the optimization story

---

## Phase 4: Validate and Decide

### Step 7: Re-measure and Compare
- Compare post-change metrics to baseline
- Validate no quality regression
- For AI paths, use task-specific evals to verify quality did not regress while performance improved

### Step 8: Keep or Roll Back
- Keep if gains are material and safe
- Roll back if gains are marginal or regressions appear

---

## Phase 5: Completion

### Step 9: Run the Combined Completion Gate
- Run `.ai/workflows/story-handoff.md`
- Include the finalization plan in the same packet as the user audit checklist
- Release the single writer lock if this story claimed it
- Unless the user explicitly asks to pause or use a different merge path, run `.ai/workflows/git-finalization.md` after the completion gate.

---

## Exit Criteria

- Metric target achieved or clearly characterized
- No correctness regression
- Changes documented with before/after numbers
- Combined completion gate delivered with **User Audit Checklist (Run This Now)** and user feedback ingested
- Claimed single writer lock released when standard lane was used
