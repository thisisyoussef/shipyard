# Architecture Decisions (ADR Log)

Record durable workspace decisions here.

## Template

- **ADR-ID**:
- **Date**:
- **Context**:
- **Decision**:
- **Alternatives Considered**:
- **Consequences**:

## Seeded Decisions

- **ADR-ID**: ADR-0001
- **Date**: 2026-03-24
- **Context**: The workspace needs a reusable helper harness without mixing it into the runnable application surface.
- **Decision**: Keep helper workflow material in root `.ai/` and keep the application itself in `shipyard/`.
- **Alternatives Considered**: Keep everything at repo root; embed the harness inside `shipyard/`.
- **Consequences**: Repo-level docs must describe the two-surface layout clearly, and validation commands from the root must target `shipyard/`.

- **ADR-ID**: ADR-0002
- **Date**: 2026-03-24
- **Context**: Shipyard is currently a Day 1 local coding-agent foundation with a persistent CLI loop and typed tool registry.
- **Decision**: Keep the app as a standalone TypeScript CLI with a persistent loop, typed tools, local checkpoints, and local trace logging.
- **Alternatives Considered**: Turn the app into a web service immediately; defer typed tools until later.
- **Consequences**: The app can evolve incrementally from a stable local runtime, and the harness can stay focused on building that core.

- **ADR-ID**: ADR-0003
- **Date**: 2026-03-24
- **Context**: The imported harness source included project-specific memory from another repo.
- **Decision**: Reset imported backlog/history files and keep only repo-generic workflows, templates, and memory slots.
- **Alternatives Considered**: Keep the imported memory and rename it; rebuild the harness from scratch.
- **Consequences**: The harness starts clean, but future tasks must maintain the new generic baseline intentionally.

- **ADR-ID**: ADR-0004
- **Date**: 2026-03-25
- **Context**: Broad Shipyard instructions need more structure than the
  lightweight `TaskPlan`, but the runtime still needs to stay fast for
  exact-path and other narrow work.
- **Decision**: Add a read-only planner helper that emits a typed
  `ExecutionSpec` for broad code-phase instructions, while keeping a lightweight
  fallback spec for trivial, greenfield, and target-manager paths.
- **Alternatives Considered**: Keep stretching `TaskPlan`; make planner mode the
  default for every instruction.
- **Consequences**: Planner output becomes reusable by later evaluation and plan
  mode stories, and route metadata must clearly distinguish planner-backed vs
  lightweight runs.

- **ADR-ID**: ADR-0005
- **Date**: 2026-03-25
- **Context**: Phase 8 needs spec-driven planning without depending on pasted context or overloading generic file reads.
- **Decision**: Add a dedicated read-only `load_spec` tool that returns named, bounded spec documents instead of folding raw spec loading into `read_file` or `rollingSummary`.
- **Alternatives Considered**: Reuse `read_file` alone; tell operators to keep pasting briefs manually.
- **Consequences**: Spec-driven stories can reuse stable `spec:` refs and bounded tool output, while later plan/task stories can build on that contract without inventing another spec-loading path.

- **ADR-ID**: ADR-0006
- **Date**: 2026-03-25
- **Context**: The harness already used a Claude-first bridge for design briefs, but later UI implementation and QA phases had no equivalent scripted delegate and no reversible switch for trying Claude there.
- **Decision**: Add a flag-gated `scripts/run-ui-phase-bridge.mjs` entrypoint for UI implementation, QA, critic, and final polish. The flag only changes provider routing; the phase prompts must preserve the exact Codex skill chain for each phase.
- **Alternatives Considered**: Keep later phases manual only; make all later UI phases Claude-first unconditionally; define a separate Claude-only skill chain.
- **Consequences**: The repo can trial Claude in later UI phases without changing the workflow contract, and turning the flag off returns those scripted bridges to a Codex-first path.

- **ADR-ID**: ADR-0007
- **Date**: 2026-03-25
- **Context**: Shipyard needed richer greenfield bootstrap without duplicating scaffold logic between target creation and code-phase empty-target setup.
- **Decision**: Keep the scaffold catalog in `shipyard/src/tools/target-manager/scaffolds.ts` as the single source of truth, and route both `create_target` and `bootstrap_target` through one shared materialization helper.
- **Alternatives Considered**: Add a second project-scaffolder tool; keep relying on repeated `write_file` calls for boilerplate.
- **Consequences**: New presets must be added once and reused across both flows, and code-phase guidance should prefer the shared bootstrap tool for standard workspace starters.

