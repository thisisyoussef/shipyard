import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  buildActivityBlocks,
  buildDiffPreview,
  selectVisibleFileEvents,
  selectVisibleTurns,
  type ActivityScope,
} from "./activity-diff.js";
import {
  buildTextPreview,
  DEFAULT_VISIBLE_CONTEXT_RECEIPTS,
} from "./context-ui.js";
import {
  Badge,
  MicroLabel,
  SectionHeader,
  StatusDot,
  SurfaceCard,
  type BadgeTone,
} from "./primitives.js";
import type {
  ContextReceiptViewModel,
  FileEventViewModel,
  SessionStateViewModel,
  TurnViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

interface ComposerNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

interface ShipyardWorkbenchProps {
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
}

interface SessionBannerModel {
  tone: BadgeTone;
  statusLabel: string;
  title: string;
  detail: string;
  hint: string;
  meta: Array<{
    label: string;
    value: string;
    monospace?: boolean;
  }>;
}

function formatConnectionLabel(
  connectionState: WorkbenchConnectionState,
  hasSession: boolean,
): string {
  if (connectionState === "connecting" && hasSession) {
    return "reconnecting";
  }

  if (connectionState === "ready") {
    return "connected";
  }

  if (connectionState === "agent-busy") {
    return "working";
  }

  return connectionState;
}

function formatSurfaceState(
  connectionState: WorkbenchConnectionState,
  hasSession: boolean,
): WorkbenchConnectionState | "reconnecting" {
  if (connectionState === "connecting" && hasSession) {
    return "reconnecting";
  }

  return connectionState;
}

function formatTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "Unknown";
  }

  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? isoTimestamp : date.toLocaleString();
}

function formatWorkspaceLabel(workspaceDirectory: string): string {
  const segments = workspaceDirectory.split("/").filter(Boolean);
  return segments.at(-1) ?? workspaceDirectory;
}

function handleTextareaChange(
  event: ChangeEvent<HTMLTextAreaElement>,
  onChange: (value: string) => void,
): void {
  onChange((event.currentTarget as HTMLTextAreaElement).value);
}

function getConnectionTone(
  state: WorkbenchConnectionState | "reconnecting",
): BadgeTone {
  if (state === "ready") {
    return "success";
  }

  if (state === "agent-busy") {
    return "accent";
  }

  if (state === "error" || state === "disconnected") {
    return "danger";
  }

  return "warning";
}

function getTurnTone(status: TurnViewModel["status"]): BadgeTone {
  if (status === "success") {
    return "success";
  }

  if (status === "error") {
    return "danger";
  }

  if (status === "working") {
    return "accent";
  }

  return "neutral";
}

function getFileEventTone(status: FileEventViewModel["status"]): BadgeTone {
  if (status === "success") {
    return "success";
  }

  if (status === "error") {
    return "danger";
  }

  if (status === "diff" || status === "running") {
    return "accent";
  }

  return "neutral";
}

