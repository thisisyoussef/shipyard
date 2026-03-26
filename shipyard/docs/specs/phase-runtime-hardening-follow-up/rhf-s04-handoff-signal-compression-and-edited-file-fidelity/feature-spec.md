# Feature Spec

## Metadata
- Story ID: RHF-S04
- Story Title: Handoff Signal Compression and Edited-File Fidelity
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

The handoff system exists to let long turns resume safely, but its current payload wastes budget on low-value prose and drops too many useful file paths. `completedWork` copies the full task goal text, while `touchedFiles` is built mostly from plan targets plus `lastEditedFile`, which can miss much of the actual edited set from a long turn. That already-weak handoff is then compressed into a `1_500` character envelope budget, making it far less useful than the rolling summary it was supposed to replace.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: make handoffs concise enough to survive the envelope budget.
- Objective 2: keep all edited or created file paths that matter for the next continuation turn.
- Objective 3: prioritize concrete continuation evidence over copied prose.
- How this story or pack contributes to the overall objective set: Stronger handoffs are the prerequisite for turning long-loop thresholds into resumable continuation instead of hard failure.

## User Stories
- As a resumed Shipyard turn, I want the handoff to tell me which files were actually touched and what work remains without wasting the whole budget on copied goal text.
- As an operator, I want a continuation to pick up from a useful checkpoint instead of losing the important file list and evaluation context.

## Acceptance Criteria
- [ ] AC-1: `completedWork` uses a short goal summary or turn summary instead of copying the full task goal text verbatim.
- [ ] AC-2: `touchedFiles` persists all edited or created file paths observed during the turn, plus retry or blocked-file evidence that still matters for continuation.
- [ ] AC-3: Envelope serialization prioritizes touched files, remaining work, latest evaluation, and next recommended action within the handoff budget, truncating low-value prose first.
- [ ] AC-4: Existing handoff artifacts remain readable, or a safe compatibility path is documented if the serialized shape changes.
- [ ] AC-5: Tests prove a long write-heavy turn still yields a useful handoff under the current serialized handoff budget.

## Edge Cases
- Multi-file turns can create dozens of paths that need stable ordering and bounded truncation.
- A turn may edit files without updating `lastEditedFile` for each one, so handoff path collection must not depend on a single field.
- Failed verification should still surface the most relevant file paths and summary.
- Older persisted handoffs should not become unreadable if new summary fields are added.

## Non-Functional Requirements
- Reliability: continuation should have a deterministic file list and concise summary.
- Performance: stronger handoffs should not increase overall envelope size.
- Observability: persisted handoff artifacts should make it obvious why a continuation was emitted.
- Maintainability: file-path collection should reuse existing tool-execution evidence rather than inventing a second partial tracker.

## Out of Scope
- Changing the broader `TaskPlan` model.
- Automatic continuation behavior; that belongs in `RHF-S05`.
- Dynamic acting-iteration budgets; that belongs in `RHF-S07`.

## Done Definition
- Persisted handoffs stay within budget while carrying the edited-file evidence and concise continuation summary that the next turn actually needs.
