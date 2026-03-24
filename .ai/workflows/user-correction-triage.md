# User Correction Triage Workflow

**Purpose**: Handle narrow user corrections proportionally instead of turning every clarification into a new story, ADR, or broad replanning cycle.

---

## When To Run

Run this workflow when the user gives a targeted correction or clarification such as:
- ignore one stale bullet or requirement
- rename or reword one item
- prefer a different provider or tool without changing the broader architecture
- point at one mistaken assumption
- ask for a small directional correction to the current work

Do not use this workflow when the user is actually changing product scope, architecture, or acceptance criteria in a material way.

---

## Step 1: Restate the Correction

Capture the correction in one or two sentences:
- what the user corrected
- what should now be treated as out of scope or preferred
- what remains unchanged

If the correction is ambiguous, ask one narrow clarifying question.

---

## Step 2: Record the Triage Loop Count

Before editing, record the correction cycle:

```bash
bash scripts/triage_counter.sh record
```

If the counter reaches the limit, stop and escalate to the user with:
- `triage circuit breaker reached`
- `this story may need re-scoping`
- what keeps recurring and why another patch loop is the wrong response

Do not continue patching after the circuit breaker trips.

---

## Step 3: Classify Blast Radius

Choose one level before editing:

- `L1: Local correction`
  - Affects wording, one stale assumption, one provider mention, one output format, one path, or one doc surface.
- `L2: Current-story contract correction`
  - Affects multiple files in the current story, but does not require a new architecture direction or implementation phase.
- `L3: Real scope or architecture change`
  - Changes acceptance criteria, runtime shape, deployment model, security boundary, or other material design choices.

---

## Step 4: Apply the Smallest Valid Response

### If `L1`
- patch only the directly affected files
- do not create a new story pack
- do not add a new ADR
- do not broaden the task with unrelated cleanup

### If `L2`
- patch the directly affected files and current story artifacts
- keep the diff bounded to the current story
- only create additional spec or memory artifacts if the existing contract would otherwise become misleading

### If `L3`
- stop and re-route through the normal story gates:
  - preflight
  - lookup
  - story sizing
  - spec-driven delivery
  - eval-driven development when applicable

---

## Step 5: State Why You Did Not Escalate

In handoff or the next update, say:
- which blast-radius level you classified
- what the current triage count is
- which files were updated
- why broader replanning was not needed

If you did escalate, say exactly what made it a real scope or architecture change.

## Post-Merge Correction Rule

If the correction is fixing a shipped regression or a deployed behavior break:
- do not stop at a local patch and wait for the user to separately ask about GitHub state
- after the bounded fix and validation, return to `.ai/workflows/story-handoff.md`
- include the revised completion gate and GitHub/finalization plan for the correction
- if the user already asked to "fix it" or "ensure it is merged," treat that as intent to carry the correction through the normal finalization flow unless they explicitly say `local-only`
- still follow the standard approval and recovery rules from story handoff and git finalization

---

## Exit Criteria

- The correction was restated clearly
- The triage counter was updated before editing
- Blast radius was classified before editing
- Only the minimum affected surfaces were changed for `L1` and `L2`
- The user was escalated with a re-scope signal if the triage loop limit was hit
- Full story replanning was used only for `L3`
