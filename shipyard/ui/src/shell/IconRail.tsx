/**
 * IconRail — 48px collapsed sidebar with icon buttons.
 * UIV3-S02 · Shell Layout
 *
 * Shows icon buttons when sidebar is collapsed.
 * Each icon has a tooltip on hover.
 */

import type { ReactNode } from "react";

export interface IconRailItem {
  /** Unique identifier */
  id: string;
  /** Icon element (SVG) */
  icon: ReactNode;
  /** Tooltip label */
  label: string;
  /** Whether this item is active */
  active?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export interface IconRailProps {
  /** Rail items to display */
  items: IconRailItem[];
}

export function IconRail({ items }: IconRailProps) {
  return (
    <nav className="icon-rail" aria-label="Sidebar navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="icon-rail-btn"
          title={item.label}
          aria-label={item.label}
          data-active={item.active ?? false}
          onClick={item.onClick}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}
