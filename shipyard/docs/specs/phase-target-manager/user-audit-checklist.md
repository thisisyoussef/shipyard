# User Audit Checklist — Phase Target Manager

## Pack

- Pack: Phase Target Manager
- Pack completion story: PTM-S04
- Estimated audit time: 10-15 minutes

## Changed in this story

- Browser and CLI target create/switch now auto-enrich unprofiled targets when enough context exists.
- Browser target status is passive-only: queued/analyzing/ready/error without `Enrich target` or `Retry enrichment` buttons.
- Browser auto-enrichment is guarded against stale background runs after fast target switches.

## Should remain unchanged

- Passing `--target <path>` still starts Shipyard directly in that target.
- `target enrich` still works as a manual CLI recovery/debug command.
- Switching targets still preserves per-target session history and trace files.

## Audit Steps

1. Launch the browser workbench against a clean target without a saved profile.
Expected outcome: the target appears immediately, the workbench stays interactive, and the status resolves passively from background analysis to `Target profile saved.` without an enrich CTA.
Failure hint: if the target stays idle, inspect `.shipyard/traces/*.jsonl` for missing `target.enrichment` `queued` and `complete` events.

2. Open the target switcher and move between a profiled target and an unprofiled target.
Expected outcome: profiled targets load instantly without re-analysis, while unprofiled targets queue passive analysis only once per activation.
Failure hint: if a previously profiled target re-analyzes every time, inspect the loaded `.shipyard/profile.json` path and the browser `target:state` payload.

3. Create a fresh target from the browser target switcher.
Expected outcome: create completes before analysis finishes, the new target becomes active right away, and the creation description is reused for greenfield enrichment.
Failure hint: if creation blocks on a second prompt, inspect the create request payload and automatic-enrichment planner behavior.

4. Switch rapidly between two targets in the browser.
Expected outcome: the final active target keeps its own status and description; a slower earlier enrichment must not overwrite the later target.
Failure hint: if descriptions or status jump back to the wrong target, inspect `target.enrichment` events and stale-run guard behavior in the local trace.

5. Run the CLI manual fallback with `target enrich` on an active target.
Expected outcome: the CLI still prints manual enrichment progress and refreshes `profile.json` even though the browser no longer exposes a dedicated enrich button.
Failure hint: if the command is missing or no longer updates the profile, inspect `src/engine/target-command.ts` and the saved profile timestamp.
