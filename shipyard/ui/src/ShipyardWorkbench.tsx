import type { ChangeEvent, FormEvent } from "react";

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

export function ShipyardWorkbench(props: ShipyardWorkbenchProps) {
  const surfaceState = formatSurfaceState(
    props.connectionState,
    props.sessionState !== null,
  );
  const connectionLabel = formatConnectionLabel(
    props.connectionState,
    props.sessionState !== null,
  );

  return (
    <div className="workbench-shell" data-state={surfaceState}>
      <header className="top-bar" role="banner">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-kicker">Shipyard</p>
            <h1>Developer Workbench</h1>
          </div>
        </div>

        <div className="top-bar-actions">
          <div className="target-block">
            <span className="micro-label">Target</span>
            <code>{props.sessionState?.targetDirectory ?? "Waiting for target..."}</code>
          </div>
          <button
            type="button"
            className="top-action"
            onClick={props.onCopyTracePath}
            disabled={props.sessionState === null}
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
          <div
            className="connection-pill"
            data-state={surfaceState}
            aria-label={`Connection status: ${connectionLabel}`}
          >
            <span className="status-signal" aria-hidden="true" />
            {connectionLabel}
          </div>
        </div>
      </header>

      <div className="workbench-grid">
        <aside
          className="left-sidebar"
          aria-label="Session and context"
        >
          <section className="panel panel-session">
            <div className="panel-title-row">
              <div>
                <p className="section-kicker">Session</p>
                <h2>Runtime snapshot</h2>
              </div>
              <span className="metric-pill">
                {props.sessionState?.turnCount ?? 0} turns
              </span>
            </div>

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
          </section>

          <section className="panel panel-context">
            <div className="panel-title-row">
              <div>
                <p className="section-kicker">Context</p>
                <h2>Inject guidance</h2>
              </div>
              <button
                type="button"
                className="ghost-action"
                onClick={props.onClearContext}
              >
                Clear
              </button>
            </div>

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
          </section>
        </aside>

        <main className="main-column" role="main" aria-label="Agent activity">
          <section className="panel panel-composer">
            <div className="panel-title-row">
              <div>
                <p className="section-kicker">Control surface</p>
                <h2>Send an instruction</h2>
              </div>
              <span className="composer-hint">
                {props.contextDraft.trim()
                  ? "Context will be included on submit"
                  : "No extra context queued"}
              </span>
            </div>

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
          </section>

          <section className="panel panel-activity">
            <div className="panel-title-row">
              <div>
                <p className="section-kicker">Activity</p>
                <h2>Chat and execution log</h2>
              </div>
              <span className="metric-pill">
                {props.turns.length} turn{props.turns.length === 1 ? "" : "s"}
              </span>
            </div>

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
                {props.turns.map((turn, index) => (
                  <li key={turn.id}>
                    <article className="turn-card" data-status={turn.status}>
                      <div className="turn-header">
                        <div>
                          <span className="turn-label">Turn {props.turns.length - index}</span>
                          <h3>{turn.instruction}</h3>
                        </div>
                        <span className="turn-status-pill" data-status={turn.status}>
                          {turn.status}
                        </span>
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
                          <span>{turn.activity.length} events</span>
                        </summary>
                        <ol className="activity-list">
                          {turn.activity.map((activity) => (
                            <li
                              key={activity.id}
                              className="activity-row"
                              data-tone={activity.tone}
                            >
                              <div className="activity-marker" aria-hidden="true" />
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
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </main>

        <aside
          className="right-sidebar"
          aria-label="File activity"
        >
          <section className="panel panel-files">
            <div className="panel-title-row">
              <div>
                <p className="section-kicker">File activity</p>
                <h2>Diff-first sidebar</h2>
              </div>
              <span className="metric-pill">
                {props.fileEvents.length} items
              </span>
            </div>

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
                    <article className="file-event-card" data-status={fileEvent.status}>
                      <div className="file-event-header">
                        <div>
                          <span className="file-event-title">{fileEvent.title}</span>
                          <h3>{fileEvent.path}</h3>
                        </div>
                        <span className="file-event-status" data-status={fileEvent.status}>
                          {fileEvent.status}
                        </span>
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
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <footer className="status-bar" role="contentinfo">
        <div className="status-current" data-state={surfaceState}>
          <span className="status-signal" aria-hidden="true" />
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
