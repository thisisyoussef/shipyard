# Constitution Check

- [x] New modules respect SRP and dependency direction. The plan keeps target switching pure, moves auto-enrichment eligibility into a small helper, and confines browser UX changes to the UI layer.
- [x] Backwards compatibility respected. Existing `target enrich` CLI behavior stays available even though the browser no longer depends on a dedicated enrich button.
- [x] Testing strategy covers the change. The story includes unit coverage for eligibility decisions plus integration coverage for browser and CLI auto-enrichment flows.
- [x] New dependency justified and risk-assessed. No new dependencies are required; the story builds on the existing enrichment pipeline and workbench state model.
