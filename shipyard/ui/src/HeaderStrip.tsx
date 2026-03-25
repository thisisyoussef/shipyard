/**
 * HeaderStrip — compact 48px header bar.
 *
 * UIV2-S02 — Replaces the oversized top-bar with a dense, scannable
 * strip containing workspace identity, connection status, and quick
 * actions. Sidebar toggle buttons include keyboard shortcut hints.
 */

import { Badge, MicroLabel, StatusDot, type BadgeTone } from "./primitives.js";

// ── Props ──────────────────────────────────────

export interface HeaderStripProps {
  workspaceName: string;
  targetPath: string;
  connectionLabel: string;
  connectionTone: BadgeTone;
  traceButtonLabel: string;
  hasSession: boolean;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onCopyTracePath: () => void;
  onRefreshStatus: () => void;
}

// ── Component ──────────────────────────────────

export function HeaderStrip({
  workspaceName,
  targetPath,
  connectionLabel,
  connectionTone,
  traceButtonLabel,
  hasSession,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onCopyTracePath,
  onRefreshStatus,
}: HeaderStripProps) {
  return (
    <header className="header-strip" role="banner">
      {/* Logo + workspace identity */}
      <div className="header-strip-identity">
        <div className="header-strip-logo" aria-hidden="true" />
        <span className="header-strip-workspace" title={workspaceName}>
          {workspaceName}
        </span>
        <span className="header-strip-separator" aria-hidden="true">
          /
        </span>
        <code className="header-strip-target" title={targetPath}>
          {targetPath}
        </code>
      </div>

      {/* Connection + actions */}
      <div className="header-strip-actions">
        <Badge
          className="header-strip-connection"
          tone={connectionTone}
          aria-label={`Connection status: ${connectionLabel}`}
        >
          <StatusDot tone={connectionTone} />
          {connectionLabel}
        </Badge>

        <div className="header-strip-buttons" role="toolbar" aria-label="Quick actions">
          <button
            type="button"
            className="header-strip-btn"
            onClick={onCopyTracePath}
            disabled={!hasSession}
            title="Copy trace path"
          >
            <TraceIcon />
            <span className="header-strip-btn-label">{traceButtonLabel}</span>
          </button>

          <button
            type="button"
            className="header-strip-btn"
            onClick={onRefreshStatus}
            title="Refresh session"
          >
            <RefreshIcon />
            <span className="header-strip-btn-label">Refresh</span>
          </button>

          <span className="header-strip-divider" aria-hidden="true" />

          <button
            type="button"
            className="header-strip-btn"
            onClick={onToggleLeftSidebar}
            aria-pressed={leftSidebarOpen}
            aria-label="Toggle left sidebar"
            title="Toggle left sidebar (Cmd+B)"
          >
            <SidebarLeftIcon />
            <MicroLabel>
              {leftSidebarOpen ? "Hide" : "Show"}
            </MicroLabel>
          </button>

          <button
            type="button"
            className="header-strip-btn"
            onClick={onToggleRightSidebar}
            aria-pressed={rightSidebarOpen}
            aria-label="Toggle right sidebar"
            title="Toggle right sidebar (Cmd+Shift+B)"
          >
            <SidebarRightIcon />
            <MicroLabel>
              {rightSidebarOpen ? "Hide" : "Show"}
            </MicroLabel>
          </button>
        </div>
      </div>
    </header>
  );
}

// ── Inline SVG icons (no external deps) ────────

function TraceIcon() {
  return (
    <svg
      className="header-strip-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3h10v10H3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M6 6h4M6 8h4M6 10h2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      className="header-strip-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13 2v3h-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarLeftIcon() {
  return (
    <svg
      className="header-strip-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SidebarRightIcon() {
  return (
    <svg
      className="header-strip-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line x1="10" y1="3" x2="10" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
