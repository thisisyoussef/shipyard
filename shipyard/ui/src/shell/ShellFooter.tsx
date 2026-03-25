/**
 * ShellFooter — Status bar footer.
 * UIV3-S02 · Shell Layout
 *
 * Displays connection status, session ID, workspace path,
 * and agent status in a compact footer bar.
 */

import type { WorkbenchConnectionState } from "../view-models.js";

export interface ShellFooterProps {
  /** Current connection state */
  connectionState: WorkbenchConnectionState;
  /** Session ID (truncated display) */
  sessionId?: string;
  /** Workspace directory path */
  workspacePath?: string;
  /** Agent status text */
  agentStatus: string;
}

function getConnectionLabel(state: WorkbenchConnectionState): string {
  switch (state) {
    case "connecting":
      return "Connecting...";
    case "ready":
      return "Connected";
    case "agent-busy":
      return "Working";
    case "disconnected":
      return "Offline";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

function getTone(
  state: WorkbenchConnectionState,
): "success" | "accent" | "danger" | "neutral" {
  switch (state) {
    case "ready":
      return "success";
    case "agent-busy":
      return "accent";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

export function ShellFooter({
  connectionState,
  sessionId,
  workspacePath,
  agentStatus,
}: ShellFooterProps) {
  const connectionLabel = getConnectionLabel(connectionState);
  const tone = getTone(connectionState);

  // Extract folder name from path
  const workspaceFolder = workspacePath?.split("/").pop() ?? "...";

  return (
    <div className="shell-footer-bar">
      <div className="shell-footer-left">
        <span
          className="status-dot"
          data-tone={tone}
          aria-hidden="true"
          style={{
            width: "var(--status-size)",
            height: "var(--status-size)",
            borderRadius: "var(--radius-full)",
            backgroundColor:
              tone === "success"
                ? "var(--success-strong)"
                : tone === "accent"
                  ? "var(--accent-strong)"
                  : tone === "danger"
                    ? "var(--danger-strong)"
                    : "var(--text-muted)",
          }}
        />
        <span className="shell-footer-label">{connectionLabel}</span>
        {sessionId && (
          <span
            className="shell-footer-text"
            title={sessionId}
            style={{ maxWidth: "120px" }}
          >
            {sessionId.slice(0, 12)}...
          </span>
        )}
      </div>

      <div className="shell-footer-right">
        <span
          className="shell-footer-text"
          title={workspacePath}
          style={{ maxWidth: "200px" }}
        >
          {workspaceFolder}
        </span>
        <span className="shell-footer-label">{agentStatus}</span>
      </div>
    </div>
  );
}
