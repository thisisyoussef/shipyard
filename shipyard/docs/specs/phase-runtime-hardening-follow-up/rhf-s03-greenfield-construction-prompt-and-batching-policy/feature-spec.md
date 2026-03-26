# Feature Spec

## Metadata
- Story ID: RHF-S03
- Story Title: Greenfield Construction Prompt and Batching Policy
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Runtime hardening follow-up supplemental pack

## Problem Statement

The code-phase system prompt still tells Shipyard to always read a file before editing it and to switch back to `read_file` plus `edit_block` once files exist. That is the right rule for modifying existing files, but it is too conservative for greenfield app construction where most files are brand new. The prompt also still says "Return small typed artifacts," which no longer matches how the coordinator and acting loop actually operate.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: distinguish safe new-file creation from existing-file modification.
- Objective 2: reduce unnecessary rereads during greenfield app construction.
- Objective 3: align the prompt with the current acting-loop contract.
- How this story or pack contributes to the overall objective set: This story removes a prompt-level source of the reread spiral so the runtime can use the healthier history path effectively during app creation.

## User Stories
- As Shipyard in greenfield mode, I want to create coherent batches of new modules directly so I do not waste turns rereading files that do not yet need surgical edits.
- As an operator, I want existing files to remain protected by read-before-edit rules while brand-new files can still be created efficiently.

## Acceptance Criteria
- [ ] AC-1: The code-phase prompt explicitly distinguishes "read before modifying an existing file" from "direct `write_file` is allowed for a net-new file."
- [ ] AC-2: After bootstrap or during broad greenfield construction, the prompt explicitly encourages batching coherent new-file writes when that reduces unnecessary loop churn.
- [ ] AC-3: Existing-file edits still route through `read_file` plus `edit_block`, and the verifier handoff guidance remains intact.
- [ ] AC-4: The stale "Return small typed artifacts" instruction is removed or replaced with text that matches the current coordinator and acting-loop behavior.
- [ ] AC-5: Prompt-contract tests or focused runtime tests cover mixed turns that create new files and later modify existing ones.

## Edge Cases
- Mixed turns may need both direct `write_file` for new modules and anchored edits for existing files.
- A file can start as new in one turn and require `read_file` before modification in a later turn.
- Prompt relaxation should not encourage blind rewrites of existing files.
- Bootstrap-generated files and one-off net-new files should both follow the same new-file rule.

## Non-Functional Requirements
- Reliability: prompt changes must preserve existing-file guardrails.
- Performance: greenfield runs should require fewer redundant reads before the first meaningful app files appear.
- Maintainability: prompt guidance should match real runtime behavior instead of preserving stale instructions.
- Observability: tests should make the intended tool-choice contract explicit.

## Out of Scope
- Changing the underlying file tools or edit guardrails.
- Auto-planning or routing changes beyond prompt guidance.
- Dynamic acting-iteration budgets; that belongs in `RHF-S07`.

## Done Definition
- Shipyard's code-phase prompt allows efficient new-file creation in greenfield builds without weakening the read-before-edit protections for existing files.
