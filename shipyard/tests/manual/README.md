# Manual Smoke Scripts

These scripts are opt-in verification helpers for scenarios that are expensive,
credentialed, or otherwise unsuitable for the default automated test suite.

## Current Scripts

- `phase2-tools-smoke.ts`: exercises the Phase 2 tool surface
- `phase3-live-loop-smoke.ts`: checks the live raw-loop path
- `phase4-langsmith-mvp.ts`: validates the LangSmith-backed MVP flow
- `phase5-local-preview-smoke.ts`: verifies preview auto-start, refresh, and unavailable-state handling

## SV-S01 Operator Checklist

1. Terminal loop:
   Run `pnpm --dir shipyard test-target:cli`, wait for the prompt, run `status`,
   submit one harmless instruction, submit one intentionally failing
   instruction such as `inspect missing.ts`, then confirm the loop still
   accepts `status` before `exit`.
2. Browser UI:
   Run `pnpm --dir shipyard test-target:ui`, submit one read or edit
   instruction, confirm streamed activity plus any edit preview, then submit a
   failing instruction and verify the UI returns to a ready state afterward.
3. Trace follow-up:
   When LangSmith credentials are available, run
   `pnpm --dir shipyard exec tsx tests/manual/phase4-langsmith-mvp.ts` to
   confirm one successful trace URL and one failing trace URL still resolve.

Run these intentionally when you are working on the affected surface or when
you need extra confidence beyond the default `pnpm test` suite.
