import type { ChangeEvent, FormEvent } from "react";

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

export function ShipyardWorkbench(props: ShipyardWorkbenchProps) {
  const hasSession = props.sessionState !== null;
  const surfaceState = formatSurfaceState(props.connectionState, hasSession);
  const connectionLabel = formatConnectionLabel(props.connectionState, hasSession);
  const connectionTone = getConnectionTone(surfaceState);

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
                  Activity logs stay compact by default and expand per turn.
                </p>
              </div>
            </form>
          </SurfaceCard>

          <SurfaceCard className="panel panel-activity">
            <SectionHeader
              kicker="Activity"
              title="Chat and execution log"
              meta={(
                <Badge tone="neutral">
                  {props.turns.length} turn{props.turns.length === 1 ? "" : "s"}
                </Badge>
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
                {props.turns.map((turn, index) => {
                  const turnTone = getTurnTone(turn.status);

                  return (
                    <li key={turn.id}>
                      <SurfaceCard
                        as="article"
                        className="turn-card"
                      >
                        <div className="turn-header">
                          <div className="turn-heading">
                            <span className="turn-label">
                              Turn {props.turns.length - index}
                            </span>
                            <h3>{turn.instruction}</h3>
                          </div>
                          <Badge
                            className="turn-status-pill"
                            tone={turnTone}
                          >
                            {turn.status}
                          </Badge>
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
                            {turn.agentMessages.map((message) => (
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
                            <span>Activity log</span>
                            <Badge tone="neutral">{turn.activity.length} events</Badge>
                          </summary>
                          <ol className="activity-list">
                            {turn.activity.map((activity) => (
                              <li
                                key={activity.id}
                                className="activity-row"
                                data-tone={activity.tone}
                              >
                                <StatusDot
                                  tone={
                                    activity.tone === "danger"
                                      ? "danger"
                                      : activity.tone === "success"
                                      ? "success"
                                      : "accent"
                                  }
                                />
                                <div>
                                  <div className="activity-headline">
                                    <strong>{activity.title}</strong>
                                    {activity.toolName ? (
                                      <code>{activity.toolName}</code>
                                    ) : null}
                                  </div>
                                  <p>{activity.detail}</p>
                                </div>
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
                <Badge tone="neutral">
                  {props.fileEvents.length} items
                </Badge>
              )}
            />

            {props.fileEvents.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <p className="empty-heading">No file events yet</p>
                <p className="empty-copy">
                  Reads, edits, and diff previews will land here as soon as the
                  next turn touches the repository.
                </p>
              </div>
            ) : (
              <ol className="file-event-list">
                {props.fileEvents.map((fileEvent) => (
                  <li key={fileEvent.id}>
                    <SurfaceCard
                      as="article"
                      className="file-event-card"
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
                      <p className="file-event-summary">{fileEvent.summary}</p>

                      {fileEvent.diffLines.length > 0 ? (
                        <pre className="diff-preview" aria-label={`Diff preview for ${fileEvent.path}`}>
                          {fileEvent.diffLines.map((line) => (
                            <span
                              key={line.id}
                              className="diff-line"
                              data-kind={line.kind}
                            >
                              {line.text}
                            </span>
                          ))}
                        </pre>
                      ) : null}
                    </SurfaceCard>
                  </li>
                ))}
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
