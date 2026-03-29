import type {
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";

import type { BadgeTone } from "./primitives.js";
import {
  Badge,
  SectionHeader,
  SurfaceCard,
} from "./primitives.js";
import { formatUltimatePhaseLabel } from "./ultimate-composer.js";
import type {
  PreviewStateViewModel,
  SessionStateViewModel,
  TurnViewModel,
  UltimateUiStateViewModel,
  WorkbenchConnectionState,
} from "./view-models.js";

interface HumanFeedbackNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface HumanFeedbackPageProps {
  sessionState: SessionStateViewModel | null;
  previewState: PreviewStateViewModel;
  turns: TurnViewModel[];
  connectionState: WorkbenchConnectionState;
  agentStatus: string;
  ultimateState: UltimateUiStateViewModel;
  instruction: string;
  submitLabel: string;
  submitDisabled?: boolean;
  helpText: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  notice: HumanFeedbackNotice | null;
  onInstructionChange: (value: string) => void;
  onInstructionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefreshStatus: () => void;
}

function getConnectionTone(
  connectionState: WorkbenchConnectionState,
): BadgeTone {
  switch (connectionState) {
    case "agent-busy":
      return "warning";
    case "ready":
      return "success";
    case "connecting":
      return "accent";
    case "disconnected":
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

function getConnectionLabel(
  connectionState: WorkbenchConnectionState,
): string {
  switch (connectionState) {
    case "agent-busy":
      return "Loop busy";
    case "ready":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Connection error";
    default:
      return "Offline";
  }
}

function getTurnTone(status: TurnViewModel["status"]): BadgeTone {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "working":
      return "warning";
    default:
      return "neutral";
  }
}

function getPreviewLabel(previewState: PreviewStateViewModel): string {
  switch (previewState.status) {
    case "running":
      return "Live preview ready";
    case "starting":
      return "Preview starting";
    case "error":
      return "Preview needs attention";
    default:
      return "Preview unavailable";
  }
}

function getUltimateTone(
  ultimateState: UltimateUiStateViewModel,
): BadgeTone {
  switch (ultimateState.phase) {
    case "running":
      return "accent";
    case "stopping":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

function resolveHumanFeedbackNotice(input: {
  notice: HumanFeedbackNotice | null;
  sessionState: SessionStateViewModel | null;
  connectionState: WorkbenchConnectionState;
}): HumanFeedbackNotice | null {
  if (input.notice) {
    return input.notice;
  }

  if (!input.sessionState?.sessionId) {
    return {
      tone: "warning",
      title: "No active Shipyard session yet",
      detail:
        "Open the editor and start a product session before sending feedback from the dedicated ultimate-mode page.",
    };
  }

  switch (input.connectionState) {
    case "connecting":
      return {
        tone: "accent",
        title: "Reconnecting to the browser runtime",
        detail:
          "You can review the last loop state while Shipyard reconnects. New feedback will unlock again as soon as the session is ready.",
      };
    case "disconnected":
      return {
        tone: "warning",
        title: "Feedback is paused while Shipyard reconnects",
        detail:
          "This page is showing the last synced loop state. Wait for the browser runtime to reconnect before sending new feedback.",
      };
    case "error":
      return {
        tone: "danger",
        title: "Feedback is unavailable after a connection error",
        detail:
          "Shipyard needs the browser runtime connection restored before this page can send another note.",
      };
    default:
      return null;
  }
}

function getActionStatusText(
  sessionState: SessionStateViewModel | null,
  connectionState: WorkbenchConnectionState,
  agentStatus: string,
): string {
  if (!sessionState?.sessionId) {
    return "Shipyard needs an active session before this page can send feedback.";
  }

  switch (connectionState) {
    case "connecting":
      return "Reconnecting to the browser runtime before sending feedback.";
    case "disconnected":
      return "Waiting for the browser runtime to reconnect before sending feedback.";
    case "error":
      return "Feedback is paused until Shipyard restores the runtime connection.";
    default:
      return agentStatus;
  }
}

export function HumanFeedbackPage({
  sessionState,
  previewState,
  turns,
  connectionState,
  agentStatus,
  ultimateState,
  instruction,
  submitLabel,
  submitDisabled = false,
  helpText,
  textareaRef,
  notice,
  onInstructionChange,
  onInstructionKeyDown,
  onSubmit,
  onRefreshStatus,
}: HumanFeedbackPageProps) {
  const recentTurns = turns.slice(0, 4);
  const previewLabel = getPreviewLabel(previewState);
  const connectionLabel = getConnectionLabel(connectionState);
  const effectiveNotice = resolveHumanFeedbackNotice({
    notice,
    sessionState,
    connectionState,
  });
  const canSubmit =
    Boolean(sessionState?.sessionId) &&
    !submitDisabled &&
    (connectionState === "ready" || connectionState === "agent-busy");
  const ultimatePhaseLabel = formatUltimatePhaseLabel(ultimateState.phase);
  const actionStatusText = getActionStatusText(
    sessionState,
    connectionState,
    agentStatus,
  );

  return (
    <main className="human-feedback-page">
      <div className="human-feedback-shell">
        <SurfaceCard className="human-feedback-hero">
          <div className="human-feedback-hero-header">
            <div className="human-feedback-hero-copy">
              <p className="human-feedback-kicker">Ultimate Mode Relay</p>
              <h1>Feed the loop from the human side</h1>
              <p className="human-feedback-summary">
                Send direct notes into the running ultimate-mode session without
                opening the full operator shell. When ultimate mode is active,
                Shipyard queues this for the next simulator review cycle.
              </p>
            </div>

            <div className="human-feedback-links">
              <a className="ghost-action human-feedback-link" href="/">
                Open full workbench
              </a>
              {previewState.url ? (
                <a
                  className="primary-action human-feedback-link"
                  href={previewState.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open current preview
                </a>
              ) : null}
            </div>
          </div>

          <div className="human-feedback-meta">
            <Badge tone={getConnectionTone(connectionState)}>
              {connectionLabel}
            </Badge>
            <Badge tone={getUltimateTone(ultimateState)}>
              Ultimate {ultimatePhaseLabel}
            </Badge>
            <Badge tone="accent">
              {sessionState?.targetLabel ?? "No active target"}
            </Badge>
            {sessionState?.sessionId ? (
              <Badge tone="neutral">
                Session {sessionState.sessionId}
              </Badge>
            ) : null}
          </div>
        </SurfaceCard>

        <div className="human-feedback-grid">
          <SurfaceCard className="human-feedback-card human-feedback-form-card">
            <SectionHeader
              kicker="Human input"
              title="Queue feedback"
              meta={(
                <button
                  type="button"
                  className="ghost-action"
                  onClick={onRefreshStatus}
                >
                  Refresh status
                </button>
              )}
            />

            {effectiveNotice ? (
              <div
                className="human-feedback-notice"
                data-tone={effectiveNotice.tone}
                role={effectiveNotice.tone === "danger" ? "alert" : "status"}
                aria-live={effectiveNotice.tone === "danger" ? "assertive" : "polite"}
              >
                <Badge tone={effectiveNotice.tone}>{effectiveNotice.title}</Badge>
                <p>{effectiveNotice.detail}</p>
              </div>
            ) : null}

            <form className="human-feedback-form" onSubmit={onSubmit}>
              <label className="human-feedback-field" htmlFor="human-feedback-text">
                <span className="human-feedback-label">Feedback for ultimate mode</span>
                <textarea
                  id="human-feedback-text"
                  ref={textareaRef}
                  className="human-feedback-textarea"
                  value={instruction}
                  placeholder="Describe what you want the loop to inspect, fix, or prioritize next."
                  onChange={(event) =>
                    onInstructionChange(event.currentTarget.value)}
                  onKeyDown={onInstructionKeyDown}
                  aria-describedby="human-feedback-hint human-feedback-status"
                />
              </label>

              <p id="human-feedback-hint" className="human-feedback-help">
                {helpText}
              </p>

              <div className="human-feedback-actions">
                <p
                  id="human-feedback-status"
                  className="human-feedback-action-copy"
                >
                  {actionStatusText}
                </p>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={!canSubmit}
                >
                  {submitLabel}
                </button>
              </div>
            </form>
          </SurfaceCard>

          <div className="human-feedback-side">
            <SurfaceCard className="human-feedback-card">
              <SectionHeader kicker="Session" title="Current loop state" />
              <dl className="human-feedback-facts">
                <div>
                  <dt>Connection</dt>
                  <dd>{connectionLabel}</dd>
                </div>
                <div>
                  <dt>Ultimate</dt>
                  <dd>{ultimatePhaseLabel}</dd>
                </div>
                <div>
                  <dt>Agent status</dt>
                  <dd>{agentStatus}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{sessionState?.targetLabel ?? "Waiting for an active target"}</dd>
                </div>
                <div>
                  <dt>Preview</dt>
                  <dd>{previewLabel}</dd>
                </div>
                <div>
                  <dt>Loop turns</dt>
                  <dd>{String(ultimateState.turnCount)}</dd>
                </div>
                <div>
                  <dt>Queued feedback</dt>
                  <dd>{String(ultimateState.pendingFeedbackCount)}</dd>
                </div>
                <div>
                  <dt>Brief</dt>
                  <dd>{ultimateState.currentBrief ?? "No active brief"}</dd>
                </div>
                <div>
                  <dt>Last cycle</dt>
                  <dd>{ultimateState.lastCycleSummary ?? "Waiting for the next loop update"}</dd>
                </div>
              </dl>
            </SurfaceCard>

            <SurfaceCard className="human-feedback-card">
              <SectionHeader
                kicker="Recent activity"
                title="Recent loop activity"
                meta={
                  recentTurns.length > 0 ? (
                    <Badge tone="neutral">{String(recentTurns.length)} turns</Badge>
                  ) : undefined
                }
              />

              {recentTurns.length > 0 ? (
                <ol className="human-feedback-turn-list">
                  {recentTurns.map((turn) => (
                    <li key={turn.id} className="human-feedback-turn-item">
                      <div className="human-feedback-turn-row">
                        <Badge tone={getTurnTone(turn.status)}>
                          {turn.status}
                        </Badge>
                        <span className="human-feedback-turn-time">
                          {turn.startedAt}
                        </span>
                      </div>
                      <h2>{turn.instruction}</h2>
                      <p>{turn.summary}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="human-feedback-empty">
                  Waiting for the loop to produce turn history.
                </p>
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </main>
  );
}
