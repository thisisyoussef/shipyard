# Security Review Workflow

**Purpose**: Perform repeatable security review before release and after sensitive changes.

---

## Phase 0: Story Preflight and Routing

### Step 0.1: Run Preflight Before Security Review
- Run `agent-preflight`
- Deliver a concise preflight brief before review/fixes

### Step 0.2: Run Story Lookup Before Security Review
- Run `.ai/workflows/story-lookup.md`
- Gather local + external security best practices
- Publish the lookup brief before audit/fixes

### Step 0.3: Size the Story
- Run `.ai/workflows/story-sizing.md`
- Publish `lane: trivial` or `lane: standard`
- Most security reviews remain `standard`; only bounded one-file mechanical corrections should take the trivial lane

### Step 0.4: Standard-Lane Lock Only
If `lane: standard`:
- run `.ai/workflows/parallel-flight.md`
- claim the single writer lock via `bash scripts/flight_slot.sh claim ...`

---

## Phase 1: Scope

### Step 1: Identify Attack Surface
- External inputs
- Secrets and credentials handling
- Data stores and external provider calls
- Deployment/runtime configuration

### Step 2: Classify Data Sensitivity
- Code artifacts
- Query payloads
- Logs/traces
- User-linked metadata

---

## Phase 2: Review

### Step 3: Run Automated Checks
- Run the project-specific security and dependency checks required by the active workflow

### Step 4: Manual Checklist Pass
- Input validation present and bounded
- Error paths sanitized
- No secret leakage in logs/errors
- File/path handling safe
- Retries/timeouts/circuit-breaking configured for external calls

---

## Phase 3: Abuse Testing

### Step 5: Negative Tests
- Oversized payloads
- Malformed requests
- Path traversal attempts
- Rate-limit and timeout handling
- For AI surfaces, include jailbreak/conflicting-instruction/adversarial formatting cases

### Step 6: Dependency and Config Review
- Env-only secret loading
- Least privilege credentials
- Deployment env parity verified

---

## Phase 4: Remediation

### Step 7: Fix Findings by Severity
- Critical or High before release
- Medium with tracked debt if justified
- Low documented with rationale

### Step 8: Document Outcome
- Add the review summary to `.ai/memory/session/decisions-today.md`
- Log durable decisions in `.ai/memory/project/architecture.md`
- Update SSOT if release status changes

---

## Phase 5: Completion

### Step 9: Run the Combined Completion Gate
- Run `.ai/workflows/story-handoff.md`
- Include the finalization plan in the same packet as the user audit checklist
- Release the single writer lock if this story claimed it
- After user approval, run `.ai/workflows/git-finalization.md`

---

## Exit Criteria

- No unresolved critical or high issues
- Security checklist complete
- Evidence recorded for auditability
- Combined completion gate delivered with **User Audit Checklist (Run This Now)** and user feedback ingested
- Claimed single writer lock released when standard lane was used
