# Git Finalization Workflow

**Purpose**: Execute commit, push, PR, merge, deploy, and cleanup atomically after the user approves the combined completion gate.

---

## When To Run

Run this workflow only after:
- implementation and validation are done
- `.ai/workflows/story-handoff.md` has been issued
- the user has explicitly approved finalization

This workflow is execution-only. The user-facing review already happened in the combined completion gate.

---

## Step 1: Confirm the Story Is Ready

Before final git actions:
- confirm the active branch matches the current story
- confirm the completion gate already recorded deploy status and finalization plan
- confirm the user explicitly approved finalization

If any of these are false, stop and return to `.ai/workflows/story-handoff.md`.

---

## Step 2: Sync With Remotes First

```bash
git fetch --all --prune
git status -sb
git branch -vv
```

Confirm:
- the current branch is not detached
- the current branch has the expected upstream or is ready to set one
- the target repo is writable

If the canonical upstream repo is archived or read-only:
- use the writable remote for PR creation, merge, and branch lifecycle tracking
- record that fallback explicitly in the finalization update

If sync fails or a merge conflict appears, stop and route to `.ai/workflows/finalization-recovery.md`.

---

## Step 3: Review, Stage, and Commit Intentional Changes

```bash
git status --short
git diff
git add <intended-files>
git commit -m "<type>(<scope>): <summary>"
```

Use the commit message from the approved completion gate unless the user changed it.

If staging or commit fails, stop and route to `.ai/workflows/finalization-recovery.md`.

---

## Step 4: Push and Open or Update the PR

```bash
git push
gh pr status
```

If no PR exists:

```bash
gh pr create --fill
```

If a PR already exists, update it as needed and confirm the correct base branch.

If push or PR creation fails, stop and route to `.ai/workflows/finalization-recovery.md`.

Before leaving this step, record the exact GitHub state:
- branch pushed or not
- PR URL or “no PR”
- PR open/closed/merged state
- whether the work is merged to the target base branch yet

---

## Step 5: Run the Finalization Guard

Run the repo's finalization guard if one exists. If no dedicated guard exists, run the validation commands captured in the approved completion gate plus `git diff --check`.

If it fails, stop and route to `.ai/workflows/finalization-recovery.md`.

---

## Step 6: Merge With Visible PR Lineage

After approval and passing checks, merge with a normal merge commit by default:

```bash
gh pr merge --merge --delete-branch
```

Use squash or rebase only when the user explicitly asks for it.

If merge fails or GitHub reports conflicts/check failures, stop and route to `.ai/workflows/finalization-recovery.md`.

---

## Step 7: Refresh Local Refs and Cleanup

```bash
git fetch --all --prune
git checkout master
git pull --ff-only origin master
git branch -d <story-branch>
```

If the branch must remain temporarily, record why instead of deleting it silently.

Clear any repo-owned correction or triage state before leaving the branch if the story used it.

---

## Step 8: Run Post-Merge Deployment Work When Needed

If the approved completion gate includes a real deployment step, run the repo-owned deployment workflow for the touched surface.

If deployment access is missing or the deploy fails, stop and route to `.ai/workflows/finalization-recovery.md`.

---

## Step 9: Report Finalization Outcome

Return a concise finalization update with:
- branch name
- commit SHA
- target remote
- PR URL/status
- merge status
- explicit GitHub state: local-only, pushed-without-PR, open PR, or merged
- branch cleanup status
- deployment status
- finalization guard result

---

## Exit Criteria

- User approved the combined completion gate
- Changes committed
- Changes pushed to a writable remote
- PR created or updated
- finalization guard passed
- Merge completed or failure routed to recovery
- Branch cleanup completed or explicitly deferred
