# Phase 10: Durable Runtime, Policy, and Factory Workflow Story Pack

- Pack: Phase 10 Durable Runtime, Policy, and Factory Workflow
- Estimate: 28-36 hours
- Date: 2026-03-26
- Status: Planned

## Pack Objectives

1. Unify Shipyard's graph runtime, plan queue, handoff, and recovery state under one durable execution-thread model.
2. Add explicit approval modes, sandbox profiles, and auditable policy decisions around risky tools and commands.
3. Replace the current monolithic prompt envelope with layered memory, targeted retrieval, and decision-time guidance.
4. Give the planner and explorer a durable codebase index plus generated architecture notes instead of repeating broad repo discovery every turn.
5. Promote routing, verification, and background execution into typed policy-driven subsystems rather than coordinator heuristics.
6. Add first-class background tasking, evented operational jobs, and readiness/governance surfaces so Shipyard can act more like a software factory without becoming an uncontrolled swarm.

## External Pattern Translation

| Observed pattern | Existing similar surface | Decision | Notes |
|---|---|---|---|
| Ask/plan before execute | `plan:` mode, planner helper, graph runtime | Keep, but deepen | Unify `plan:`, `next`, `continue`, approvals, and recoveries under one durable thread rather than parallel persistence systems. |
| Layered knowledge and memory | `ContextEnvelope`, target `AGENTS.md`, uploads, handoffs | Keep, but adapt | Split stable rules, thread memory, task memory, failure notes, and indexed repo knowledge into explicit layers with compaction. |
| Isolated task copies plus checkpoints | `.shipyard/plans`, checkpoints, handoff artifacts | Keep, but adapt | Add background task runs with isolated worktrees or sandboxes, but preserve one reviewed apply path back to the main target. |
| Repo wiki or architecture index | explorer, planner, discovery, target profile | Keep, but adapt | Generate target-local architecture notes and searchable index artifacts so broad prompts do not start from zero each time. |
| Approval modes and sandboxing | typed tools, hosted access token, `run_command` timeouts | Keep, and expand | Add risk-tiered policy decisions, approval pause/resume, and environment scopes around file, shell, network, and deploy actions. |
| Evented operational jobs | preview supervisor, deploy tool, UI event stream, traces | Keep, but adapt | Treat preview, deploy, eval, indexing, and background tasks as first-class jobs with status history, retries, and retained artifacts. |
| Readiness and governance dashboards | LangSmith metadata, session state, local traces | Keep, and expand | Surface readiness, risk posture, coverage, and failure trends in the workbench instead of burying them in trace details. |
| Full multi-writer swarm coding | explorer/planner/verifier/browser evaluator roles | Discard as the default model | Shipyard keeps a single writing coordinator; helper roles stay read-only, isolated, or review-before-apply. |

## Shared Constraints

- Preserve the single-writer coordinator rule. Parallelism should come from read-only helpers, isolated background tasks, or review-before-apply flows, not concurrent writers in the same working copy.
- Reuse the existing `StateGraph`, session model, `.shipyard/` storage, typed tool registry, preview supervisor, and browser workbench instead of introducing a second runtime stack.
- Keep the lightweight path for trivial turns. The heavier durability, policy, and indexing systems should help broad or risky work without making exact single-file edits feel slow.
- New artifacts must stay typed and schema-validated, following the existing `ContextReport`, `ExecutionSpec`, `VerificationReport`, and `ExecutionHandoff` pattern.
- Store durable runtime artifacts target-locally under `.shipyard/` so local and hosted flows share the same contracts.
- Provider-specific adapters are allowed where needed, but the pack must preserve a generic Shipyard core rather than hard-coding one hosted vendor or one deployment provider.
- Approval and sandbox stories must stay honest about local developer ergonomics. A permissive local profile can still exist, but it should be explicit, auditable, and clearly separate from safer defaults.
- Evented jobs and background tasks should expose status and evidence in both CLI and browser mode, even when some richer affordances are browser-only.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P10-S01 | Durable Graph Threads and Unified Execution State | Unify graph state, plan queues, recoveries, resumes, and handoffs under one durable thread and checkpoint model. | Phase 7 implementation, Phase 8 implementation |
| P10-S02 | Risk-Tiered Approval Modes and Sandbox Policy Profiles | Add explicit risk classification, approval checkpoints, sandbox profiles, and audited policy decisions around tool execution. | P10-S01 |
| P10-S03 | Layered Memory, Context Compaction, and Decision-Time Guidance | Replace the single serialized envelope with bounded memory layers and targeted runtime guidance. | P10-S01 |
| P10-S04 | Repository Index and Generated Architecture Wiki | Add a durable codebase index plus generated architecture notes that planner, explorer, and operators can query. | P10-S03 |
| P10-S05 | RoutingDecision Policy and Bounded Helper Roles | Replace scattered coordinator heuristics with a typed routing artifact and explicit helper-role contracts. | P10-S02, P10-S03, P10-S04 |
| P10-S06 | Verification Planner, Assertion Library, and Eval Ops | Expand verification into a planner-led subsystem with richer assertions, trace-backed eval calibration, and regression ops. | P10-S05, Phase 7 evaluator work |
| P10-S07 | Background Task Board and Isolated Task Runtimes | Turn persisted plans into reviewable background task runs with isolated execution environments and explicit apply/discard flow. | P10-S01, P10-S02, P10-S05 |
| P10-S08 | Evented Job Runtime and Agent Readiness Dashboard | Unify preview, deploy, eval, indexing, and task runs under one job model and surface readiness/governance in the workbench. | P10-S06, P10-S07 |

## Sequencing Rationale

- `P10-S01` lands first because every later story depends on a cleaner durability contract than the current split between graph state, plans, sessions, checkpoints, and handoffs.
- `P10-S02` follows because approval pauses and sandbox scopes need a durable thread to resume safely after operator intervention.
- `P10-S03` comes next so memory layering can anchor itself to the new thread model instead of preserving the current prompt-envelope sprawl.
- `P10-S04` builds on that memory foundation by adding a durable codebase knowledge source that later routing and verification can reuse.
- `P10-S05` lands after policy, memory, and indexing so routing can consider risk, context quality, and available helper evidence instead of only regex-style heuristics.
- `P10-S06` deepens verification once routing is explicit, so the coordinator can choose richer checks for the right moments without paying every cost on every turn.
- `P10-S07` turns the now-durable plan and policy contracts into true background execution, but keeps merge authority explicit and reviewable.
- `P10-S08` lands last because the job runtime and readiness dashboard should reflect the real execution, verification, and task systems instead of a speculative UI shell.

## Whole-Pack Success Signal

- Broad, multi-step work can pause, resume, recover, and continue from one durable execution thread instead of stitching together several partial persistence systems.
- Shipyard can explain why a risky action was allowed, blocked, or paused for approval, and those decisions are visible in runtime evidence.
- Prompt context stays bounded because stable rules, active-task details, failure notes, and repo knowledge are layered and retrieved intentionally.
- Planner and explorer no longer need to rediscover the same architecture facts every time a target changes or a broad request arrives.
- Routing and verification become inspectable artifacts with clear rationale, not only hidden coordinator prompt behavior.
- Operators can run isolated background tasks, review the evidence, and apply results intentionally instead of relying on one long foreground loop for every workflow.
- Preview, deploy, eval, indexing, and task activity appear as first-class jobs, and the workbench can show whether a target is truly "ready" for a heavier autonomous run.
