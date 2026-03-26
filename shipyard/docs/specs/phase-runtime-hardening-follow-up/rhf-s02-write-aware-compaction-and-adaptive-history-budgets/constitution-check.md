# Constitution Check

- [x] The story stays inside runtime context management and does not change tool authority or add a second memory channel.
- [x] No new dependency is required; compaction and config changes remain in existing engine modules.
- [x] TDD coverage is planned for large-write replays and budget-policy behavior.
- [x] The design explicitly favors bounded digests over raw file-body replay.
