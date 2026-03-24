# Flight Lock Workflow (Single Writer Lock)

**Purpose**: Protect standard-lane implementation work with one lightweight single writer lock until real multi-agent contention exists.

---

## Default Behavior

- This workspace currently uses one active flight lock at a time.
- Trivial-lane stories skip this workflow completely.
- The old board-based parallel state machine is retired until the repo actually needs concurrent flight coordination again.

---

## When To Run

Run this before implementation work starts for a standard-lane flight:
- story implementation
- architecture/doc flights
- deployment/ops flights

Skip it for:
- trivial-lane stories
- read-only exploration
- user-correction patches that stay in the trivial lane

---

## Step 1: Initialize or Inspect the Lock

```bash
bash scripts/flight_slot.sh init
bash scripts/flight_slot.sh status
```

Active lock file:
- `.ai/state/flight-lock.json`

Legacy migration source:
- `.ai/state/flight-board.json`
- Used only so older active/history state can be migrated into the single-lock flow once.

---

## Step 2: Stay in Single-Lock Mode

```bash
bash scripts/flight_slot.sh mode single
```

If someone tries `mode parallel`, the script should fail and tell them the parallel board has been retired until real contention returns.

---

## Step 3: Claim the Lock

Claim before editing files:

```bash
bash scripts/flight_slot.sh claim \
  --flight-id flight-us-p1-002 \
  --slot code \
  --owner codex \
  --paths "api/src,web/src,shared/src" \
  --story US-P1-002 \
  --branch codex/flight-us-p1-002
```

Slot guidance:
- `code`: feature/bug code changes
- `docs`: docs-only changes
- `infra`: config/deployment infrastructure changes
- `deploy`: release/deploy flight
- `ai_arch`: `.ai`/orchestration contract changes

Lock guidance:
- Keep the lock scope small even though only one writer lock exists.
- If claim fails, finish or release the active flight instead of routing around it with a second concurrent lane.

---

## Step 4: Run the Normal Workflow

After claim succeeds, run the normal process as usual:
1. `agent-preflight`
2. `.ai/workflows/story-lookup.md`
3. `.ai/workflows/story-sizing.md`
4. task workflow (`feature`, `bug`, `performance`, `security`, `deployment`)
5. `.ai/workflows/story-handoff.md`

Git finalization is still mandatory via `.ai/workflows/git-finalization.md`.

---

## Step 5: Release the Lock

When the flight is complete, paused, or cancelled, release the lock:

```bash
bash scripts/flight_slot.sh release \
  --flight-id flight-us-p1-002 \
  --status completed \
  --summary "US-P1-002 completion gate delivered"
```

Status choices:
- `completed`
- `blocked`
- `cancelled`

---

## Step 6: Optional Reset

```bash
bash scripts/flight_slot.sh reset --confirm
```

Use reset only when intentionally clearing the active lock after confirming no real story is still using it.

---

## Exit Criteria

- Single writer lock claimed before standard-lane edits
- Standard story workflow completed
- Combined completion gate delivered
- Flight lock released with final status
