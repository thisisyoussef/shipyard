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
- **Context**: Phase 8 needs spec-driven planning without depending on pasted context or overloading generic file reads.
- **Decision**: Add a dedicated read-only `load_spec` tool that returns named, bounded spec documents instead of folding raw spec loading into `read_file` or `rollingSummary`.
- **Alternatives Considered**: Reuse `read_file` alone; tell operators to keep pasting briefs manually.
- **Consequences**: Spec-driven stories can reuse stable `spec:` refs and bounded tool output, while later plan/task stories can build on that contract without inventing another spec-loading path.

- **ADR-ID**: ADR-0005
- **Date**: 2026-03-25
- **Context**: The harness already used a Claude-first bridge for design briefs, but later UI implementation and QA phases had no equivalent scripted delegate and no reversible switch for trying Claude there.
- **Decision**: Add a flag-gated `scripts/run-ui-phase-bridge.mjs` entrypoint for UI implementation, QA, critic, and final polish. The flag only changes provider routing; the phase prompts must preserve the exact Codex skill chain for each phase.
- **Alternatives Considered**: Keep later phases manual only; make all later UI phases Claude-first unconditionally; define a separate Claude-only skill chain.
- **Consequences**: The repo can trial Claude in later UI phases without changing the workflow contract, and turning the flag off returns those scripted bridges to a Codex-first path.
