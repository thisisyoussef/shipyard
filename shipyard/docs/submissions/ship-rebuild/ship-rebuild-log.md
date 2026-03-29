# Ship Rebuild Log

This is the running log of the human interventions that were required to keep
the Ship rebuild moving. It focuses on what broke, what I did, and what each
break revealed about the agent's limitations.

## Intervention Log

| Time (CDT) | What broke or got stuck | What I did | What it revealed |
| --- | --- | --- | --- |
| Mar 28, 4:29 PM | `ultimate` stopped after `40` cycles with a request timeout and a connection error in the last turn. | Resumed from the persisted handoff instead of restarting the target from scratch. | Long autonomy was still vulnerable to replay and provider instability. |
| Mar 28, 4:57 PM and 5:16 PM | The human simulator crashed with `Human simulator exceeded its bounded review loop budget.` | Patched Shipyard in [PR #137](https://github.com/thisisyoussef/shipyard/pull/137) so review-budget exhaustion falls back to a continuation decision instead of killing the loop. | The loop's self-review layer could deadlock the entire run. |
| Mar 28, 5:42 PM to 6:39 PM | Several restarts failed instantly because `subagent:human-simulator` had no `OPENAI_API_KEY`. | Repaired the runtime path and environment handoff so the saved session could start again. | Multi-route provider wiring was not operationally sealed. |
| Mar 28, 6:41 PM | A live turn failed on malformed JSON for `edit_block` with an unterminated string. | Interrupted, resumed from handoff, and re-prompted with tighter file scope and smaller change batches. | The agent still breaks tool contracts when asked to rewrite too much at once. |
| Overnight, Mar 28 to Mar 29 | The Team story repeatedly produced no durable diff and eventually blocked `src/pages/Team.tsx` after repeated verification failures. | Accepted Shipyard's checkpoint restore, then redirected the loop to fix blockers before widening scope. | The agent can look active while not making forward progress on disk. |
| Mar 29, early afternoon | After 24 hours, the live stack was no longer coherent: the last real work was from the prior night, the workbench and preview were out of sync, and the watchdog had entered a restart storm. | Diagnosed the system from the session file, trace, and watchdog logs before doing any more product work. | "Alive" is not the same thing as "productively running." |
| Mar 29, 1:27 PM to 1:45 PM | The supervision stack had spiraled up to restart `1889` and the target still had no trustworthy in-repo rollback history. | Added a hardened long-run mission-control path in [PR #146](https://github.com/thisisyoussef/shipyard/pull/146), then later rewired the live session onto the upgraded runtime. | Long-run agent loops need real ops architecture: watchdogs, heartbeats, restart policy, and state recovery. |
| Mar 29, 10:24 PM archive snapshot boundary, then applied live later | The target repo still had no git baseline, so "revert later" was unsafe. | Added sidecar target release archiving in [PR #151](https://github.com/thisisyoussef/shipyard/pull/151) and rewired the running session so refreshed targets were tagged into `.shipyard-target-releases`. | Long-running generated targets need rollback outside the target repo itself. |
| Mar 29, after preview exit | The preview died independently of the session. | Restarted preview and added a dedicated preview watchdog separate from the main session supervisor. | Preview lifecycle and session lifecycle are different failure domains. |
| Mar 29, deployment pass | The submission target needed a public URL, but the strict TypeScript build was still red. | Built a Vercel sync path that falls back from `npm run build` to `npx vite build`, syncs `dist/`, and republishes on a schedule. | The agent was better at producing demoable UI than at preserving full type correctness. |
| Throughout the rebuild | The backlog kept drifting toward what the agent found locally easiest to generate. | Scanned the real Ship repo, derived a `100`-prompt parity pack from `ship/web/src/**` and `ship/e2e/**`, and fed that back into the live loop. | The agent needed a much stricter product source of truth than the original prompt-pack target alone provided. |

## What the Rebuild Log Says About the Agent

The recurring pattern was not "the model is bad at coding." It was more
specific:

- It is strong at rapid visible synthesis.
- It is weaker at long-horizon correctness and operational stability.
- It needs tighter file budgets and clearer source-of-truth references than a
  human developer does.
- It will happily keep looking productive unless the runtime surfaces hard
  evidence about disk changes, verification status, and restart health.

## Evidence Pointers

- Session file:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/sessions/feXVo-pa-Pb-LXYgUNEEh.json`
- Trace file:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/traces/feXVo-pa-Pb-LXYgUNEEh.jsonl`
- Watchdog log:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/ops/feXVo-pa-Pb-LXYgUNEEh/logs/mission-watchdog.log`
- Deploy log:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/ops/feXVo-pa-Pb-LXYgUNEEh/logs/vercel-sync.log`
- Release archive index:
  `/Users/youss/Development/gauntlet/.shipyard-target-releases/index.json`
