/**
 * Shipyard Workbench — Root composition component.
 *
 * UIV2-S02 through S06: Decomposed from the original 1109-line
 * monolith into focused panel components composed here.
 */

import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  selectVisibleFileEvents,
  selectVisibleTurns,
  type ActivityScope,
} from "./activity-diff.js";
import { ActivityFeed } from "./ActivityFeed.js";
import { ComposerPanel } from "./ComposerPanel.js";
import { ContextPanel } from "./ContextPanel.js";
import { FilePanel } from "./FilePanel.js";
import { HeaderStrip } from "./HeaderStrip.js";
import type { BadgeTone } from "./primitives.js";
import { SessionPanel } from "./SessionPanel.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  SessionStateViewModel,
  TurnViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

/* ── Shared types ──────────────────────────── */

interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface ShipyardWorkbenchProps {
  sessionState: SessionStateViewModel | null;
  turns: TurnViewModel[];
  fileEvents: FileEventViewModel[];
  contextHistory: ContextReceiptViewModel[];
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  instruction: string;
  contextDraft: string;
  composerNotice: ComposerNotice | null;
  instructionInputRef: RefObject<HTMLTextAreaElement | null>;
  contextInputRef: RefObject<HTMLTextAreaElement | null>;
  onInstructionChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onInstructionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onContextKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClearContext: () => void;
  onSubmitInstruction: (event: FormEvent<HTMLFormElement>) => void;
  onRefreshStatus: () => void;
  onCopyTracePath: () => void;
  traceButtonLabel: string;
  /* Sidebar state from App */
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
}

/* ── Helpers ────────────────────────────────── */

function formatConnectionLabel(
  connectionState: WorkbenchConnectionState,
  hasSession: boolean,
): string {
  if (connectionState === "connecting" && hasSession) return "reconnecting";
  if (connectionState === "ready") return "connected";
  if (connectionState === "agent-busy") return "working";
  return connectionState;
}

function formatSurfaceState(
  connectionState: WorkbenchConnectionState,
  hasSession: boolean,
): WorkbenchConnectionState | "reconnecting" {
  if (connectionState === "connecting" && hasSession) return "reconnecting";
  return connectionState;
}

function getConnectionTone(
  state: WorkbenchConnectionState | "reconnecting",
): BadgeTone {
  if (state === "ready") return "success";
  if (state === "agent-busy") return "accent";
  if (state === "error" || state === "disconnected") return "danger";
  return "warning";
}

function formatWorkspaceLabel(workspaceDirectory: string): string {
  const segments = workspaceDirectory.split("/").filter(Boolean);
  return segments.at(-1) ?? workspaceDirectory;
}

/* ── Component ──────────────────────────────── */

export function ShipyardWorkbench(props: ShipyardWorkbenchProps) {
  const [activityScope, setActivityScope] = useState<ActivityScope>("latest");

  const hasSession = props.sessionState !== null;
  const surfaceState = formatSurfaceState(props.connectionState, hasSession);
  const connectionLabel = formatConnectionLabel(props.connectionState, hasSession);
  const connectionTone = getConnectionTone(surfaceState);

  const visibleTurns = selectVisibleTurns(props.turns, activityScope);
  const visibleFileEvents = selectVisibleFileEvents(
    props.fileEvents,
    visibleTurns,
    activityScope,
  );
  const hiddenTurnCount = Math.max(props.turns.length - visibleTurns.length, 0);
  const hiddenFileEventCount = Math.max(
    props.fileEvents.length - visibleFileEvents.length,
    0,
  );

  return (
    <div
      className="shell-layout"
      data-state={surfaceState}
      data-left-open={props.leftSidebarOpen}
      data-right-open={props.rightSidebarOpen}
    >
      {/* ── Header ─────────────────────────────── */}
      <HeaderStrip
        workspaceName={
          props.sessionState
            ? formatWorkspaceLabel(props.sessionState.workspaceDirectory)
            : "Shipyard"
        }
        targetPath={props.sessionState?.targetDirectory ?? ""}
        connectionLabel={connectionLabel}
        connectionTone={connectionTone}
        traceButtonLabel={props.traceButtonLabel}
        hasSession={hasSession}
        leftSidebarOpen={props.leftSidebarOpen}
        rightSidebarOpen={props.rightSidebarOpen}
        onToggleLeftSidebar={props.onToggleLeftSidebar}
        onToggleRightSidebar={props.onToggleRightSidebar}
        onCopyTracePath={props.onCopyTracePath}
        onRefreshStatus={props.onRefreshStatus}
      />

      {/* ── Left sidebar ───────────────────────── */}
      <aside
        className={`shell-sidebar shell-sidebar-left ${props.leftSidebarOpen ? "" : "shell-sidebar-collapsed"}`}
        aria-label="Session and context"
      >
        {props.leftSidebarOpen ? (
          <>
            <SessionPanel
              sessionState={props.sessionState}
              connectionState={props.connectionState}
              agentStatus={props.agentStatus}
              turnCount={props.turns.length}
            />
            <ContextPanel
              contextDraft={props.contextDraft}
              contextHistory={props.contextHistory}
              contextInputRef={props.contextInputRef}
              onContextChange={props.onContextChange}
              onContextKeyDown={props.onContextKeyDown}
              onClearContext={props.onClearContext}
            />
          </>
        ) : (
          <nav className="icon-rail" aria-label="Sidebar navigation">
            <button
              type="button"
              className="icon-rail-btn"
              aria-label="Session"
              onClick={props.onToggleLeftSidebar}
            >
              S
            </button>
            <button
              type="button"
              className="icon-rail-btn"
              aria-label="Context"
              onClick={props.onToggleLeftSidebar}
            >
              C
            </button>
          </nav>
        )}
      </aside>

      {/* ── Main content ───────────────────────── */}
      <main className="shell-main" role="main" aria-label="Agent activity">
        <ComposerPanel
          instruction={props.instruction}
          contextDraft={props.contextDraft}
          connectionState={props.connectionState}
          composerNotice={
            props.composerNotice as {
              tone: BadgeTone;
              title: string;
              detail: string;
            } | null
          }
          instructionInputRef={props.instructionInputRef}
          onInstructionChange={props.onInstructionChange}
          onSubmitInstruction={props.onSubmitInstruction}
          onInstructionKeyDown={props.onInstructionKeyDown}
        />

        <ActivityFeed
          turns={props.turns}
          activityScope={activityScope}
          onToggleScope={setActivityScope}
        />
      </main>

      {/* ── Right sidebar ──────────────────────── */}
      {props.rightSidebarOpen ? (
        <aside className="shell-sidebar shell-sidebar-right" aria-label="File activity">
          <FilePanel
            visibleFileEvents={visibleFileEvents}
            totalFileEventCount={props.fileEvents.length}
            hiddenFileEventCount={hiddenFileEventCount}
            activityScope={activityScope}
          />
        </aside>
      ) : null}

      {/* ── Footer ─────────────────────────────── */}
      <footer className="status-bar" role="contentinfo">
        <div className="status-current" data-state={surfaceState}>
          <span
            className="status-dot"
            data-tone={connectionTone}
            aria-hidden="true"
          />
          <div>
            <span className="micro-label">Current status</span>
            <strong aria-live="polite">{props.agentStatus}</strong>
          </div>
        </div>
        <div className="status-meta">
          <span>
            {props.sessionState?.discoverySummary ?? "No discovery data yet"}
          </span>
          <span>{props.sessionState?.tracePath ?? "Trace path pending"}</span>
        </div>
      </footer>
    </div>
  );
}
