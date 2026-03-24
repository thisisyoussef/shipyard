# Bug Fix Batch

## Active Batch

- **Date**: 2026-03-24
- **Theme**: Browser-runtime truthfulness and operator trust
- **Scope rule**: corrective work only; no feature expansion

## Bugs

| ID | Symptom | Expected Behavior | Evidence Source | Regression Coverage | Touched Files | Status |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Failed browser turns stop with `agent:error` but no transcript text, so the workbench can say no full response was emitted. | Error turns should still emit a final textual response the transcript can display. | Shipyard session review for `inspect missing.ts`; browser runtime event flow in `shipyard/tests/ui-runtime.test.ts` | `shipyard/tests/ui-runtime.test.ts` failing-turn event sequence | `shipyard/src/engine/turn.ts`, `shipyard/tests/ui-runtime.test.ts` | Fixed |
| BUG-002 | UI mode advertises a per-session trace path, but the file is not created or written by the UI runtime. | Browser sessions should create and append to the advertised local trace file. | Shipyard session review for copied trace path; trace/runtime wiring in `shipyard/src/ui/server.ts` and `shipyard/src/engine/loop.ts` | `shipyard/tests/ui-runtime.test.ts` trace file assertions | `shipyard/src/ui/server.ts`, `shipyard/tests/ui-runtime.test.ts` | Fixed |
| BUG-003 | `pnpm --dir shipyard test` is flaky because the CLI and local-runtime integration suites contend under Vitest file parallelism. | The default repo test command should pass deterministically without extra flags. | Validation during this batch: full suite failed under default parallelism, while in-band reruns passed immediately | `pnpm --dir shipyard test` after config hardening | `shipyard/vitest.config.ts` | Fixed |

## Verification

- Focused regression: `pnpm --dir shipyard exec vitest run tests/ui-runtime.test.ts`
- Validation hardening proof: `pnpm --dir shipyard exec vitest run --maxWorkers=1`
- Full validation pending after the harness and session-memory updates land
