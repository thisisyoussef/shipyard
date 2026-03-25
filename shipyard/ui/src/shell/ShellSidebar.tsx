/**
 * ShellSidebar — Collapsible sidebar wrapper.
 * UIV3-S02 · Shell Layout
 *
 * Wraps sidebar content with collapse/expand behavior.
 * Shows IconRail when collapsed, full content when expanded.
 */

import type { ReactNode } from "react";

import { IconRail, type IconRailItem } from "./IconRail.js";

export interface ShellSidebarProps {
  /** Whether the sidebar is collapsed */
  collapsed: boolean;
  /** Icon rail items shown when collapsed */
  railItems: IconRailItem[];
  /** Full content shown when expanded */
  children: ReactNode;
}

export function ShellSidebar({
  collapsed,
  railItems,
  children,
}: ShellSidebarProps) {
  if (collapsed) {
    return <IconRail items={railItems} />;
  }

  return <div className="sidebar-content">{children}</div>;
}
