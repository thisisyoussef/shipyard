# Story Handoff Workflow (Combined Completion Gate)

**Purpose**: Deliver one user-facing completion packet that combines verification evidence, manual audit guidance, and the finalization plan so approval and finalization happen in one clean gate.

---

## When To Run

Run this workflow at the end of every story, regardless of story type:
- feature
- bug fix
- performance
- security
- deployment/ops
- AI-architecture changes

---

## Required Completion Gate Shape

Every completion gate must include:
- `Current Status`
- `Testing Brief`
- `Decision / Design Brief`
- `Visible Proof`
- `GitHub Status`
- `Completion Plan`
- `User Audit Checklist (Run This Now)`

When a story completed a visible story pack, the completion gate must also reference the pack-level `user-audit-checklist.md`.

The completion gate is incomplete if any of these sections are missing.

---

## TDD Evidence Requirements

When `.ai/workflows/tdd-pipeline.md` was used, the completion gate must also include:
- TDD handoff artifact path listed
- RED/GREEN checkpoint evidence listed
- Property-test and mutation outcomes listed

---

## Completion Plan Requirements

The completion gate must include the finalization plan in the same packet as the user audit:
- current branch
- target base branch
- writable remote
- current GitHub state: local-only, pushed-without-PR, open PR, or merged
- proposed commit message
- expected deploy status: `deployed`, `not deployed`, or `blocked`
- public demo status when deploy-relevant
- whether AI-architecture checks were required
- recovery path: `.ai/workflows/finalization-recovery.md`

Do not make the user go through a second human-facing git checklist after this packet.

---

## User Audit Checklist Requirements

Use this exact section heading:

```markdown
## User Audit Checklist (Run This Now)
```

Checklist rules:
- focus on manual judgment, visible proof, or approval decisions
- do not offload routine terminal verification Codex could run itself
- use commands only when the user truly must run them
- include expected outcome and failure hint for each step
- for stories that change visible behavior in `api/` or `web/`, include at least one UI inspection step
- for deploy-relevant visible stories, make that UI inspection step point at the sanctioned public demo or the exact blocked deploy state
- name the exact route, click path, or visible state the user should inspect instead of relying on terminal output alone
- when a story closes a visible pack, include the pack-level `user-audit-checklist.md` as the whole-pack audit artifact
- include `Changed in this story`
- include `Should remain unchanged`
- include `Estimated audit time`

## UI Inspection Requirements

When a story changes user-visible behavior, the completion gate must treat UI inspection as first-class evidence:
- include at least one browser-visible proof artifact in `Visible Proof`
- include at least one UI inspection step in `## User Audit Checklist (Run This Now)`
- run `.ai/workflows/ui-qa-critic.md` after validation so visible-story handoffs include a lightweight evidence-based critique and any non-blocking tail follow-ons
- prefer sanctioned deployed surfaces when available so the user can monitor real behavior, not just code diffs
- if the visible surface is blocked from deployment, say exactly why and point the user at the best available local proof instead
- if the story completes a visible pack, point the user at the pack-level `user-audit-checklist.md` so they can inspect the whole shipped slice in one pass

---

## Feedback and Approval Rules

1. Treat this completion gate as the only user-facing approval step before final git actions.
2. If the user gives narrow corrective feedback, run `.ai/workflows/user-correction-triage.md` before broadening the work.
3. If the diff changes materially after feedback, issue a revised completion gate.
4. Unless the user explicitly asks to pause or use a different merge path, move directly into `.ai/workflows/git-finalization.md` after issuing the completion gate.
5. If finalization fails, stop and route to `.ai/workflows/finalization-recovery.md`, then return here with updated status.

---

## Exit Criteria

- Completion evidence summarized clearly
- GitHub state and merge status made explicit so the user never has to guess whether work is only local, on a PR, or already merged
- Finalization plan included in the same packet as the user audit
- User audit focused on manual judgment rather than routine commands
- Finalization default is explicit and visible in the completion gate, with automatic follow-through unless the user pauses it
