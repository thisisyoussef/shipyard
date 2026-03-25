/**
 * PreviewPanel — Local preview status and inline result surface.
 *
 * Shows preview lifecycle, direct navigation link, embedded result, and recent
 * preview logs without introducing a second UI system.
 */

import type { BadgeTone } from "../primitives.js";
import { Badge, StatusDot } from "../primitives.js";
import type { PreviewStateViewModel } from "../view-models.js";

export interface PreviewPanelProps {
  preview: PreviewStateViewModel;
}

function getPreviewTone(status: PreviewStateViewModel["status"]): BadgeTone {
  switch (status) {
    case "running":
      return "success";
    case "starting":
    case "refreshing":
      return "accent";
    case "error":
    case "exited":
      return "danger";
    case "unavailable":
      return "warning";
    case "idle":
    default:
      return "neutral";
  }
}

function getPreviewLabel(status: PreviewStateViewModel["status"]): string {
  switch (status) {
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "refreshing":
      return "Refreshing";
    case "error":
      return "Error";
    case "exited":
      return "Stopped";
    case "unavailable":
      return "Unavailable";
    case "idle":
    default:
      return "Idle";
  }
}

function getPreviewTitle(status: PreviewStateViewModel["status"]): string {
  switch (status) {
    case "running":
      return "Preview ready";
    case "refreshing":
      return "Preview updating";
    case "starting":
      return "Preview booting";
    case "error":
      return "Preview needs attention";
    case "exited":
      return "Preview stopped";
    case "unavailable":
      return "Preview unavailable";
    case "idle":
    default:
      return "Waiting for preview";
  }
}

function getReasonLabel(status: PreviewStateViewModel["status"]): string {
  switch (status) {
    case "refreshing":
    case "running":
      return "Latest refresh";
    case "error":
      return "Failure details";
    case "exited":
      return "Exit details";
    case "unavailable":
      return "Why it is unavailable";
    case "starting":
      return "Startup note";
    case "idle":
    default:
      return "Latest note";
  }
}

function shouldRenderPreviewFrame(
  preview: PreviewStateViewModel,
): boolean {
  return (
    preview.url !== null &&
    (preview.status === "running" || preview.status === "refreshing")
  );
}

export function PreviewPanel({ preview }: PreviewPanelProps) {
  const tone = getPreviewTone(preview.status);
  const label = getPreviewLabel(preview.status);
  const showPulse =
    preview.status === "starting" || preview.status === "refreshing";
  const showPreviewLink = preview.url !== null;
  const showPreviewFrame = shouldRenderPreviewFrame(preview);

  return (
    <section
      className="preview-panel"
      aria-labelledby="preview-panel-title"
      aria-live="polite"
    >
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Local preview</p>
          <h2 id="preview-panel-title" className="panel-title">
            {getPreviewTitle(preview.status)}
          </h2>
        </div>
        <Badge tone={tone}>
          <StatusDot tone={tone} pulse={showPulse} />
          {label}
        </Badge>
      </div>

      <div className="panel-preview">
        <p className="preview-summary">{preview.summary}</p>

        {showPreviewLink ? (
          <div className="preview-meta-block">
            <div className="preview-link-row">
              <div className="preview-link-copy">
                <span className="preview-link-label">Direct link</span>
                <code className="preview-url">{preview.url}</code>
              </div>
              <a
                className="target-inline-action preview-open-link"
                href={preview.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open preview at ${preview.url}`}
              >
                Open preview
              </a>
            </div>

            {preview.lastRestartReason ? (
              <p className="preview-note" data-tone={tone}>
                <strong>{getReasonLabel(preview.status)}:</strong>{" "}
                {preview.lastRestartReason}
              </p>
            ) : null}
          </div>
        ) : preview.lastRestartReason ? (
          <div className="preview-meta-block">
            <p className="preview-note" data-tone={tone}>
              <strong>{getReasonLabel(preview.status)}:</strong>{" "}
              {preview.lastRestartReason}
            </p>
          </div>
        ) : (
          <div className="context-empty">
            <p className="context-empty-text">
              Shipyard will publish a loopback URL here once the preview
              runtime reports one.
            </p>
          </div>
        )}

        {showPreviewFrame ? (
          <div className="preview-frame-shell">
            <iframe
              className="preview-frame"
              title="Local preview"
              src={preview.url ?? undefined}
              loading="lazy"
            />
          </div>
        ) : null}

        {preview.logTail.length > 0 ? (
          <details className="preview-log-shell">
            <summary>Recent preview logs</summary>
            <pre className="preview-log-output">
              {preview.logTail.join("\n")}
            </pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}
