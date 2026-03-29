# Ship Rebuild Submission Pack

This folder collects the written deliverables for the long-running Ship rebuild
exercise that used Shipyard to drive the generated target at
`/Users/youss/Development/gauntlet/ship-promptpack-ultimate` against the real
Ship product in `/Users/youss/Development/gauntlet/ship`.

The write-up is grounded in the recoverable runtime evidence, not just memory:

- session state:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/sessions/*.json`
- local traces:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/traces/*.jsonl`
- release archive index:
  `/Users/youss/Development/gauntlet/.shipyard-target-releases/index.json`
- watchdog and deploy logs:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/ops/feXVo-pa-Pb-LXYgUNEEh/logs/mission-watchdog.log`
  and
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/ops/feXVo-pa-Pb-LXYgUNEEh/logs/vercel-sync.log`

## Included Deliverables

- [`comparative-analysis.md`](./comparative-analysis.md)
- [`ai-development-log.md`](./ai-development-log.md)
- [`ai-cost-analysis.md`](./ai-cost-analysis.md)
- [`ship-rebuild-log.md`](./ship-rebuild-log.md)

## Runtime Anchors

- Rebuild session: `feXVo-pa-Pb-LXYgUNEEh`
- Recoverable non-empty target sessions: `4`
- Recoverable top-level turns across those sessions: `268`
- Recoverable `ultimate` activations across saved traces: `17`
- Recoverable `ultimate` cycles across saved traces: `211`
- Recoverable release-archive saves: `10`
- Latest archived refresh tag:
  `refresh-20260329t032429369z-turn-106`
- Latest submission deploy:
  `https://ship-promptpack-ultimate-static.vercel.app`

## Related Shipyard Runtime Changes

- [PR #137](https://github.com/thisisyoussef/shipyard/pull/137):
  recover human-simulator continuation budget
- [PR #146](https://github.com/thisisyoussef/shipyard/pull/146):
  harden long-run mission recovery
- [PR #151](https://github.com/thisisyoussef/shipyard/pull/151):
  archive refreshed targets into sidecar git history
