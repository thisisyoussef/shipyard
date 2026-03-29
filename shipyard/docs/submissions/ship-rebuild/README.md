# Ship Rebuild Submission Pack

This folder collects the written deliverables for the long-running Ship rebuild
exercise that used Shipyard to drive the generated target at
`/Users/youss/Development/gauntlet/ship-promptpack-ultimate` against the real
Ship product in `/Users/youss/Development/gauntlet/ship`.

The write-up is grounded in the recoverable runtime evidence, not just memory:

- session state:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/sessions/feXVo-pa-Pb-LXYgUNEEh.json`
- local trace:
  `/Users/youss/Development/gauntlet/ship-promptpack-ultimate/.shipyard/traces/feXVo-pa-Pb-LXYgUNEEh.jsonl`
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
- Recoverable top-level turns: `121`
- Recoverable `ultimate` starts: `12`
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
