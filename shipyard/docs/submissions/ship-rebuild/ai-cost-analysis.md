# AI Cost Analysis

## Cost Fidelity

The honest answer is still that Shipyard did **not** persist exact provider
`usage` payloads into the recoverable `.shipyard` artifacts. I can recover
session files, local traces, iteration counts, model identifiers, archive tags,
and watchdog logs, but not the billed input/output token totals returned by the
providers. So the numbers below separate:

- exact workload counters recovered from disk
- provider evidence recovered from disk
- reconstructed spend estimates with explicit assumptions

That is more honest than pretending the repo contains exact billing data.

## Recoverable Workload Evidence

| Item | Amount |
| --- | --- |
| Non-empty Ship target sessions | `4` |
| Recoverable top-level turns across those sessions | `268` |
| Recoverable `ultimate` activations across saved traces | `17` |
| Recoverable internal `ultimate` cycles across saved traces | `211` |
| Recoverable release-archive saves | `10` |
| Max watchdog restart counter observed | `1889` |
| Logged stale-heartbeat restarts | `1942` |
| Logged UI `MaxListenersExceededWarning` events | `40` |

These counters matter because top-level turns alone badly understate what the
runtime was doing. The rebuild spent a lot of time inside `ultimate`, where a
single user-visible run expands into multiple internal agent/review cycles.

## What the Artifacts Prove About Provider Mix

The rebuild was not a single-provider run.

- Every non-empty saved session persisted `enrichmentModel: claude-opus-4-6`,
  so Claude definitely handled target enrichment and some early runtime work.
- Early saved session evidence includes `model=anthropic/claude-opus-4-6` and
  repeated Anthropic message-creation failures.
- The long-run mission bundle for the main rebuild session was later pinned to
  `SHIPYARD_MODEL_PROVIDER=openai` and `SHIPYARD_OPENAI_MODEL=gpt-5.4`.
- Later saved session evidence includes
  `model=openai/gpt-5.4-2026-03-05`, plus OpenAI Responses timeouts and missing
  `OPENAI_API_KEY` failures on the `subagent:human-simulator` route.

The defensible conclusion is that the project used a blended OpenAI +
Anthropic/Claude workflow: early Anthropic-heavy setup and recovery, then a
long OpenAI-backed mission-control phase, with Claude still present in target
enrichment and some earlier sessions.

## Actual Development and Testing Costs

### Submission Values (Reasonable Reconstruction)

| Item | Amount |
| --- | --- |
| Claude API - input tokens | `~2.53M` |
| Claude API - output tokens | `~276k` |
| OpenAI API - input tokens | `~7.59M` |
| OpenAI API - output tokens | `~828k` |
| Total invocations during development | `~460` estimated, `422` hard floor |
| Total development spend | **`~$50.95`** estimated reasonable case |

### Scenario Envelope

| Scenario | Invocation model | Provider mix | Avg tokens per invocation | OpenAI spend | Claude spend | Total spend |
| --- | --- | --- | --- | --- | --- | --- |
| Floor | `422` invocations | `80%` GPT-5.4, `20%` Claude Opus 4.6 | `18k` input, `1.8k` output | `$24.31` | `$11.39` | **`$35.70`** |
| Reasonable | `460` invocations | `75%` GPT-5.4, `25%` Claude Opus 4.6 | `22k` input, `2.4k` output | `$31.40` | `$19.55` | **`$50.95`** |
| High-side | `540` invocations | `65%` GPT-5.4, `35%` Claude Opus 4.6 | `26k` input, `3k` output | `$38.61` | `$38.74` | **`$77.35`** |

### Why These Estimates Are Reasonable

- The `211` recoverable `ultimate` cycles imply at least `211` primary model
  calls.
- A healthy `ultimate` cycle also requires a human-simulator review pass, so
  the hard floor is `211 * 2 = 422` model invocations before I count any
  target-enrichment, retry, verifier, or non-ultimate work.
- The reasonable case adds only `38` more invocations above that hard floor to
  account for non-ultimate turns, target enrichment, and provider retries that
  are visible in session histories but not tokenized on disk.
- The high-side case adds more overhead for retries and long-context turns
  during the unstable supervision period.

### Assumptions

- The rebuild's cost model uses current standard pricing for:
  - OpenAI `gpt-5.4`
  - Anthropic `claude-opus-4-6`
- Pricing references used for the reconstruction:
  - `https://openai.com/api/pricing/`
  - `https://developers.openai.com/api/docs/models/gpt-5.4`
  - `https://platform.claude.com/docs/en/about-claude/pricing`
- No cached-input discounts, Batch API pricing, or flex pricing are assumed.
- Local tools such as file search, edits, previews, and shell commands are
  treated as token overhead inside each model turn rather than separate billed
  tool calls.
- Local validation commands such as `test`, `typecheck`, and `build` are not
  provider-billed by themselves; only the model turns that decided to run them
  are included in the invocation estimates.

## Production Cost Projections

### Submission Projection: Current Mission-Like Route

This is the closest projection to the economics the rebuild actually used once
the long-run mission was pinned to OpenAI while still retaining some expensive
Claude lanes.

| Users | Monthly cost |
| --- | --- |
| `100` users | **`$822.60 / month`** |
| `1,000` users | **`$8,226 / month`** |
| `10,000` users | **`$82,260 / month`** |

Assumptions:

- Average agent invocations per user per day: `3`
- Average tokens per invocation: `18k` input, `2.2k` output
- Provider mix per invocation:
  - `80%` OpenAI `gpt-5.4`
  - `20%` Anthropic `claude-opus-4-6`
- Cost per invocation: **`~$0.0914`**

### Optimized Production Sensitivity

If I were shipping this for cost discipline instead of replaying rebuild
economics, I would route routine work to a cheaper model mix and reserve the
most expensive models for the hardest turns.

| Users | Monthly cost |
| --- | --- |
| `100` users | **`$415.26 / month`** |
| `1,000` users | **`$4,152.60 / month`** |
| `10,000` users | **`$41,526 / month`** |

Assumptions:

- Average agent invocations per user per day: `3`
- Average tokens per invocation: `18k` input, `2.2k` output
- Provider mix per invocation:
  - `60%` OpenAI `gpt-5.4 mini`
  - `30%` OpenAI `gpt-5.4`
  - `10%` Anthropic `claude-sonnet-4.6`
- Cost per invocation: **`~$0.04614`**

## Hidden Multipliers Not Included

- Infrastructure spend is excluded: Vercel, VM/Railway hosting, storage,
  preview compute, and logs/tracing backends are all outside the tables above.
- Provider-hosted web-search fees are excluded. If `20%` of invocations trigger
  one paid web search, add roughly:
  - `+$18 / month` at `100` users
  - `+$180 / month` at `1,000` users
  - `+$1,800 / month` at `10,000` users
- The biggest lesson is operational, not mathematical: cost instrumentation
  should have been part of the runtime from day one. Reconstructing blended
  spend after a long, multi-session rebuild is possible, but it is much noisier
  than simply persisting provider `usage` objects per turn.
