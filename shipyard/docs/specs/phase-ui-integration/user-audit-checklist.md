# UI Integration User Audit Checklist

Use this checklist when the Phase UI Integration pack is implemented and ready
for operator QA.

## Access and Routing

- [ ] Hosted access gate still appears before the app unlocks when required.
- [ ] `#/`, `#/editor/<product>`, `#/board/<product>`, and `/human-feedback`
      all open the expected surface.
- [ ] Reloading on an editor or board route restores the same session/product
      without creating duplicate browser sessions.
- [ ] Missing or deleted targets route to a clear fallback state instead of a
      blank screen.

## Dashboard

- [ ] Product cards come from real target/project data, not mock data.
- [ ] Card status, last activity, and active/busy cues match the live runtime.
- [ ] Hero prompt creates/selects a product and carries the launch intent into
      the editor predictably.
- [ ] Empty states explain whether there are no targets, no matches, or missing
      runtime data.
- [ ] Keyboard navigation works for tabs, cards, and the hero submit flow.

## Editor

- [ ] Transcript, composer, preview, code, and files surfaces all show live
      runtime data.
- [ ] Attach/remove uploads still works from the redesigned editor.
- [ ] Split ratio and active workspace tab persist after reload.
- [ ] Code tab can browse files safely and explains large, binary, or denied
      files clearly.
- [ ] Legacy `ShipyardWorkbench` behavior remains available or functionally
      equivalent.

## Ultimate Mode

- [ ] Starting ultimate mode from the composer toggle behaves the same as the
      existing command flow.
- [ ] Sending feedback while ultimate mode is active queues it for the next
      loop and surfaces confirmation.
- [ ] Stop behavior is clear from both the badge and cancel flow.
- [ ] Reconnect/reload while ultimate mode is active restores a truthful badge
      state instead of resetting to “off.”
- [ ] The human-feedback page still reaches the active ultimate loop.

## Board

- [ ] Board columns are rendered from backend data, not hardcoded UI state.
- [ ] The board route is scoped to a specific product and explains
      missing-target, loading, stale-snapshot, and empty-board states instead
      of showing parked or mock content.
- [ ] Story filters restore per product after reload and fall back safely if a
      stored story no longer exists in the latest board snapshot.
- [ ] Story filters, blocked states, and active-task cues are accurate.
- [ ] Empty or stale board states explain what the operator should do next.

## Resilience and Trust

- [ ] Dashboard, hosted access, `/human-feedback`, preview-unavailable, and
      file-read-error states are explicit and readable during reconnects or
      errors.
- [ ] Preview harness at `/preview.html` still works with mock data after the
      pack lands.
- [ ] `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`,
      `pnpm --dir shipyard build`, and `git diff --check` all pass.
- [ ] Any deferred issues are documented with follow-up stories instead of
      hidden behind “works locally.”