function getTurnOrdinal(
  turnId: string,
  fallback: number,
): number {
  const match = turnId.match(/(\d+)$/);

  if (!match) {
    return fallback;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatScopeLabel(scope: ActivityScope): string {
  return scope === "latest" ? "Latest run" : "All runs";
}

function createHiddenFileEventCopy(
  scope: ActivityScope,
  hiddenFileEventCount: number,
): string {
  if (scope === "latest" && hiddenFileEventCount > 0) {
    return `The latest run has no file activity yet. Switch to all runs to review ${String(hiddenFileEventCount)} earlier item${hiddenFileEventCount === 1 ? "" : "s"}.`;
  }

  return "Reads, edits, and diff previews will land here as soon as the next turn touches the repository.";
}

function buildSessionBannerModel(options: {
  sessionState: SessionStateViewModel | null;
  connectionState: WorkbenchConnectionState | "reconnecting";
  agentStatus: string;
  turnCount: number;
  fileEventCount: number;
  contextReceiptCount: number;
  latestTurn: TurnViewModel | null;
}): SessionBannerModel {
  const {
    sessionState,
    connectionState,
    agentStatus,
    turnCount,
    fileEventCount,
    contextReceiptCount,
    latestTurn,
  } = options;

  if (!sessionState) {
    return {
      tone: "warning",
      statusLabel: "booting",
      title: "Connecting to Shipyard",
      detail: "Waiting for the browser runtime to publish the current local session.",
      hint: "Once connected, this banner will show the active session, last activity, and recovery state.",
      meta: [],
    };
  }

  const sessionMeta = [
    {
      label: "Session",
      value: sessionState.sessionId,
      monospace: true,
    },
    {
      label: "Workspace",
      value: sessionState.workspaceDirectory,
      monospace: true,
    },
    {
      label: "Target",
      value: sessionState.targetDirectory,
      monospace: true,
    },
    {
      label: "Turns",
      value: String(turnCount),
    },
    {
      label: "Last active",
      value: formatTimestamp(sessionState.lastActiveAt),
    },
  ];

  if (agentStatus === "Recovered session history after reload.") {
    return {
      tone: "success",
      statusLabel: "restored",
      title: `Session ${sessionState.sessionId} restored in ${formatWorkspaceLabel(sessionState.workspaceDirectory)}`,
      detail: `Recovered ${String(turnCount)} turn${turnCount === 1 ? "" : "s"}, ${String(fileEventCount)} file event${fileEventCount === 1 ? "" : "s"}, and ${String(contextReceiptCount)} context receipt${contextReceiptCount === 1 ? "" : "s"} from the saved browser state.`,
      hint: "Review the latest turn below or keep working without losing local context.",
      meta: sessionMeta,
    };
  }

  if (connectionState === "reconnecting") {
    return {
      tone: "warning",
      statusLabel: "reconnecting",
      title: `Reconnecting to ${formatWorkspaceLabel(sessionState.workspaceDirectory)}`,
      detail: `Last known activity from ${formatTimestamp(sessionState.lastActiveAt)} is still visible while the socket retries.`,
      hint: "You can keep reading the current session state. Shipyard will resume live updates as soon as the connection returns.",
      meta: sessionMeta,
    };
  }

  if (connectionState === "error" || latestTurn?.status === "error") {
    return {
      tone: "danger",
      statusLabel: "attention",
      title: `${formatWorkspaceLabel(sessionState.workspaceDirectory)} needs attention`,
      detail:
        latestTurn?.summary ??
        agentStatus ??
        "Shipyard reported an error while keeping the last known state visible.",
      hint: "Review the latest failing step, then refresh the session or resend a narrower instruction.",
      meta: sessionMeta,
    };
  }

  if (connectionState === "agent-busy") {
    return {
      tone: "accent",
      statusLabel: "live",
      title: `${formatWorkspaceLabel(sessionState.workspaceDirectory)} is streaming`,
      detail: `Shipyard is actively working through turn ${String(sessionState.turnCount)} and publishing tool activity below.`,
      hint: "Use the latest-run filter to stay focused on the current turn while it updates.",
      meta: sessionMeta,
    };
  }

  return {
    tone: "success",
    statusLabel: "stable",
    title: `Connected to ${formatWorkspaceLabel(sessionState.workspaceDirectory)}`,
    detail: `Last active ${formatTimestamp(sessionState.lastActiveAt)}. The current browser state matches the latest saved session snapshot.`,
    hint: "Paste context only when a spec, schema, or local rule should ride with the next turn.",
    meta: sessionMeta,
  };
}

function createContextActionCopy(
  contextDraft: string,
  contextHistory: ContextReceiptViewModel[],
): string {
  if (contextDraft.trim()) {
    return "This note is queued for the next run only. Submit with Cmd/Ctrl+Enter or clear it with Escape.";
  }

  if (contextHistory.length > 0) {
    return "Shipyard keeps receipts for recent injected context so reloads never erase what you told it.";
  }

  return "Add a spec excerpt, schema, or repo-specific constraint only when the next turn truly needs it.";
}

export function ShipyardWorkbench(props: ShipyardWorkbenchProps) {
  const [activityScope, setActivityScope] = useState<ActivityScope>("latest");
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedContextItems, setExpandedContextItems] = useState<
    Record<string, boolean>
  >({});
  const [showAllContextHistory, setShowAllContextHistory] = useState(false);
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
  const latestTurn = props.turns[0] ?? null;
  const latestContextReceipt = props.contextHistory[0] ?? null;
  const trimmedContextDraft = props.contextDraft.trim();
  const queuedContextPreview = trimmedContextDraft
    ? buildTextPreview(
        trimmedContextDraft,
        expandedContextItems["queued-context"] === true,
      )
    : null;
  const visibleContextHistory = showAllContextHistory
    ? props.contextHistory
    : props.contextHistory.slice(0, DEFAULT_VISIBLE_CONTEXT_RECEIPTS);
  const hiddenContextHistoryCount = Math.max(
    props.contextHistory.length - visibleContextHistory.length,
    0,
  );
  const sessionBanner = buildSessionBannerModel({
    sessionState: props.sessionState,
    connectionState: surfaceState,
    agentStatus: props.agentStatus,
    turnCount: props.turns.length,
    fileEventCount: props.fileEvents.length,
    contextReceiptCount: props.contextHistory.length,
    latestTurn,
  });
  const showRecoveryGuidance =
    props.connectionState === "error" || latestTurn?.status === "error";
  const latestContextPreview = latestContextReceipt
    ? buildTextPreview(
        latestContextReceipt.text,
        expandedContextItems[latestContextReceipt.id] === true,
      )
    : null;

  function toggleDiffExpansion(fileEventId: string): void {
    setExpandedDiffs((current) => ({
      ...current,
      [fileEventId]: !current[fileEventId],
    }));
  }

  function toggleContextExpansion(contextId: string): void {
    setExpandedContextItems((current) => ({
      ...current,
      [contextId]: !current[contextId],
    }));
  }

  return (
    <div className="workbench-shell" data-state={surfaceState}>
      <header className="top-bar" role="banner">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true" />
          <div className="brand-copy">
            <p className="brand-kicker">Shipyard</p>
            <h1>Developer Workbench</h1>
            <p className="brand-summary">
              A local-first coding console built for traceable sessions,
              surgical edits, and diff-forward review.
            </p>
          </div>
        </div>

        <div className="top-bar-actions">
          <div className="top-info-block">
            <MicroLabel>Workspace</MicroLabel>
            <code>{props.sessionState?.workspaceDirectory ?? "Waiting for workspace..."}</code>
          </div>

          <div className="top-info-block">
            <MicroLabel>Target</MicroLabel>
            <code>{props.sessionState?.targetDirectory ?? "Waiting for target..."}</code>
          </div>

          <div className="top-action-group">
            <button
              type="button"
              className="top-action"
              onClick={props.onCopyTracePath}
              disabled={!hasSession}
            >
              {props.traceButtonLabel}
            </button>
            <button
              type="button"
              className="top-action"
              onClick={props.onRefreshStatus}
            >
              Refresh session
            </button>
          </div>

          <Badge
            className="connection-pill"
            tone={connectionTone}
            aria-label={`Connection status: ${connectionLabel}`}
          >
            <StatusDot tone={connectionTone} />
            {connectionLabel}
          </Badge>
        </div>
      </header>

      <SurfaceCard className="session-banner">
        <div className="session-banner-copy">
          <div className="session-banner-status-row">
            <StatusDot tone={sessionBanner.tone} />
            <Badge tone={sessionBanner.tone}>{sessionBanner.statusLabel}</Badge>
          </div>
          <h2>{sessionBanner.title}</h2>
          <p className="session-banner-detail">{sessionBanner.detail}</p>
          <p className="session-banner-hint">{sessionBanner.hint}</p>
        </div>

        {sessionBanner.meta.length > 0 ? (
          <ul className="session-banner-meta">
            {sessionBanner.meta.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                {item.monospace ? (
                  <code>{item.value}</code>
                ) : (
                  <strong>{item.value}</strong>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </SurfaceCard>

      <div className="workbench-grid">
        <aside className="left-sidebar" aria-label="Session and context">
          <SurfaceCard className="panel panel-session">
            <SectionHeader
              kicker="Session"
              title="Runtime snapshot"
              meta={(
                <Badge tone="neutral">
                  {props.sessionState?.turnCount ?? 0} turns
                </Badge>
              )}
            />

            {props.sessionState ? (
              <>
                <dl className="fact-grid">
                  <div>
                    <dt>Session ID</dt>
                    <dd>{props.sessionState.sessionId}</dd>
                  </div>
                  <div>
                    <dt>Workspace</dt>
                    <dd>{formatWorkspaceLabel(props.sessionState.workspaceDirectory)}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{props.sessionState.targetLabel}</dd>
                  </div>
                  <div>
                    <dt>Discovery</dt>
                    <dd>{props.sessionState.discoverySummary}</dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd>{formatTimestamp(props.sessionState.lastActiveAt)}</dd>
                  </div>
                </dl>

                <div className="session-meta-block">
                  <MicroLabel>Paths</MicroLabel>
                  <ul className="signal-list">
                    <li>
                      <code>{props.sessionState.workspaceDirectory}</code>
                    </li>
                    <li>
                      <code>{props.sessionState.targetDirectory}</code>
                    </li>
                  </ul>
                </div>

                <div className="session-meta-block">
                  <MicroLabel>Project signals</MicroLabel>
                  <ul className="signal-list">
                    <li>{props.sessionState.discovery.projectName ?? "Unnamed project"}</li>
                    <li>{props.sessionState.discovery.language ?? "Unknown language"}</li>
                    <li>{props.sessionState.discovery.framework ?? "No framework detected"}</li>
                    <li>
                      {props.sessionState.projectRulesLoaded
                        ? "Project rules loaded"
                        : "No AGENTS.md loaded"}
                    </li>
                  </ul>
                </div>

                {Object.keys(props.sessionState.discovery.scripts).length > 0 ? (
                  <div className="session-meta-block">
                    <MicroLabel>Available scripts</MicroLabel>
                    <ul className="script-list">
                      {Object.entries(props.sessionState.discovery.scripts).map(
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
              </>
            ) : (
              <p className="empty-copy">
                Waiting for Shipyard to publish the session bridge.
              </p>
            )}
          </SurfaceCard>

          <SurfaceCard className="panel panel-context">
            <SectionHeader
              kicker="Context"
              title="Inject guidance"
              meta={(
                <button
                  type="button"
                  className="ghost-action"
                  onClick={props.onClearContext}
                >
                  Clear
                </button>
              )}
            />

            {queuedContextPreview ? (
              <div className="context-receipt-card queued-context-card">
                <div className="context-receipt-header">
                  <div>
                    <MicroLabel>Queued for next turn</MicroLabel>
                    <h3>Pending context note</h3>
                  </div>
                  <Badge tone="accent">Draft</Badge>
                </div>
                <p>{queuedContextPreview.text}</p>
                <div className="context-receipt-meta">
                  <span>{trimmedContextDraft.length} characters</span>
                  {queuedContextPreview.isTruncated ? (
                    <button
                      type="button"
                      className="ghost-action context-toggle"
                      onClick={() => toggleContextExpansion("queued-context")}
                    >
                      Show full context
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {latestContextReceipt && latestContextPreview ? (
              <div className="context-receipt-card">
                <div className="context-receipt-header">
                  <div>
                    <MicroLabel>Last attached context</MicroLabel>
                    <h3>{latestContextReceipt.turnId}</h3>
                  </div>
                  <Badge tone="success">
                    {formatTimestamp(latestContextReceipt.submittedAt)}
                  </Badge>
                </div>
                <p>{latestContextPreview.text}</p>
                {latestContextPreview.isTruncated ? (
                  <button
                    type="button"
                    className="ghost-action context-toggle"
                    onClick={() => toggleContextExpansion(latestContextReceipt.id)}
                  >
                    Show full context
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="empty-state compact-empty-state">
                <p className="empty-heading">No context attached yet</p>
                <p className="empty-copy">
                  Add a spec excerpt or repo-specific rule here when the next turn
                  needs more than the current repository state.
                </p>
              </div>
            )}

            <label className="field-label" htmlFor="context-draft">
              Notes that will ride with the next instruction
            </label>
            <textarea
              id="context-draft"
              ref={props.contextInputRef}
              className="context-input"
              value={props.contextDraft}
              onChange={(event) => handleTextareaChange(event, props.onContextChange)}
              onKeyDown={props.onContextKeyDown}
              aria-keyshortcuts="Control+Enter Meta+Enter Escape"
              placeholder="Paste a spec excerpt, acceptance note, or local constraint."
              rows={8}
            />
            <p className="support-copy">
              {createContextActionCopy(props.contextDraft, props.contextHistory)}
            </p>

            {visibleContextHistory.length > 0 ? (
              <div className="context-history-block">
                <div className="context-history-header">
                  <MicroLabel>Recent injections</MicroLabel>
                  {hiddenContextHistoryCount > 0 ? (
                    <button
                      type="button"
                      className="ghost-action context-toggle"
                      onClick={() => setShowAllContextHistory((current) => !current)}
                    >
                      {showAllContextHistory
                        ? "Show fewer receipts"
                        : `Show ${String(hiddenContextHistoryCount)} older receipt${hiddenContextHistoryCount === 1 ? "" : "s"}`}
                    </button>
                  ) : null}
                </div>
                <ol className="context-history-list">
                  {visibleContextHistory.map((entry) => {
                    const preview = buildTextPreview(
                      entry.text,
                      expandedContextItems[entry.id] === true,
                    );

                    return (
                      <li key={entry.id} className="context-history-item">
                        <div className="context-history-item-header">
                          <time
                            className="context-history-time"
                            dateTime={entry.submittedAt}
                          >
                            {formatTimestamp(entry.submittedAt)}
                          </time>
                          <Badge tone="neutral">{entry.turnId}</Badge>
                        </div>
                        <p>{preview.text}</p>
                        {preview.isTruncated ? (
                          <button
                            type="button"
                            className="ghost-action context-toggle"
                            onClick={() => toggleContextExpansion(entry.id)}
                          >
                            Show full context
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </SurfaceCard>
        </aside>

        <main className="main-column" role="main" aria-label="Agent activity">
          <SurfaceCard className="panel panel-composer">
            <SectionHeader
              kicker="Control surface"
              title="Send an instruction"
              meta={(
                <div className="composer-meta">
                  <Badge tone={props.contextDraft.trim() ? "accent" : "neutral"}>
                    {props.contextDraft.trim()
                      ? "Context queued"
                      : "No extra context"}
                  </Badge>
                  <Badge tone="accent">Cmd/Ctrl+Enter</Badge>
                </div>
              )}
            />

            {props.composerNotice ? (
              <div className="composer-notice" data-tone={props.composerNotice.tone}>
                <div className="composer-notice-header">
                  <StatusDot tone={props.composerNotice.tone} />
                  <strong>{props.composerNotice.title}</strong>
                </div>
                <p>{props.composerNotice.detail}</p>
              </div>
            ) : null}

            <form className="instruction-form" onSubmit={props.onSubmitInstruction}>
              <label className="field-label" htmlFor="instruction">
                Instruction
              </label>
              <textarea
                id="instruction"
                ref={props.instructionInputRef}
                className="instruction-input"
                value={props.instruction}
                onChange={(event) =>
                  handleTextareaChange(event, props.onInstructionChange)
                }
                onKeyDown={props.onInstructionKeyDown}
                aria-keyshortcuts="Control+Enter Meta+Enter"
                placeholder="Ask Shipyard to inspect a file, explain the current diff, or map the next change."
                rows={4}
              />
              <div className="composer-actions">
                <button type="submit" className="primary-action">
                  Run instruction
                </button>
                <p className="support-copy">
                  Submit with Cmd/Ctrl+Enter, keep focus in the instruction field,
                  and use Escape in the context field to clear the queued note.
                </p>
              </div>
            </form>
          </SurfaceCard>

          <SurfaceCard className="panel panel-activity">
            <SectionHeader
              kicker="Activity"
              title="Chat and execution log"
              meta={(
                <div className="activity-toolbar">
                  {hiddenTurnCount > 0 ? (
                    <Badge tone="warning">
                      {hiddenTurnCount} older hidden
                    </Badge>
                  ) : null}
                  <div
                    className="segmented-control"
                    role="group"
                    aria-label="Activity scope"
                  >
                    {(["latest", "all"] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        className="scope-toggle"
                        data-active={activityScope === scope}
                        onClick={() => setActivityScope(scope)}
                      >
                        {formatScopeLabel(scope)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            />

            {showRecoveryGuidance ? (
              <div className="recovery-guidance-card">
                <div className="recovery-guidance-header">
                  <StatusDot tone="danger" />
                  <strong>Recovery path</strong>
                </div>
                <p>
                  Shipyard kept the last known state visible. Review the latest
                  failing step, refresh the session, or rerun with a narrower
                  instruction once the connection stabilizes.
                </p>
              </div>
            ) : null}

            {props.turns.length === 0 ? (
              <div className="empty-state">
                <p className="empty-heading">Ready for the first browser turn</p>
                <p className="empty-copy">
                  Start with an instruction in the center column. Add context in
                  the left panel only when a spec, schema, or non-obvious rule
                  should ride with that next turn.
                </p>
              </div>
            ) : (
              <ol className="turn-list">
                {visibleTurns.map((turn, index) => {
                  const turnTone = getTurnTone(turn.status);
                  const originalIndex = props.turns.findIndex(
                    (candidate) => candidate.id === turn.id,
                  );
                  const turnOrdinal = getTurnOrdinal(
                    turn.id,
                    originalIndex === -1
                      ? visibleTurns.length - index
                      : props.turns.length - originalIndex,
                  );
                  const activityBlocks = buildActivityBlocks(turn.activity);

                  return (
                    <li key={turn.id}>
                      <SurfaceCard
                        as="article"
                        className="turn-card"
                        data-tone={turnTone}
                      >
                        <div className="turn-header">
                          <div className="turn-heading">
                            <span className="turn-label">Turn {turnOrdinal}</span>
                            <h3>{turn.instruction}</h3>
                          </div>
                          <div className="turn-header-meta">
                            <Badge
                              className="turn-status-pill"
                              tone={turnTone}
                            >
                              {turn.status}
                            </Badge>
                            <span className="turn-started-at">
                              {formatTimestamp(turn.startedAt)}
                            </span>
                          </div>
                        </div>

                        <div className="turn-summary-card">
                          <MicroLabel>Latest summary</MicroLabel>
                          <p>{turn.summary}</p>
                        </div>

                        {turn.contextPreview.length > 0 ? (
                          <div className="turn-context-strip">
                            <MicroLabel>Injected context</MicroLabel>
                            {turn.contextPreview.map((entry) => (
                              <p key={entry}>{entry}</p>
                            ))}
                          </div>
                        ) : null}

                        {turn.agentMessages.length > 0 ? (
                          <div className="agent-copy">
                            <MicroLabel>Agent copy</MicroLabel>
                            {turn.agentMessages.slice(-1).map((message) => (
                              <p key={message}>{message}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-copy">
                            Shipyard has not emitted a full agent response yet.
                          </p>
                        )}

                        <details
                          className="activity-log"
                          open={index === 0 || turn.status === "working"}
                        >
                          <summary>
                            <div className="activity-log-summary-copy">
                              <span>Tool timeline</span>
                              <small>{activityBlocks.length} grouped steps</small>
                            </div>
                            <div className="activity-log-summary-meta">
                              <Badge tone="neutral">
                                {turn.activity.length} raw events
                              </Badge>
                              {turn.status === "working" ? (
                                <Badge tone="accent">Live</Badge>
                              ) : null}
                            </div>
                          </summary>
                          <ol className="activity-block-list">
                            {activityBlocks.map((activity) => (
                              <li
                                key={activity.id}
                                className="activity-block"
                                data-tone={activity.tone}
                                data-kind={activity.kind}
                              >
                                <div className="activity-block-header">
                                  <div className="activity-block-title-row">
                                    <StatusDot tone={activity.tone} />
                                    <div>
                                      <p className="activity-block-kicker">
                                        {activity.kind === "tool"
                                          ? "Tool step"
                                          : "Agent event"}
                                      </p>
                                      <h4>{activity.title}</h4>
                                    </div>
                                  </div>
                                  <Badge tone={activity.tone}>
                                    {activity.statusLabel}
                                  </Badge>
                                </div>

                                {activity.metadata.length > 0 ? (
                                  <ul className="activity-block-meta">
                                    {activity.metadata.map((item) => (
                                      <li key={`${activity.id}-${item.label}`}>
                                        <span>{item.label}</span>
                                        {item.monospace ? (
                                          <code>{item.value}</code>
                                        ) : (
                                          <strong>{item.value}</strong>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}

                                <dl className="activity-detail-list">
                                  {activity.details.map((detail) => (
                                    <div
                                      key={detail.id}
                                      className="activity-detail-row"
                                      data-tone={detail.tone}
                                    >
                                      <dt>{detail.label}</dt>
                                      <dd>{detail.text}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </li>
                            ))}
                          </ol>
                        </details>
                      </SurfaceCard>
                    </li>
                  );
                })}
              </ol>
            )}
          </SurfaceCard>
        </main>

        <aside className="right-sidebar" aria-label="File activity">
          <SurfaceCard className="panel panel-files">
            <SectionHeader
              kicker="File activity"
              title="Diff-first sidebar"
              meta={(
                <div className="file-panel-meta">
                  <Badge tone="neutral">
                    {visibleFileEvents.length} items
                  </Badge>
                  {hiddenFileEventCount > 0 ? (
                    <Badge tone="warning">
                      {hiddenFileEventCount} hidden
                    </Badge>
                  ) : null}
                </div>
              )}
            />

            {visibleFileEvents.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <p className="empty-heading">
                  No file events in {formatScopeLabel(activityScope).toLowerCase()}
                </p>
                <p className="empty-copy">
                  {createHiddenFileEventCopy(activityScope, hiddenFileEventCount)}
                </p>
              </div>
            ) : (
              <ol className="file-event-list">
                {visibleFileEvents.map((fileEvent) => {
                  const expanded = expandedDiffs[fileEvent.id] === true;
                  const diffPreview = buildDiffPreview(fileEvent, expanded);

                  return (
                    <li key={fileEvent.id}>
                      <SurfaceCard
                        as="article"
                        className="file-event-card"
                        data-tone={getFileEventTone(fileEvent.status)}
                      >
                        <div className="file-event-header">
                          <div>
                            <span className="file-event-title">{fileEvent.title}</span>
                            <h3>{fileEvent.path}</h3>
                          </div>
                          <Badge
                            className="file-event-status"
                            tone={getFileEventTone(fileEvent.status)}
                          >
                            {fileEvent.status}
                          </Badge>
                        </div>

                        <div className="file-event-meta-row">
                          {fileEvent.toolName ? <code>{fileEvent.toolName}</code> : null}
                          <span>{fileEvent.turnId}</span>
                        </div>
                        <p className="file-event-summary">{fileEvent.summary}</p>

                        {fileEvent.diffLines.length > 0 ? (
                          <div className="diff-preview-shell">
                            <div className="diff-legend">
                              <Badge tone="success">ADD</Badge>
                              <Badge tone="danger">DEL</Badge>
                              <Badge tone="neutral">CTX</Badge>
                              <Badge tone="warning">META</Badge>
                              <span>{diffPreview.totalLineCount} lines</span>
                            </div>

                            <ol
                              className="diff-line-list"
                              aria-label={`Diff preview for ${fileEvent.path}`}
                            >
                              {diffPreview.lines.map((line) => (
                                <li
                                  key={line.id}
                                  className="diff-render-line"
                                  data-kind={line.kind}
                                >
                                  <span className="diff-line-label">
                                    {line.label}
                                  </span>
                                  <code className="diff-line-text">
                                    {line.text || " "}
                                  </code>
                                </li>
                              ))}
                            </ol>

                            {diffPreview.hasOverflow ? (
                              <button
                                type="button"
                                className="ghost-action diff-toggle"
                                onClick={() => toggleDiffExpansion(fileEvent.id)}
                              >
                                {expanded
                                  ? "Show fewer lines"
                                  : `Show ${String(diffPreview.hiddenLineCount)} more lines`}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </SurfaceCard>
                    </li>
                  );
                })}
              </ol>
            )}
          </SurfaceCard>
        </aside>
      </div>

      <footer className="status-bar" role="contentinfo">
        <div className="status-current" data-state={surfaceState}>
          <StatusDot tone={connectionTone} />
          <div>
            <MicroLabel>Current status</MicroLabel>
            <strong aria-live="polite">{props.agentStatus}</strong>
          </div>
        </div>
        <div className="status-meta">
          <span>{props.sessionState?.discoverySummary ?? "No discovery data yet"}</span>
          <span>{props.sessionState?.tracePath ?? "Trace path pending"}</span>
        </div>
      </footer>
    </div>
  );
}