- **ADR-ID**: ADR-0008
- **Date**: 2026-03-25
- **Context**: Long-running or recovery-heavy turns need more durable resume state than an eight-line rolling summary, but the richer planner artifact is not yet merged on `main`.
- **Decision**: Persist typed `ExecutionHandoff` artifacts under `shipyard/.shipyard/artifacts/<sessionId>/` and keep only the active artifact path in session state, with the first landing anchored to the current `TaskPlan` plus latest verification outcome.
- **Alternatives Considered**: Stretch `rollingSummary`; write ad hoc notes blobs; block the story on the unmerged planner branch.
- **Consequences**: Resume state stays structured and target-local today, traces/logs must expose handoff metadata, and later planner work can enrich the existing handoff contract instead of inventing a second reset path.

- **ADR-ID**: ADR-0009
- **Date**: 2026-03-26
- **Context**: Shipyard now supports no-target target-manager turns,
  review-first planning turns, queued task execution, and standard code turns,
  but all of those flows still need to stay legible and share one session
  model.
- **Decision**: Keep one shared session model and route work through three
  explicit paths: target-manager turns, `plan:` / `next` / `continue` plan
  turns, and standard code turns through the graph runtime.
- **Alternatives Considered**: Split target-manager into a separate app; build a
  second execution engine for plan/task work; hide plan/task routing inside the
  standard code turn path.
- **Consequences**: Docs must distinguish routing layers clearly, session state
  must carry phase/task/handoff pointers explicitly, and browser/terminal
  surfaces can keep sharing the same runtime contracts.

- **ADR-ID**: ADR-0010
- **Date**: 2026-03-26
- **Context**: The next architecture step needs to absorb patterns from
  software-factory systems without losing Shipyard's current single-writer,
  local-first strengths.
- **Decision**: Sequence the next major runtime work through a dedicated
  `phase-10` story pack: durable execution threads first, then policy and
  sandboxing, then layered memory and repo indexing, then explicit routing and
  verification, then isolated background tasks and readiness surfaces.
- **Alternatives Considered**: Keep adding isolated improvements to the current
  runtime one-off; pivot to a multi-writer swarm architecture immediately.
- **Consequences**: Future architecture stories should map back to the `phase-10`
  sequence, preserve the single-writer coordinator, and avoid introducing new
  parallel persistence systems or unreviewed background mutation paths.

- **ADR-ID**: ADR-0011
- **Date**: 2026-03-26
- **Context**: Provider-routing work needs one stable internal model boundary
  before Anthropic can move behind an adapter or OpenAI can be added cleanly.
- **Decision**: Define provider-neutral turn and tool contracts in
  `shipyard/src/engine/model-adapter.ts`, keep
  `shipyard/src/tools/registry.ts` generic, and let adapter modules own
  provider-specific tool projection.
- **Alternatives Considered**: Keep Anthropic wire types as the shared runtime
  contract; make the registry emit multiple provider-specific tool shapes.
- **Consequences**: Later provider migration can reuse one Shipyard-owned
  contract, and new providers should only need adapter work instead of registry
  changes.

- **ADR-ID**: ADR-0012
- **Date**: 2026-03-26
- **Context**: Local CLI runs, browser workbench runs, and LangSmith traces all
  exposed different slices of runtime routing, which made local vs hosted
  debugging unnecessarily indirect.
- **Decision**: Build one shared per-turn execution fingerprint at the
  `executeInstructionTurn` boundary and reuse it in CLI output, browser
  completion state, local JSONL traces, and LangSmith metadata.
- **Alternatives Considered**: Print independent surface-specific debug lines;
  inspect only `harnessRoute`; keep runtime-surface clues inside ad hoc logs.
- **Consequences**: Operator surfaces now share one diagnostic vocabulary, and
  future routing/model changes should extend the shared fingerprint contract
  instead of inventing new debug-only formats.

- **ADR-ID**: ADR-0013
- **Date**: 2026-03-27
- **Context**: Shipyard's shipped runtime default and the hosted Railway
  production workflow had drifted toward OpenAI, but the current operator goal
  is to ship Anthropic's strongest coding model as the default route.
- **Decision**: Make Anthropic the shipped default provider again, pin the
  default Anthropic model to `claude-opus-4-6`, and update the Railway
  production workflow, docs, and regression coverage in the same story.
- **Alternatives Considered**: Leave Anthropic as an override only; change the
  local default without updating the hosted production pin; pin a versioned
  Anthropic model ID instead of the stable alias.
- **Consequences**: Missing-credential behavior now points at
  `ANTHROPIC_API_KEY` by default, hosted deploys require the Anthropic repo
  secret to stay configured, and future provider flips must treat runtime,
  docs, and Railway sync as one contract.

- **ADR-ID**: ADR-0015
- **Date**: 2026-03-29
- **Context**: Operators want the Railway-hosted production runtime on OpenAI,
  but the checked-in local Shipyard default remains Anthropic for direct runs
  and local smoke flows.
