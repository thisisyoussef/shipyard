/**
 * SessionPanel — Session info display.
 * UIV3-S07 · Session/Context Panels
 *
 * Shows session metadata: target, workspace, discovery info.
 */

import { Badge } from "../primitives.js";
import type { SessionStateViewModel } from "../view-models.js";

/* ── Props ──────────────────────────────────────── */

export interface SessionPanelProps {
  /** Session state data */
  session: SessionStateViewModel | null;
}

/* ── Component ──────────────────────────────────── */

export function SessionPanel({ session }: SessionPanelProps) {
  if (!session) {
    return (
      <div className="session-panel">
        <p className="panel-kicker">Session</p>
        <h2 className="panel-title">No active session</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          Connect to start a session.
        </p>
      </div>
    );
  }

  return (
    <div className="session-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Session</p>
          <h2 className="panel-title">{session.targetLabel}</h2>
        </div>
        <Badge tone="success">{session.turnCount} turns</Badge>
      </div>

      <div className="session-meta">
        <div className="session-meta-item">
          <span className="session-meta-label">Target</span>
          <code className="session-meta-value" title={session.targetDirectory}>
            {session.targetDirectory}
          </code>
        </div>

        <div className="session-meta-item">
          <span className="session-meta-label">Workspace</span>
          <code
            className="session-meta-value"
            title={session.workspaceDirectory}
          >
            {session.workspaceDirectory}
          </code>
        </div>

        {session.discoverySummary && (
          <div className="session-meta-item">
            <span className="session-meta-label">Project</span>
            <span className="session-meta-value">
              {session.discoverySummary}
            </span>
          </div>
        )}

        {session.sessionId && (
          <div className="session-meta-item">
            <span className="session-meta-label">Session ID</span>
            <code className="session-meta-value" title={session.sessionId}>
              {session.sessionId.slice(0, 16)}...
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
