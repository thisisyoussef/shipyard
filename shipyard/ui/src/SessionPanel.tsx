/**
 * SessionPanel — progressive-disclosure session inspector.
 *
 * UIV2-S06 — Replaces the static session card with a collapsible
 * panel that shows a one-line status summary by default and expands
 * to reveal metadata, project signals, paths, and the session banner.
 */

import { useState } from "react";

import {
  Badge,
  MicroLabel,
  SectionHeader,
  StatusDot,
  SurfaceCard,
  type BadgeTone,
} from "./primitives.js";
import type {
  SessionStateViewModel,
  TurnViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

// ── Props ──────────────────────────────────────

export interface SessionPanelProps {
  sessionState: SessionStateViewModel | null;
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  turnCount: number;
}

// ── Helpers ────────────────────────────────────

interface SessionBannerModel {
  tone: BadgeTone;
  statusLabel: string;
  title: string;
  detail: string;
  hint: string;
  meta: Array<{ label: string; value: string; monospace?: boolean }>;
}

function formatTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Unknown";
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? isoTimestamp : date.toLocaleString();
}

function formatWorkspaceLabel(workspaceDirectory: string): string {
  const segments = workspaceDirectory.split("/").filter(Boolean);
  return segments.at(-1) ?? workspaceDirectory;
}

function getConnectionTone(
  connectionState: WorkbenchConnectionState,
  hasSession: boolean,
): BadgeTone {
  const surfaceState =
    connectionState === "connecting" && hasSession
      ? "reconnecting"
      : connectionState;

  if (surfaceState === "ready") return "success";
  if (surfaceState === "agent-busy") return "accent";
  if (surfaceState === "error" || surfaceState === "disconnected") return "danger";
  return "warning";
}

function buildBannerModel(
  sessionState: SessionStateViewModel | null,
  connectionState: WorkbenchConnectionState,
  agentStatus: string,
  turnCount: number,
): SessionBannerModel {
  if (!sessionState) {
    return {
      tone: "warning",
      statusLabel: "booting",
      title: "Connecting to Shipyard",
      detail: "Waiting for the browser runtime to publish the current local session.",
      hint: "Once connected, this banner will show the active session and recovery state.",
      meta: [],
    };
  }

  const meta = [
    { label: "Session", value: sessionState.sessionId, monospace: true },
    { label: "Workspace", value: sessionState.workspaceDirectory, monospace: true },
    { label: "Target", value: sessionState.targetDirectory, monospace: true },
    { label: "Turns", value: String(turnCount) },
    { label: "Last active", value: formatTimestamp(sessionState.lastActiveAt) },
  ];

  const surfaceState =
    connectionState === "connecting" ? "reconnecting" : connectionState;

  if (surfaceState === "reconnecting") {
    return {
      tone: "warning",
      statusLabel: "reconnecting",
      title: `Reconnecting to ${formatWorkspaceLabel(sessionState.workspaceDirectory)}`,
      detail: `Last known activity from ${formatTimestamp(sessionState.lastActiveAt)} is still visible.`,
      hint: "Shipyard will resume live updates when the connection returns.",
      meta,
    };
  }

  if (connectionState === "error") {
    return {
      tone: "danger",
      statusLabel: "attention",
      title: `${formatWorkspaceLabel(sessionState.workspaceDirectory)} needs attention`,
      detail: agentStatus || "An error was reported while keeping the last known state visible.",
      hint: "Review the latest step, refresh, or resend a narrower instruction.",
      meta,
    };
  }

  if (connectionState === "agent-busy") {
    return {
      tone: "accent",
      statusLabel: "live",
      title: `${formatWorkspaceLabel(sessionState.workspaceDirectory)} is streaming`,
      detail: `Shipyard is actively working through turn ${String(sessionState.turnCount)}.`,
      hint: "Use the latest-run filter to stay focused on the current turn.",
      meta,
    };
  }

  return {
    tone: "success",
    statusLabel: "stable",
    title: `Connected to ${formatWorkspaceLabel(sessionState.workspaceDirectory)}`,
    detail: `Last active ${formatTimestamp(sessionState.lastActiveAt)}.`,
    hint: "Paste context only when a spec or local rule should ride with the next turn.",
    meta,
  };
}

