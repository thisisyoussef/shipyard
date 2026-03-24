# Manual Smoke Scripts

These scripts are opt-in verification helpers for scenarios that are expensive,
credentialed, or otherwise unsuitable for the default automated test suite.

## Current Scripts

- `phase2-tools-smoke.ts`: exercises the Phase 2 tool surface
- `phase3-live-loop-smoke.ts`: checks the live raw-loop path
- `phase4-langsmith-mvp.ts`: validates the LangSmith-backed MVP flow

Run these intentionally when you are working on the affected surface or when
you need extra confidence beyond the default `pnpm test` suite.
