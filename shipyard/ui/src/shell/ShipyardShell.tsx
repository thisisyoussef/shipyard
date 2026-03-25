/**
 * ShipyardShell — Root CSS Grid layout component.
 * UIV3-S02 · Shell Layout
 *
 * Provides the spatial skeleton with named grid areas:
 * header, left sidebar, main, right sidebar, footer.
 */

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export interface ShipyardShellProps {
  /** Content for the header area */
  header: ReactNode;
  /** Content for the left sidebar */
  leftSidebar: ReactNode;
  /** Content for the main area */
  children: ReactNode;
  /** Content for the right sidebar */
  rightSidebar: ReactNode;
  /** Content for the footer area */
  footer: ReactNode;
  /** Whether left sidebar is collapsed */
  leftCollapsed?: boolean;
  /** Whether right sidebar is collapsed */
  rightCollapsed?: boolean;
  /** Callback when left sidebar collapse state changes */
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  /** Callback when right sidebar collapse state changes */
  onRightCollapsedChange?: (collapsed: boolean) => void;
}

const STORAGE_KEY = "shipyard:sidebar-state";

interface SidebarState {
  left: "expanded" | "collapsed";
  right: "expanded" | "collapsed";
}

function loadSidebarState(): SidebarState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SidebarState;
    }
  } catch {
    // Ignore parse errors
  }
  return { left: "expanded", right: "expanded" };
}

function saveSidebarState(state: SidebarState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function ShipyardShell({
  header,
  leftSidebar,
  children,
  rightSidebar,
  footer,
  leftCollapsed: leftCollapsedProp,
  rightCollapsed: rightCollapsedProp,
  onLeftCollapsedChange,
  onRightCollapsedChange,
}: ShipyardShellProps) {
  // Internal state, synced with localStorage
  const [internalState, setInternalState] = useState<SidebarState>({
    left: "expanded",
    right: "expanded",
  });

  // Load persisted state on mount
  useEffect(() => {
    const stored = loadSidebarState();
    setInternalState(stored);
  }, []);

  // Determine actual collapsed state (props override internal state)
  const leftCollapsed = leftCollapsedProp ?? internalState.left === "collapsed";
  const rightCollapsed =
    rightCollapsedProp ?? internalState.right === "collapsed";

  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + B - Toggle left sidebar
      if (modKey && event.key === "b" && !event.shiftKey) {
        event.preventDefault();
        const newLeftState: "expanded" | "collapsed" = leftCollapsed
          ? "expanded"
          : "collapsed";
        setInternalState((prev) => {
          const updated: SidebarState = { ...prev, left: newLeftState };
          saveSidebarState(updated);
          return updated;
        });
        onLeftCollapsedChange?.(!leftCollapsed);
      }

      // Cmd/Ctrl + Shift + B - Toggle right sidebar
      if (modKey && event.key === "b" && event.shiftKey) {
        event.preventDefault();
        const newRightState: "expanded" | "collapsed" = rightCollapsed
          ? "expanded"
          : "collapsed";
        setInternalState((prev) => {
          const updated: SidebarState = { ...prev, right: newRightState };
          saveSidebarState(updated);
          return updated;
        });
        onRightCollapsedChange?.(!rightCollapsed);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    leftCollapsed,
    rightCollapsed,
    onLeftCollapsedChange,
    onRightCollapsedChange,
  ]);

  return (
    <div
      className="shipyard-shell"
      data-left-collapsed={leftCollapsed}
      data-right-collapsed={rightCollapsed}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="shell-header" role="banner">
        {header}
      </header>

      <aside
        className="shell-sidebar-left"
        role="complementary"
        aria-label="Session and context"
        data-collapsed={leftCollapsed}
      >
        {leftSidebar}
      </aside>

      <main id="main-content" className="shell-main" role="main">
        {children}
      </main>

      <aside
        className="shell-sidebar-right"
        role="complementary"
        aria-label="Activity feed"
        data-collapsed={rightCollapsed}
      >
        {rightSidebar}
      </aside>

      <footer className="shell-footer" role="contentinfo">
        {footer}
      </footer>
    </div>
  );
}
