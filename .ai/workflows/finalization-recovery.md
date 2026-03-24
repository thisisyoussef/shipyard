# Finalization Recovery Workflow

**Purpose**: Recover deliberately when finalization fails instead of treating merge, guard, or CI problems as the end of the story.

---

## When To Run

Run this when any of the following happen during `.ai/workflows/git-finalization.md`:
- `git_finalize_guard.sh fails`
- `bash scripts/git_finalize_guard.sh` fails
- base-branch sync or merge hits a conflict
- push or PR creation fails
- post-push checks/CI fail
- an approved post-merge deployment step fails after merge

---

## Step 1: Capture Failure State

Record:
- failure step
- exact command that failed
- key error output
- whether the branch is still clean or in the middle of a merge/rebase

---

## Step 2: Restore a Safe Git State

If a merge is in progress:

```bash
git merge --abort
```

If a rebase is in progress:

```bash
git rebase --abort
```

If neither is active, do not improvise destructive cleanup. Stop and inspect first.

---

## Step 3: Classify the Failure

- `guard failure`: fix local wiring/branch hygiene/validation issues, then re-run the combined completion gate
- `merge conflict`: re-sync base branch, resolve conflicts carefully, then re-run the combined completion gate
- `push/PR failure`: restore remote/auth state, then retry finalization
- `CI/check failure`: fix on the same branch, update the completion gate, and ask for approval again if the diff changed materially
- `demo deploy failure`: record `blocked` or `failed` explicitly and decide whether a follow-up story is needed

---

## Step 4: Return to the Completion Gate

Do not silently continue finalization after a failure.
Return to `.ai/workflows/story-handoff.md` with:
- what failed
- what was recovered
- what still blocks completion

---

## Exit Criteria

- failure cause recorded
- git state restored safely
- recovery path chosen explicitly
- story routed back to the combined completion gate instead of being treated as done
