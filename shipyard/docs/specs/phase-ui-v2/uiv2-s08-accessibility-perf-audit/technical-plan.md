# Technical Plan

## Metadata
- Story ID: UIV2-S08
- Story Title: Accessibility and Performance Audit
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected (potentially — depending on audit findings):
  - `shipyard/ui/src/styles.css` — contrast fixes, focus styles, animation corrections
  - `shipyard/ui/src/tokens.css` — color token adjustments if contrast fails
  - `shipyard/ui/src/primitives.tsx` — accessible names, ARIA attributes
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — focus order, layout shift fixes
  - `shipyard/ui/src/DiffViewer.tsx` — accessible labels on diff controls
  - `shipyard/ui/src/FileTree.tsx` — tree keyboard navigation, ARIA
  - `shipyard/ui/src/SessionPanel.tsx` — collapsible section ARIA
  - `shipyard/ui/src/ContextPanel.tsx` — input labeling, timeline ARIA
  - All components from S01–S07 are in scope for fixes

- Public interfaces/contracts: No changes expected. This is a fix/polish pass, not a feature addition.

- Data flow summary: No data flow changes. All work is in the presentation/accessibility layer.

## Implementation Notes

### Accessibility Audit Process
1. **Automated scan**: Run `fixing-accessibility` skill which checks:
   - Missing accessible names on interactive elements
   - Color contrast ratios below AA thresholds
   - Missing ARIA attributes on custom widgets (tree, accordion, tabs)
   - Focus order mismatches
   - Missing `alt` text on images/icons
2. **Manual keyboard walkthrough**: Tab through the entire UI and verify:
   - Focus is visible on every interactive element
   - Focus order matches visual layout (left→right, top→bottom)
   - All functionality is reachable without a mouse
   - Escape closes modals/popovers, Enter/Space activates buttons
3. **Screen reader spot check**: Verify key flows announce correctly:
   - Session status announcement
   - Activity feed turn navigation
   - Diff file tree navigation
   - Context injection submission

### Performance Audit Process
1. **Animation audit**: Run `fixing-motion-performance` skill:
   - Verify all animations use `transform` and `opacity` only
   - Check for layout-triggering properties in transitions (`width`, `height`, `top`, `left`, `margin`, `padding`)
   - Test under 4x CPU throttle — no dropped frames
2. **Layout shift audit**:
   - Check skeleton → content transitions reserve correct dimensions
   - Check dynamic content (activity feed, context history) does not shift existing content
   - Measure CLS via Performance panel — target < 0.1
3. **Bundle size audit**:
   - Run `pnpm --dir shipyard build` and check output sizes
   - CSS gzipped < 50KB, JS gzipped < 350KB
   - Identify any unexpectedly large modules

### Design Critique Process
1. Run `critique` skill for holistic design evaluation.
2. Check for inconsistencies across stories:
   - Spacing rhythm (are all gaps multiples of the 4px grid?)
   - Typography usage (are headings, body, mono used consistently?)
   - Color usage (are tokens used consistently, no hardcoded colors?)
   - Density (are panels appropriately dense/sparse for their content type?)
3. Address findings that score below 7 on any dimension.

### User Audit Checklist
Create `shipyard/docs/specs/phase-ui-v2/user-audit-checklist.md` with:
- Checklist of all verification items (accessibility, performance, design, bundle)
- Result for each item (pass/fail/known-limitation)
- Remediation notes for any items deferred to future stories

## Test Strategy

- Primary: All existing tests must pass (`pnpm --dir shipyard test`).
- Typecheck: No new type errors (`pnpm --dir shipyard typecheck`).
- Build: Clean build with size within budget (`pnpm --dir shipyard build`).
- Git: No whitespace issues (`git diff --check`).
- Manual: Keyboard walkthrough, screen reader spot check, CPU-throttled animation check.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
