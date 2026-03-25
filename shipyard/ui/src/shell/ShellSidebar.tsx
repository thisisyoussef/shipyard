/**
 * ShellSidebar — Drawer content wrapper.
 * Art Deco Command · Conversation-First Layout
 *
 * Always renders children (drawer content is hidden via CSS
 * transform, not unmounting). IconRail is hidden in the
 * conversation-first layout.
 */

import type { ReactNode } from "react";

import { IconRail, type IconRailItem } from "./IconRail.js";

export interface ShellSidebarProps {
  /** Whether the sidebar/drawer is collapsed */
  collapsed: boolean;
  /** Icon rail items (hidden in conversation-first layout) */
  railItems: IconRailItem[];
  /** Drawer content — always rendered */
  children: ReactNode;
}

export function ShellSidebar({
  collapsed,
  railItems,
  children,
}: ShellSidebarProps) {
  return (
    <>
      {collapsed && railItems.length > 0 ? <IconRail items={railItems} /> : null}
      <div className="sidebar-content">{children}</div>
    </>
  );
}
