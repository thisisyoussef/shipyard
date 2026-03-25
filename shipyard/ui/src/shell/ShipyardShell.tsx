/**
 * ShipyardShell — Split-pane layout.
 * Art Deco Command · Lovable-style architecture.
 *
 * Two panels: conversation (left) + workspace (right).
 * Minimal header. No sidebars. No footer.
 */

import type { ReactNode } from "react";

export interface ShipyardShellProps {
  /** Content for the header bar */
  header: ReactNode;
  /** Left panel: conversation + composer */
  leftPanel: ReactNode;
  /** Right panel: workspace (preview/files/output) */
  rightPanel: ReactNode;
  /** Optional: drawer content for session/context (accessed via header) */
  drawer?: ReactNode;
  /** Whether the drawer is open */
  drawerOpen?: boolean;
  /** Close the drawer */
  onDrawerClose?: () => void;

  // Legacy props (kept for backward compat, mapped internally)
  leftSidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;
}

export function ShipyardShell({
  header,
  leftPanel,
  rightPanel,
  drawer,
  drawerOpen = false,
  onDrawerClose,
  // Legacy props — mapped for backward compat during migration
  leftSidebar,
  rightSidebar,
  children,
  footer,
}: ShipyardShellProps) {
  // If using legacy API (leftSidebar/children/rightSidebar), map to split pane
  const resolvedLeftPanel = leftPanel ?? children;
  const resolvedRightPanel = rightPanel ?? null;

  return (
    <div className="shipyard-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="shell-header" role="banner">
        {header}
      </header>

      <div className="shell-split-pane" id="main-content">
        {/* Left: Conversation */}
        <section className="shell-panel-left" aria-label="Conversation">
          {resolvedLeftPanel}
        </section>

        {/* Divider */}
        <div className="shell-divider" aria-hidden="true" />

        {/* Right: Workspace */}
        <section className="shell-panel-right" aria-label="Workspace">
          {resolvedRightPanel}
        </section>
      </div>

      {/* Drawer overlay for session/context/history */}
      {drawer ? (
        <>
          <div
            className="drawer-backdrop"
            data-visible={drawerOpen}
            onClick={onDrawerClose}
            aria-hidden="true"
          />
          <aside
            className="shell-drawer"
            data-open={drawerOpen}
            role="complementary"
            aria-label="Session details"
          >
            {leftSidebar}
            {rightSidebar}
          </aside>
        </>
      ) : null}

      {/* Legacy sidebar support — render hidden for tests */}
      {leftSidebar && !drawer ? (
        <aside
          className="shell-sidebar-left"
          role="complementary"
          aria-label="Session and context"
          data-collapsed="true"
          style={{ display: "none" }}
        >
          {leftSidebar}
        </aside>
      ) : null}
      {rightSidebar && !drawer ? (
        <aside
          className="shell-sidebar-right"
          role="complementary"
          aria-label="Files and output"
          data-collapsed="true"
          style={{ display: "none" }}
        >
          {rightSidebar}
        </aside>
      ) : null}

      {/* Footer — minimal, hidden by default in split-pane mode */}
      {footer ? (
        <footer className="shell-footer" role="contentinfo" style={{ display: "none" }}>
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
