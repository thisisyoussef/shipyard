/**
 * PreviewPanel — Local preview status and inline result surface.
 *
 * Shows the live preview itself plus the smallest navigation affordance needed
 * to open it outside Shipyard. Editor-specific deploy and log chrome lives
 * elsewhere; this panel stays focused on the workspace canvas.
 */

import type { BadgeTone } from "../primitives.js";
import { Badge, StatusDot } from "../primitives.js";
import type { PreviewStateViewModel } from "../view-models.js";

export interface PreviewPanelProps {
  preview: PreviewStateViewModel;
  hostedEditorUrl: string;
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

export function PreviewPanel({
  preview,
  hostedEditorUrl,
}: PreviewPanelProps) {
  const tone = getPreviewTone(preview.status);
  const label = getPreviewLabel(preview.status);
  const showPulse =
    preview.status === "starting" || preview.status === "refreshing";
  const showPreviewLink = preview.url !== null;
  const showPreviewFrame = shouldRenderPreviewFrame(preview);
  const editorUrl = hostedEditorUrl.trim();
  const showEditorLink = !showPreviewLink && editorUrl.length > 0;

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
        {showPreviewFrame ? (
          <div className="preview-frame-shell">
            <iframe
              className="preview-frame"
              title="Local preview"
              src={preview.url ?? undefined}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="preview-empty-state">
            <p className="preview-summary">{preview.summary}</p>
            {preview.lastRestartReason ? (
              <p className="preview-note" data-tone={tone}>
                <strong>{getReasonLabel(preview.status)}:</strong>{" "}
                {preview.lastRestartReason}
              </p>
            ) : null}
          </div>
        )}

        {showPreviewLink ? (
          <div className="preview-toolbar">
            <code className="preview-url">{preview.url}</code>
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
        ) : showEditorLink ? (
          <div className="preview-toolbar">
            <code className="preview-url">{editorUrl}</code>
            <a
              className="target-inline-action preview-open-link"
              href={editorUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open editor at ${editorUrl}`}
            >
              Open editor
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
