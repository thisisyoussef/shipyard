# LangSmith Finish Check Workflow

**Purpose**: Use the LangSmith CLI to validate fresh traces, recent runs, and monitoring signals before merging stories that change traced AI/runtime behavior.

---

## When To Run

Run this workflow when the story changes any of:
- `shipyard/src/engine/**`
- `shipyard/src/context/**`
- `shipyard/src/tools/**`
- `shipyard/src/tracing/**`
- `shipyard/src/agents/**`
- `shipyard/src/phases/**`
- model/provider wiring, prompts, or tool orchestration behavior
- UI/runtime surfaces whose acceptance depends on trace/session/runtime evidence
- bug or performance stories whose proof depends on fresh LangSmith traces or monitoring signals

Skip this workflow for pure docs, static styling, or mechanical refactors that do not change traced behavior.

---

## Step 1: Normalize LangSmith CLI Access

The Shipyard runtime accepts both `LANGCHAIN_*` and `LANGSMITH_*` env aliases, but the LangSmith CLI expects `LANGSMITH_*` names unless flags are passed.

Before running the CLI, normalize the current shell if needed:

```bash
export LANGCHAIN_TRACING_V2="${LANGCHAIN_TRACING_V2:-true}"
export LANGSMITH_TRACING="${LANGSMITH_TRACING:-$LANGCHAIN_TRACING_V2}"
export LANGSMITH_API_KEY="${LANGSMITH_API_KEY:-$LANGCHAIN_API_KEY}"
export LANGSMITH_PROJECT="${LANGSMITH_PROJECT:-$LANGCHAIN_PROJECT}"
export LANGSMITH_ENDPOINT="${LANGSMITH_ENDPOINT:-$LANGCHAIN_ENDPOINT}"
export LANGSMITH_WORKSPACE_ID="${LANGSMITH_WORKSPACE_ID:-$LANGCHAIN_WORKSPACE_ID}"
```

Required live-verification inputs:
- LangSmith tracing enabled for the runtime
- LangSmith API key and project name available to the CLI
- model/provider credentials needed for the changed path

If live access is missing, stop here and record the finish check as blocked. Do not pretend the trace proof exists.

---

## Step 2: Produce a Fresh Verification Trace

From the repo root:

```bash
pnpm --dir shipyard test-target:init
```

Then run the changed flow against `./test-targets/tic-tac-toe` using the best surface for the story:
- `pnpm --dir shipyard test-target:cli` for terminal/runtime work
- `pnpm --dir shipyard test-target:ui` for browser/runtime work

Drive the exact scenario the story changed. When failure handling changed, also exercise one intentional error path so the trace evidence covers both the happy path and the expected failure behavior.

Record enough context to find the trace again:
- approximate start time
- session ID if visible
- the exact instruction or UI flow used

---

## Step 3: Inspect the New Trace with the CLI

List recent traces and identify the fresh verification trace:

```bash
pnpm --dir shipyard exec langsmith trace list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --limit 5 --full
```

Inspect the selected trace in detail:

```bash
pnpm --dir shipyard exec langsmith trace get <trace-id> --project "$LANGSMITH_PROJECT" --full
pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --trace-ids <trace-id> --full
```

Check:
- the expected root trace exists
- status matches the scenario you just ran
- child runs show the expected model/tool/runtime steps
- errors, token usage, latency, and metadata look consistent with the story

---

## Step 4: Review Recent Monitoring Signals

Check for fresh run failures:

```bash
pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full
```

Check recent insight reports when available:

```bash
pnpm --dir shipyard exec langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3
```

If the workspace already uses LangSmith evaluators, also review whether the relevant evaluator set changed or flagged anything important:

```bash
pnpm --dir shipyard exec langsmith evaluator list
```

---

## Step 5: Correct Unexpected Behavior Before Handoff

Unexpected behavior includes:
- no fresh trace for the verification run
- trace status or error content that does not match the expected scenario
- missing child runs for model/tool/runtime steps that should have appeared
- unexplained spikes in latency, token usage, or repeated failures
- insights that highlight a new failure mode introduced by the story

If you find unexpected behavior:
1. fix the issue before handoff when feasible
2. re-run local validation
3. re-run the live verification flow
4. re-run the LangSmith CLI checks until the evidence matches expectations

If the issue cannot be corrected because access is missing or the dependency is external, mark the story blocked instead of merging with ambiguous trace proof.

---

## Step 6: Record LangSmith Evidence in the Completion Gate

When this workflow ran, the completion gate must include a `LangSmith / Monitoring` section with:
- project name
- commands run
- trace IDs or URLs reviewed
- what was checked in the trace/run tree
- unexpected behavior found and how it was corrected, or the exact block reason

This evidence belongs in the same completion packet as testing and finalization, not in a separate follow-up.

---

## Exit Criteria

- A fresh live trace exists for the changed path
- Recent run failures and available insights were reviewed with the LangSmith CLI
- Unexpected behavior was corrected or the story was explicitly blocked
- The completion gate includes `LangSmith / Monitoring` evidence when this workflow ran