// ── Component ──────────────────────────────────

export function SessionPanel({
  sessionState,
  connectionState,
  agentStatus,
  turnCount,
}: SessionPanelProps) {
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [signalsExpanded, setSignalsExpanded] = useState(false);
  const [pathsExpanded, setPathsExpanded] = useState(false);

  const hasSession = sessionState !== null;
  const banner = buildBannerModel(sessionState, connectionState, agentStatus, turnCount);
  const tone = getConnectionTone(connectionState, hasSession);

  return (
    <SurfaceCard className="panel panel-session">
      {/* Status summary — always visible */}
      <div className="session-status-summary">
        <StatusDot tone={tone} />
        <span className="session-status-line">{banner.title}</span>
        <Badge tone={banner.tone}>{banner.statusLabel}</Badge>
      </div>

      {/* Session banner */}
      <div className="session-banner-compact" data-tone={banner.tone}>
        <p className="session-banner-detail">{banner.detail}</p>
        <p className="session-banner-hint">{banner.hint}</p>
      </div>

      {/* Expandable metadata */}
      {hasSession ? (
        <>
          <details
            className="session-disclosure"
            open={metadataExpanded}
            onToggle={(e) =>
              setMetadataExpanded((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className="session-disclosure-trigger">
              <SectionHeader
                kicker="Session"
                title="Metadata"
                meta={
                  <Badge tone="neutral">
                    {sessionState.turnCount} turns
                  </Badge>
                }
              />
            </summary>
            <dl className="fact-grid">
              <div>
                <dt>Session ID</dt>
                <dd><code>{sessionState.sessionId}</code></dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>{formatWorkspaceLabel(sessionState.workspaceDirectory)}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{sessionState.targetLabel}</dd>
              </div>
              <div>
                <dt>Discovery</dt>
                <dd>{sessionState.discoverySummary}</dd>
              </div>
              <div>
                <dt>Last active</dt>
                <dd>{formatTimestamp(sessionState.lastActiveAt)}</dd>
              </div>
            </dl>
          </details>

          <details
            className="session-disclosure"
            open={signalsExpanded}
            onToggle={(e) =>
              setSignalsExpanded((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className="session-disclosure-trigger">
              <MicroLabel>Project signals</MicroLabel>
            </summary>
            <ul className="signal-list">
              <li>{sessionState.discovery.projectName ?? "Unnamed project"}</li>
              <li>{sessionState.discovery.language ?? "Unknown language"}</li>
              <li>{sessionState.discovery.framework ?? "No framework detected"}</li>
              <li>
                {sessionState.projectRulesLoaded
                  ? "Project rules loaded"
                  : "No AGENTS.md loaded"}
              </li>
            </ul>

            {Object.keys(sessionState.discovery.scripts).length > 0 ? (
              <div className="session-meta-block">
                <MicroLabel>Available scripts</MicroLabel>
                <ul className="script-list">
                  {Object.entries(sessionState.discovery.scripts).map(
                    ([name, command]) => (
                      <li key={name}>
                        <code>{name}</code>
                        <span>{command}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ) : null}
          </details>

          <details
            className="session-disclosure"
            open={pathsExpanded}
            onToggle={(e) =>
              setPathsExpanded((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className="session-disclosure-trigger">
              <MicroLabel>Paths</MicroLabel>
            </summary>
            <ul className="signal-list">
              <li><code>{sessionState.workspaceDirectory}</code></li>
              <li><code>{sessionState.targetDirectory}</code></li>
            </ul>
          </details>
        </>
      ) : (
        <p className="empty-copy">
          Waiting for Shipyard to publish the session bridge.
        </p>
      )}
    </SurfaceCard>
  );
}
