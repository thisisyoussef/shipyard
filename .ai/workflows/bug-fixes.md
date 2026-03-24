# Bug Fixes Workflow

**Purpose**: Manage and resolve a bounded batch of bugs without drifting into feature development, roadmap work, or broad refactors.

---

## Operating Principle

This workflow is intentionally insulated from main development.

- Treat the batch as corrective work only.
- Keep the harness generic; keep product fixes in `shipyard/`.
- Track bugs in one session-scoped ledger so the batch stays explicit and reviewable.
- Fix one bug at a time with reproduction, diagnosis, minimal change, and verification before moving on.
- If a bug turns into a feature, migration, or architecture redesign, stop and re-route to the appropriate workflow instead of stretching this one.

Primary tracking file:
- `.ai/memory/session/bug-fix-batch.md`

---

## Phase 0: Intake and Isolation

### Step 0.1: Run Preflight, Lookup, and Sizing
- Run `agent-preflight`
- Run `.ai/workflows/story-lookup.md`
- Run `.ai/workflows/story-sizing.md`
- Default to `lane: standard` when:
  - the batch contains more than one bug,
  - `.ai/` workflow files change,
  - public/runtime behavior changes,
  - new regression coverage spans multiple files

### Step 0.2: Create or Refresh the Batch Ledger
- Create or update `.ai/memory/session/bug-fix-batch.md`
- Record each bug with:
  - bug id
  - symptom
  - evidence source
  - expected behavior
  - current status
  - intended regression coverage
  - touched files

### Step 0.3: Freeze Scope
- Only fix bugs listed in the active batch ledger
- New discoveries become:
  - a separate follow-up bug, or
  - an explicit batch expansion note
- Do not silently add feature polish, backlog cleanup, or unrelated refactors

---

## Phase 1: Reproduce Per Bug

### Step 1: Write the Reproduction Contract
- Capture expected vs actual behavior for one bug at a time
- Prefer the narrowest reliable test surface
- If a test is not practical, record the exact manual reproduction in the batch ledger

### Step 2: Prove RED
- Add or tighten a failing regression before implementation
- If helper scripts from imported workflows are absent in this repo, run the equivalent manual RED check directly
- Do not implement until the reproduction fails for the right reason

---

## Phase 2: Diagnose Per Bug

### Step 3: Confirm Root Cause
- Trace the exact call flow and state transitions
- Reuse existing runtime, event, and persistence patterns from the repo
- Avoid speculative fixes without file evidence

### Step 4: Define the Surgical Boundary
- Name the smallest file/module set that can safely fix the bug
- Record that boundary in the batch ledger before editing if the scope is non-obvious

---

## Phase 3: Fix Per Bug

### Step 5: Apply the Smallest Corrective Change
- Keep interfaces stable unless the bug itself is the contract defect
- Prefer shared contract alignment over one-off UI masking when the underlying runtime is wrong

### Step 6: Verify Before Advancing
- Re-run the focused regression for the bug you just fixed
- Only then move to the next bug in the batch
- If two bugs share one root cause, note the linkage explicitly in the ledger

---

## Phase 4: Batch Verification

### Step 7: Run Validation Gates
- Run the project validation commands required by `AGENTS.md`
- Run any additional focused regression commands for the changed bug surfaces

### Step 8: Run Visible Smoke Checks When Needed
- For bugs with a visible local UI surface, do a browser smoke test against the exact changed flow
- Do not treat code review alone as sufficient visible verification

---

## Phase 5: Document and Complete

### Step 9: Close the Batch Ledger
- Mark each bug as fixed, deferred, or blocked
- Record the verification evidence for each entry
- Add concise notes to `.ai/memory/session/decisions-today.md`
- Add a project anti-pattern only when the lesson is durable beyond the current batch

### Step 10: Completion Gate
- Run `.ai/workflows/story-handoff.md`
- If `.ai/` changed, follow `.ai/workflows/ai-architecture-change.md` manually when repo helper scripts are absent
- Unless the user explicitly pauses finalization, continue into `.ai/workflows/git-finalization.md`

---

## Exit Criteria

- Active bug batch is recorded in `.ai/memory/session/bug-fix-batch.md`
- Every fixed bug has reproduction evidence and verification evidence
- Scope stayed corrective and surgical
- Required validation commands passed
- Docs and session notes reflect the completed batch
