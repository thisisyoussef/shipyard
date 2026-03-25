# Technical Plan

## Metadata
- Story ID: P9-S03
- Story Title: Target Deploy Tool and Vercel Delivery Contract
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/tools/deploy.ts`
  - `shipyard/src/tools/index.ts`
  - `shipyard/src/phases/code/index.ts`
  - `shipyard/src/phases/code/prompts.ts`
  - `shipyard/tests/tooling.test.ts` or a focused deploy-tool suite
  - manual smoke docs for credentialed deploy verification
- Public interfaces/contracts:
  - typed deploy tool input such as `platform`
  - structured deploy result contract
  - provider secret/env contract such as `VERCEL_TOKEN`
- Data flow summary: the model or a higher-level UI/backend action requests a
  deploy, the deploy tool validates provider prerequisites, runs the Vercel
  deploy command inside the target directory, parses the production URL, and
  returns a structured result instead of free-form shell output.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
- Story ordering rationale: this story follows the hosted baseline so the
  provider env and workspace assumptions are already clear when deploy work
  lands.
- Gaps/overlap check: this story owns the deploy primitive only. Workbench UX,
  persisted deploy state, and public-URL presentation live in `P9-S04`.
- Whole-pack success signal: Shipyard can produce a public target-app URL from
  inside the active workspace rather than stopping at local file edits.

## Architecture Decisions
- Decision: introduce a dedicated deploy tool instead of telling the model to
  improvise provider shell commands via `run_command`.
- Alternatives considered:
  - teach the model to call `run_command` directly
  - add a generic shell macro for provider deploys
- Rationale: deploy work needs longer timeouts, explicit secret redaction, and
  structured URL extraction that the generic command tool does not guarantee.
- Decision: implement only `vercel` in the first pass, but keep the tool input
  extensible to future platforms.
- Alternatives considered:
  - implement `vercel` and `railway` together
  - hard-code a no-argument deploy path
- Rationale: Vercel is the simplest first production target for static or
  frontend-heavy generated apps.

## Data Model / API Contracts
- Request shape:
  - `platform`
  - future optional deploy-mode/provider options if needed
- Response shape:
  - status
  - platform
  - production URL
  - summary/log excerpt
  - any provider metadata needed by traces or later UI
- Storage/index changes:
  - none required in this story
  - persisted latest-deploy metadata is deferred to `P9-S04`

## Dependency Plan
- Existing dependencies used:
  - current tool registry
  - current process-execution patterns
  - current tracing/tool reporting pipeline
- New dependencies proposed (if any):
  - ideally none at the app-runtime level
  - if CLI availability becomes a problem, add provider tooling in a
    deterministic repo-owned way
- Risk and mitigation:
  - Risk: Vercel deploys take longer than current command defaults.
  - Mitigation: let the deploy tool own its own longer bounded timeout instead
    of inheriting the generic command cap.

## Test Strategy
- Unit tests:
  - deploy input validation
  - Vercel URL extraction
  - secret-redacted failure formatting
- Integration tests:
  - mocked process success/failure/timeout flows
  - registry exposure through the code phase
- E2E or smoke tests:
  - one credentialed manual Vercel deploy smoke once provider access exists
- Edge-case coverage mapping:
  - missing `VERCEL_TOKEN`
  - missing CLI
  - unsupported platform
  - timeout
  - multiple URLs in provider output

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - not applicable in this tool-first story
- Component structure:
  - not applicable in this story
- Accessibility implementation plan:
  - not applicable in this story
- Visual regression capture plan:
  - not applicable in this story

## Rollout and Risk Mitigation
- Rollback strategy: keep the deploy tool opt-in and do not replace the
  existing generic command tool.
- Feature flags/toggles: explicit tool invocation plus provider env presence are
  sufficient for the first rollout.
- Observability checks: traces should show deploy start, provider choice, and
  redacted success/failure summaries.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
