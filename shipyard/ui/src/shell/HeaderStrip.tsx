/**
 * HeaderStrip — 48px fixed header with brand, workspace, connection, actions.
 * UIV3-S03 · Header Strip
 *
 * Compact header bar with brand mark, workspace/target breadcrumb,
 * connection badge, and icon action buttons.
 */

import type { ReactNode } from "react";

import type { BadgeTone } from "../primitives.js";
import { Badge, StatusDot } from "../primitives.js";
import type { WorkbenchConnectionState } from "../view-models.js";

/* ── Icons (inline SVG) ──────────────────────────── */

function ClipboardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SidebarLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function SidebarRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </svg>
  );
}

/* ── Props ──────────────────────────────────────── */

export interface HeaderStripProps {
  /** Workspace folder name (last segment of path) */
  workspaceName?: string;
  /** Full workspace path (for tooltip) */
  workspacePath?: string;
  /** Target folder name (last segment of path) */
  targetName?: string;
  /** Full target path (for tooltip) */
  targetPath?: string;
  /** Current connection state */
  connectionState: WorkbenchConnectionState;
  /** Custom brand element (optional) */
  brandElement?: ReactNode;
  /** Whether left sidebar is expanded */
  leftSidebarOpen: boolean;
  /** Whether right sidebar is expanded */
  rightSidebarOpen: boolean;
  /** Whether to render the right sidebar toggle */
  showRightToggle?: boolean;
  /** Callback when trace path copy is clicked */
  onCopyTracePath: () => void;
  /** Callback when refresh is clicked */
  onRefresh: () => void;
  /** Callback when left sidebar toggle is clicked */
  onToggleLeftSidebar: () => void;
  /** Callback when right sidebar toggle is clicked */
  onToggleRightSidebar: () => void;
  /** Trace button label (for accessibility) */
  traceButtonLabel?: string;
}

/* ── Connection state helpers ───────────────────── */

function getConnectionLabel(state: WorkbenchConnectionState): string {
  switch (state) {
    case "connecting":
      return "connecting";
    case "ready":
      return "connected";
    case "agent-busy":
      return "working";
    case "disconnected":
      return "offline";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

function getConnectionTone(state: WorkbenchConnectionState): BadgeTone {
  switch (state) {
    case "ready":
      return "success";
    case "agent-busy":
      return "accent";
    case "error":
    case "disconnected":
      return "danger";
    default:
      return "neutral";
  }
}

/* ── Component ──────────────────────────────────── */

export function HeaderStrip({
  workspaceName,
  workspacePath,
  targetName,
  targetPath,
  connectionState,
  brandElement,
  leftSidebarOpen,
  rightSidebarOpen,
  showRightToggle = true,
  onCopyTracePath,
  onRefresh,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  traceButtonLabel = "Copy trace path",
}: HeaderStripProps) {
  const connectionLabel = getConnectionLabel(connectionState);
  const connectionTone = getConnectionTone(connectionState);
  const showPulse =
    connectionState === "agent-busy" || connectionState === "connecting";

  return (
    <div className="header-strip">
      {/* Brand */}
      <div className="header-brand">
        {brandElement ?? (
          <>
            <div className="header-brand-mark" aria-hidden="true">
              S
            </div>
            <span className="header-wordmark">SHIPYARD</span>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="header-divider" aria-hidden="true" />

      {/* Location breadcrumb */}
      <nav className="header-location" aria-label="Current location">
        <span
          className="header-workspace"
          title={workspacePath}
        >
          {workspaceName ?? "..."}
        </span>
        <span className="header-separator" aria-hidden="true">
          /
        </span>
        <span className="header-target" title={targetPath}>
          {targetName ?? "..."}
        </span>
      </nav>

      {/* Spacer */}
      <div className="header-spacer" />

      {/* Connection badge */}
      <Badge
        tone={connectionTone}
        role="status"
        aria-live="polite"
        aria-label={`Connection status: ${connectionLabel}`}
        className="header-connection-badge"
      >
        <StatusDot tone={connectionTone} pulse={showPulse} />
        <span className="header-connection-label">{connectionLabel}</span>
      </Badge>

      {/* Action buttons */}
      <div className="header-actions">
        <button
          type="button"
          className="header-icon-btn"
          title={traceButtonLabel}
          aria-label={traceButtonLabel}
          onClick={onCopyTracePath}
        >
          <ClipboardIcon />
        </button>

        <button
          type="button"
          className="header-icon-btn"
          title="Refresh session"
          aria-label="Refresh session"
          onClick={onRefresh}
        >
          <RefreshIcon />
        </button>

        <button
          type="button"
          className="header-icon-btn"
          title={leftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label="Toggle sidebar"
          aria-expanded={leftSidebarOpen}
          aria-controls="sidebar-left"
          data-active={leftSidebarOpen}
          onClick={onToggleLeftSidebar}
        >
          <SidebarLeftIcon />
        </button>

        {showRightToggle ? (
          <button
            type="button"
            className="header-icon-btn"
            title={rightSidebarOpen ? "Hide activity" : "Show activity"}
            aria-label="Toggle activity panel"
            aria-expanded={rightSidebarOpen}
            aria-controls="sidebar-right"
            data-active={rightSidebarOpen}
            onClick={onToggleRightSidebar}
          >
            <SidebarRightIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
