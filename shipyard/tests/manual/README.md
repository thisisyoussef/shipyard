# Manual Smoke Scripts

These scripts are opt-in verification helpers for scenarios that are expensive,
credentialed, or otherwise unsuitable for the default automated test suite.

## Current Scripts

- `phase2-tools-smoke.ts`: exercises the Phase 2 tool surface
- `phase3-live-loop-smoke.ts`: checks the live graph-mode runtime path with bootstrap-ready seeded targets, large writes, a broad-greenfield first turn, and a same-session `broad-continuation` follow-up that should stay off explorer/planner
- `phase4-langsmith-mvp.ts`: validates the LangSmith-backed MVP flow
- `phase5-local-preview-smoke.ts`: verifies preview auto-start, refresh, and unavailable-state handling
- `spec-pack-rebuild.ts`: mounts an external spec pack at `.shipyard/spec` inside a disposable target and runs a one-shot rebuild instruction against it

## Spec Pack Runner

Use this when you want to reproduce a large spec-driven run without hand-wiring
temp targets or symlinks.

Example:

```bash
pnpm --dir shipyard manual:spec-pack -- --spec-root /abs/path/to/spec-pack --instruction-file /abs/path/to/prompt.md
```

To resume a long-running mounted-pack session after Shipyard emits a handoff:

```bash
pnpm --dir shipyard manual:spec-pack -- --spec-root /abs/path/to/spec-pack --target-dir /tmp/existing-target --session-id <session-id>
```

Useful env vars for long-running model turns:

- `SHIPYARD_ANTHROPIC_TIMEOUT_MS`
- `SHIPYARD_ANTHROPIC_MAX_RETRIES`
- `SHIPYARD_ANTHROPIC_MODEL`
- `SHIPYARD_ANTHROPIC_MAX_TOKENS`

Current Anthropic defaults for long-running code turns are `timeoutMs=600000`
and `maxTokens=12288`. Set the env vars above when you need a different
budget for a smoke run.

The runner prints the scratch target path, session id, mounted spec path, and a
JSON result artifact path so you can inspect the generated files after the run.

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
