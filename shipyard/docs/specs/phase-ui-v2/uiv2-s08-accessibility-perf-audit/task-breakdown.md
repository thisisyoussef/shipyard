# Task Breakdown

## Story
- Story ID: UIV2-S08
- Story Title: Accessibility and Performance Audit

## Execution Notes
- This is a pure audit-and-fix story. Do not add features.
- Fix findings in the component where they originate — do not patch around issues in a central location.
- If a fix would require a significant design change (e.g., restructuring a component's DOM), document it as a known limitation in the checklist rather than making a risky change in an audit story.
- Run all validation commands after every fix batch to avoid regressions.
- The `user-audit-checklist.md` is a deliverable of this story, not an afterthought — allocate time for it.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Run `audit` skill across all UI components. Capture findings in a temporary working document categorized by severity (high/medium/low) and type (accessibility/performance/design). | none | yes | findings document created |
| T002 | Run `fixing-accessibility` skill. Fix all high and medium findings: missing accessible names, contrast failures, focus order issues, missing ARIA attributes, color-only indicators. Verify fixes do not break existing tests. | blocked-by:T001 | no | `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck` |
| T003 | Run `fixing-motion-performance` skill. Fix any layout-triggering animations (replace with compositor-only equivalents). Verify skeleton → content transitions reserve space (no CLS). Test under 4x CPU throttle. | blocked-by:T001 | yes (parallel with T002) | `pnpm --dir shipyard build`, DevTools Performance panel |
| T004 | Run `critique` skill for final design evaluation. Address findings that score below 7 on any dimension: fix spacing inconsistencies, typography misuse, color token violations, density imbalances. | blocked-by:T002,T003 | no | visual review, `pnpm --dir shipyard build` |
| T005 | Create `user-audit-checklist.md` in `shipyard/docs/specs/phase-ui-v2/`. Document every check performed (accessibility, performance, design, bundle size), result (pass/fail), and remediation notes for known limitations or deferred items. | blocked-by:T004 | no | file exists and is complete |
| T006 | Final validation pass. Run all validation commands. Verify all existing tests pass. Verify bundle size within budget (CSS < 50KB, JS < 350KB gzipped). Verify `git diff --check` is clean. | blocked-by:T005 | no | `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`, `pnpm --dir shipyard build`, `git diff --check` |

## Completion Criteria

- All high and medium accessibility issues are resolved.
- All animations are compositor-only with no jank.
- No layout shift on load or state change.
- Design critique scores 7+ on all dimensions.
- Bundle size within budget.
- `user-audit-checklist.md` is complete and documents all verification results.
- All existing tests pass, typecheck is clean, build succeeds, no whitespace issues.
