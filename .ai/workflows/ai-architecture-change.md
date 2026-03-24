# AI Architecture Change Workflow

**Purpose**: Validate agent-orchestration wiring only when AI-architecture files change.

---

## When To Run

Run this workflow only when the story/task changes any of:
- `.ai/**`
- `AGENTS.md`
- `.clauderc`
- `.cursorrules`
- `.husky/pre-commit`
- `scripts/check_ai_wiring.sh`
- `scripts/git_finalize_guard.sh`
- `scripts/flight_slot.sh`
- `scripts/ai_arch_changed.sh`
- `scripts/triage_counter.sh`
- `scripts/verify_agent_contract.py`

If none of these files are changed, skip this workflow.

---

## Step 1: Confirm Change Scope

Identify whether current changes touch AI-architecture files:

```bash
git diff --name-only
```

If no files from the scope above are present, stop here.

---

## Step 2: Claim the AI Architecture Lock

Before editing AI-architecture files, claim an `ai_arch` lock:

```bash
bash scripts/flight_slot.sh claim \
  --flight-id flight-ai-<short-id> \
  --slot ai_arch \
  --owner codex \
  --paths ".ai,AGENTS.md,.clauderc,.cursorrules,.husky,scripts/check_ai_wiring.sh,scripts/git_finalize_guard.sh"
```

Use the single writer lock. The old parallel board is retired.

---

## Step 3: Run the AI Wiring Audit

Run:

```bash
bash scripts/check_ai_wiring.sh
```

This must pass before merging AI-architecture changes. The pre-commit hook and finalization guard will also run this automatically for AI-architecture diffs; do not rely on memory alone.

---

## Step 4: Address Failures

If the audit fails:
1. Fix missing or incorrect orchestration references and workflow gates
2. Re-run `bash scripts/check_ai_wiring.sh`
3. Repeat until clean

---

## Step 5: Handoff Requirements

When this workflow is triggered, add an **AI Architecture Audit** section in the completion gate:
- changed architecture files
- `check_ai_wiring.sh` result
- any contract/workflow updates made
- flight lock release status when this story claimed it
- git finalization evidence from `.ai/workflows/git-finalization.md` and `bash scripts/git_finalize_guard.sh`

Do not include this section for non-AI-architecture stories.

---

## Exit Criteria

- AI-architecture change scope confirmed
- `bash scripts/check_ai_wiring.sh` passed
- AI Architecture Audit section included in the completion gate when triggered
- Claimed `ai_arch` single writer lock released
- Git finalization guard passed