- **Decision**: Keep Anthropic as the checked-in local default route, but pin
  the Railway production workflow to OpenAI `gpt-5.4` by syncing
  `OPENAI_API_KEY`, `SHIPYARD_MODEL_PROVIDER=openai`, and
  `SHIPYARD_OPENAI_MODEL=gpt-5.4` into the Railway service on each deploy.
- **Alternatives Considered**: Flip the global runtime default back to OpenAI;
  leave Railway production on Anthropic and treat operator intent as mistaken.
- **Consequences**: Local documentation must distinguish local defaults from
  hosted production routing, the Railway secret baseline now requires
  `OPENAI_API_KEY`, and future provider work must audit both the local default
  contract and the hosted production override.

- **ADR-ID**: ADR-0014
- **Date**: 2026-03-27
- **Context**: `shipyard/CODEAGENT.md` had fallen behind the shipped runtime
  and still read like a historical submission appendix even though Shipyard now
  has target-manager turns, plan/task routing, continuation handoffs,
  provider-neutral model routing, and a split-pane browser workbench.
- **Decision**: Treat `shipyard/CODEAGENT.md` as a durable architecture
  handbook for the live runtime, and keep it organized around stable subsystem
  boundaries, execution contracts, and extension rules instead of phase-era
  rebuild logs or submission checklist sections.
- **Alternatives Considered**: Keep patching the appendix incrementally; move
  the architecture narrative entirely into other docs and leave `CODEAGENT.md`
  as legacy baggage.
- **Consequences**: Future runtime changes should update `CODEAGENT.md`
  alongside the local README and architecture pages, and agents can use the
  file as a trustworthy code-centric onboarding map instead of falling back to
  stale phase language.

- **ADR-ID**: ADR-0015
- **Date**: 2026-03-29
- **Context**: The Ship rebuild submission now requires a comparative analysis,
  development log, cost analysis, and intervention log that are grounded in the
  actual long-run rebuild evidence rather than reconstructed praise or memory.
- **Decision**: Store the Ship rebuild submission pack under
  `shipyard/docs/submissions/ship-rebuild/`, link it from
  `.claude/CLAUDE.md`, `shipyard/docs/README.md`, and the appendix section of
  `shipyard/CODEAGENT.md`, and treat those docs as the canonical submission
  surface for this exercise.
- **Alternatives Considered**: Keep the write-up in loose root notes; fold the
  analysis into `CODEAGENT.md` only; wait until the very end of the rebuild to
  draft the submission material from memory.
- **ADR-ID**: ADR-0016
- **Date**: 2026-03-29
- **Context**: Railway production was correctly redeploying the hosted
  Shipyard service itself, but fresh boots could still surface the wrong target
  until an operator switched back to the live Ship promptpack workspace by
  hand.
- **Decision**: Add a hosted-only bootstrap target override
  (`SHIPYARD_HOSTED_DEFAULT_TARGET_PATH`) in `shipyard/src/bin/shipyard.ts`,
  set it to `/app/workspace/ship-promptpack-live` in the `main` Railway
  workflow, and add `scripts/verify-hosted-deploy.mjs` so the deploy pipeline
  fails if `/api/health` does not come back on that canonical target cleanly.
- **Alternatives Considered**: Rely on operators to switch targets after every
  boot; only detect drift manually from the hosted editor; keep verifying the
  service URL alone without asserting the active target.
- **Consequences**: Hosted prod now has a single declared canonical target, the
  access helper can deep-link straight into that editor route, and future
  Railway target changes must update runtime env, deploy verification, and
  operator docs together.
- **Consequences**: Submission docs now have a stable home, entry points stay
  discoverable for future agents, and comparative claims should cite trace,
  session, archive, and log evidence instead of relying on retrospective recall.

- **ADR-ID**: ADR-0016
- **Date**: 2026-03-29
- **Context**: Operators now need a server-hosted path for truly long-running
  `ultimate` missions that survives laptop shutdowns while preserving the
  target-local `.shipyard/` state model.
- **Decision**: Publish a server-first Linux mission hosting pack under
  `shipyard/docs/ops/remote-linux-mission.md` and
  `shipyard/docs/ops/templates/linux-mission/` that wraps the existing
  mission-control stack with `systemd`, Caddy, a persistent workspace, and an
  optional two-hour Vercel sync timer instead of inventing a second hosted
  runtime architecture.
- **Alternatives Considered**: Treat plain hosted `shipyard --ui` as the long-
  run story; document only ad hoc VPS notes; make Railway the only recommended
  path even for watchdog-backed missions.
- **Consequences**: Remote ops now have a durable checked-in playbook, future
  deployment changes should keep the Linux pack aligned with the mission-config
  contract, and preview should remain an internal runtime surface while public
  sharing continues to flow through deploy URLs.
