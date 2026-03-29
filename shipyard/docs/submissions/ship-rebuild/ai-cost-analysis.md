# AI Cost Analysis

## Actual Development and Testing Costs

The honest answer is that this rebuild did **not** persist exact provider usage
into the recoverable local artifacts. The runtime saved traces, handoffs,
session state, archive tags, and deploy logs, but it did not save the
Anthropic/OpenAI `usage` objects per turn. That means exact input-token,
output-token, and total-spend figures are not recoverable after the fact from
the repo alone.

### Measured from recoverable artifacts

| Item | Amount |
| --- | --- |
| Claude API - input tokens | Not instrumented in `.shipyard` artifacts |
| Claude API - output tokens | Not instrumented in `.shipyard` artifacts |
| Total invocations during development | `121` recoverable top-level turns in session `feXVo-pa-Pb-LXYgUNEEh`; `12` `ultimate` starts; helper-call totals not recoverable |
| Total development spend | Not recoverable exactly from local artifacts |

### Reconstructed spend floor

Because the session count **is** recoverable, I can at least compute a floor
estimate for the visible top-level turns.

Assumptions for the floor estimate:

- model family: `claude-opus-4-6`
- price model: standard Claude API pricing
- average top-level turn: `20,000` input tokens and `2,500` output tokens
- counted units: only the `121` recoverable top-level turns, not hidden helper
  calls, retries, or timed-out requests

Estimated floor:

- cost per counted turn:
  `20,000 * $5 / 1,000,000 + 2,500 * $25 / 1,000,000 = $0.1625`
- `121` counted turns x `$0.1625` = **`$19.66`**

This is **not** the true spend. It is a lower bound. Real cost was higher
because it excludes helper routes, retries, failed long-run restarts, and
non-recoverable provider calls. The missing instrumentation is itself one of the
main lessons from this rebuild.

## Production Cost Projections

The table below assumes Shipyard is shipped **without** changing its default
runtime economics and therefore still routes normal coding work to
`claude-opus-4-6`.

### Monthly inference projection

| Users | Monthly cost |
| --- | --- |
| `100` users | **`$877.50 / month`** |
| `1,000` users | **`$8,775 / month`** |
| `10,000` users | **`$87,750 / month`** |

### Assumptions

- Average agent invocations per user per day: `3`
- Average tokens per invocation:
  - input: `12,000`
  - output: `1,500`
- Cost per invocation on Opus 4.6 standard pricing:
  - input: `12,000 * $5 / 1,000,000 = $0.06`
  - output: `1,500 * $25 / 1,000,000 = $0.0375`
  - total: **`$0.0975` per invocation**
- Monthly volume formula:
  `users * 3 invocations/day * 30 days`

### Important caveats

- These numbers cover model inference only. They exclude Vercel, Railway,
  storage, preview compute, and any external service costs.
- They also exclude extra server-tool charges such as web search if those are
  enabled.
- Tool-heavy requests will cost more than the simple token model above because
  Claude tool use adds extra prompt tokens, and Shipyard is heavily tool-driven.
- If routine turns are downgraded from Opus 4.6 to Sonnet 4.6, inference spend
  drops materially. That is the production change I would make first.
