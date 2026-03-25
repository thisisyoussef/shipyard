# Agent 1 Test Contract

Canonical runtime test file: `shipyard/tests/graph-runtime.test.ts`

P6-S03 added these coordinator-integration checks:

- `plan node delegates broad instructions to the explorer before acting`
- `plan node skips explorer when the instruction already names an exact path`
- `verify node delegates post-edit checks to the verifier helper`
- `verification evidence beats explorer guesses and keeps recovery intact`
