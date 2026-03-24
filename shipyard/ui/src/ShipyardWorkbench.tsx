import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  buildActivityBlocks,
  buildDiffPreview,
  selectVisibleFileEvents,
  selectVisibleTurns,
  type ActivityScope,
} from "./activity-diff.js";
import {
  Badge,
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

interface ShipyardWorkbenchProps {
  sessionState: SessionStateViewModel | null;
  turns: TurnViewModel[];
  fileEvents: FileEventViewModel[];
  contextHistory: ContextReceiptViewModel[];
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  instruction: string;
  contextDraft: string;
  onInstructionChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onClearContext: () => void;
  onSubmitInstruction: (event: FormEvent<HTMLFormElement>) => void;
  onRefreshStatus: () => void;
  onCopyTracePath: () => void;
  traceButtonLabel: string;
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

export function ShipyardWorkbench(props: ShipyardWorkbenchProps) {
  const [activityScope, setActivityScope] = useState<ActivityScope>("latest");
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>(
    {},
  );
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

  function toggleDiffExpansion(fileEventId: string): void {
    setExpandedDiffs((current) => ({
      ...current,
      [fileEventId]: !current[fileEventId],
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
            <span className="micro-label">Target</span>
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
                  <span className="micro-label">Project signals</span>
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
                    <span className="micro-label">Available scripts</span>
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

            <label className="field-label" htmlFor="context-draft">
              Notes that will ride with the next instruction
            </label>
            <textarea
              id="context-draft"
              className="context-input"
              value={props.contextDraft}
              onChange={(event) => handleTextareaChange(event, props.onContextChange)}
              placeholder="Paste a spec excerpt, acceptance note, or local constraint."
              rows={8}
            />
            <p className="support-copy">
              Context is attached to the next instruction only, then preserved
              below as a visible receipt so reloads do not erase operator
              intent.
            </p>

            {props.contextHistory.length > 0 ? (
              <div className="context-history-block">
                <span className="micro-label">Recent injections</span>
                <ol className="context-history-list">
                  {props.contextHistory.map((entry) => (
                    <li key={entry.id} className="context-history-item">
                      <time
                        className="context-history-time"
                        dateTime={entry.submittedAt}
                      >
                        {formatTimestamp(entry.submittedAt)}
                      </time>
                      <p>{entry.text}</p>
                    </li>
                  ))}
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
                <Badge tone={props.contextDraft.trim() ? "accent" : "neutral"}>
                  {props.contextDraft.trim()
                    ? "Context queued"
                    : "No extra context"}
                </Badge>
              )}
            />

            <form className="instruction-form" onSubmit={props.onSubmitInstruction}>
              <label className="field-label" htmlFor="instruction">
                Instruction
              </label>
              <textarea
                id="instruction"
                className="instruction-input"
                value={props.instruction}
                onChange={(event) =>
                  handleTextareaChange(event, props.onInstructionChange)
                }
                placeholder="Ask Shipyard to inspect a file, explain the current diff, or map the next change."
                rows={4}
              />
              <div className="composer-actions">
                <button type="submit" className="primary-action">
                  Run instruction
                </button>
                <p className="support-copy">
                  Activity stays focused on the most recent run by default and
                  expands into historical turns when you need the full trail.
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

            {props.turns.length === 0 ? (
              <div className="empty-state">
                <p className="empty-heading">Ready for the first browser turn</p>
                <p className="empty-copy">
                  Session state, connection health, and file visibility are
                  already live. Send one instruction to watch the tool stream and
                  diff feed take over the workbench.
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
                          <span className="micro-label">Latest summary</span>
                          <p>{turn.summary}</p>
                        </div>

                        {turn.contextPreview.length > 0 ? (
                          <div className="turn-context-strip">
                            <span className="micro-label">Injected context</span>
                            {turn.contextPreview.map((entry) => (
                              <p key={entry}>{entry}</p>
                            ))}
                          </div>
                        ) : null}

                        {turn.agentMessages.length > 0 ? (
                          <div className="agent-copy">
                            <span className="micro-label">Agent copy</span>
                            {turn.agentMessages.slice(-1).map((message) => (
                              <p key={message}>{message}</p>
                            ))}
                          </div>
                        ) : null}

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
                <p className="empty-heading">No file events in {formatScopeLabel(activityScope).toLowerCase()}</p>
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
            <span className="micro-label">Current status</span>
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
