# Constitution Check

- [x] New modules respect SRP and dependency direction. CLI parsing stays in `bin/`, session switching stays in `engine/state`, REPL commands stay in `engine/loop`.
- [x] Backwards compatibility respected. `--target <path>` behavior is unchanged. Target manager mode only activates when `--target` is omitted.
- [x] Testing strategy covers the change. Unit tests for parseArgs, switchTarget, and REPL commands. Integration tests for startup flow and session persistence across switches.
- [x] New dependency justified and risk-assessed. No new dependencies. Uses existing Commander, readline, and session persistence infrastructure.
