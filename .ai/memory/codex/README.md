# Codex Notes

Store small, durable Codex-specific notes here when they should persist across multiple tasks.

Guidelines:

- keep entries short and dated
- prefer durable workflow observations over one-off story logs
- do not import product backlog history from other repositories

Notes:

- 2026-03-26: When refreshing docs in this repo, verify the current UI shell in
  `shipyard/ui/src/ShipyardWorkbench.tsx` before reusing older phase-pack
  wording. The active workbench is split-pane, not the older preview/live-view
  tab layout.
- 2026-03-27: Treat `shipyard/CODEAGENT.md` as the code-centric architecture
  handbook for the live runtime. If it starts reading like a historical
  appendix or submission template, refresh it from `shipyard/src/**`,
  `shipyard/ui/**`, and `shipyard/docs/architecture/**`.
- 2026-03-29: For provider incidents, check both
  `.github/workflows/railway-main-deploy.yml` and
  `shipyard/src/engine/model-routing.ts`. This repo can intentionally pin
  Railway production to a different provider/model than the checked-in local
  default.
