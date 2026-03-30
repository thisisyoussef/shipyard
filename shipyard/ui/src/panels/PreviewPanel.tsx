/**
 * PreviewPanel — Local preview status and inline result surface.
 *
 * Shows the live preview itself plus the smallest navigation affordance needed
 * to open it outside Shipyard. Editor-specific deploy and log chrome lives
 * elsewhere; this panel stays focused on the workspace canvas.
 */

import type { BadgeTone } from "../primitives.js";
import { Badge, StatusDot } from "../primitives.js";
import { normalizePreviewUrl, resolvePreviewSurface } from "../preview-surface.js";
import type { HostingViewModel, PreviewStateViewModel } from "../view-models.js";

export interface PreviewPanelProps {
  preview: PreviewStateViewModel;
  hosting: HostingViewModel;
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
  hosting,
  hostedEditorUrl,
}: PreviewPanelProps) {
  const previewSurface = resolvePreviewSurface({
    privatePreviewUrl: preview.url,
    publicDeploymentUrl: hosting.publicDeploymentUrl,
    hosting,
  });
  const editorUrl = normalizePreviewUrl(hostedEditorUrl);
  const usingDeploymentSurface = previewSurface.source === "public-deploy";
  const usingHostedEditorFallback =
    previewSurface.source === "none" &&
    hosting.active &&
    editorUrl !== null;
  const tone = usingDeploymentSurface
    ? "success"
    : usingHostedEditorFallback
      ? "accent"
      : getPreviewTone(preview.status);
  const label = usingDeploymentSurface
    ? "Live"
    : usingHostedEditorFallback
      ? "Hosted"
      : getPreviewLabel(preview.status);
  const showPulse =
    !usingDeploymentSurface &&
    !usingHostedEditorFallback &&
    (preview.status === "starting" || preview.status === "refreshing");
  const showPreviewLink = previewSurface.previewUrl !== null;
  const showPreviewFrame = showPreviewLink
    ? usingDeploymentSurface || shouldRenderPreviewFrame(preview)
    : false;
  const showEditorLink = !showPreviewLink && editorUrl !== null;
  const panelKicker = usingDeploymentSurface
    ? "Production deploy"
    : usingHostedEditorFallback
      ? "Hosted runtime"
      : "Local preview";
  const panelTitle = usingDeploymentSurface
    ? "Live app ready"
    : usingHostedEditorFallback
      ? "Preview stays inside Shipyard"
      : getPreviewTitle(preview.status);
  const summary = usingDeploymentSurface
    ? "This hosted Shipyard session cannot expose its private loopback preview directly. Showing the latest public deployment instead."
    : usingHostedEditorFallback
      ? "This preview is running inside the hosted Shipyard container and is not reachable from this browser. Open the hosted editor or deploy the app to inspect it."
      : preview.summary;
  const noteLabel = usingDeploymentSurface
    ? "Latest preview status"
    : getReasonLabel(preview.status);
  const showSummaryNote = !usingHostedEditorFallback && preview.lastRestartReason;
  const frameTitle = usingDeploymentSurface ? "Live app" : "Local preview";
  const externalUrl = previewSurface.previewUrl ?? editorUrl;
  const externalLabel = usingDeploymentSurface
    ? "Open app"
    : showPreviewLink
      ? "Open preview"
      : showEditorLink
        ? "Open editor"
        : null;
  const externalAriaLabel = usingDeploymentSurface
    ? `Open live app at ${previewSurface.previewUrl}`
    : showPreviewLink
      ? `Open preview at ${previewSurface.previewUrl}`
      : showEditorLink
        ? `Open editor at ${editorUrl}`
        : null;

  return (
    <section
      className="preview-panel"
      aria-labelledby="preview-panel-title"
      aria-live="polite"
    >
      <div className="panel-header">
        <div>
          <p className="panel-kicker">{panelKicker}</p>
          <h2 id="preview-panel-title" className="panel-title">
            {panelTitle}
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
              title={frameTitle}
              src={previewSurface.previewUrl ?? undefined}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="preview-empty-state">
            <p className="preview-summary">{summary}</p>
            {showSummaryNote ? (
              <p className="preview-note" data-tone={tone}>
                <strong>{noteLabel}:</strong>{" "}
                {preview.lastRestartReason}
              </p>
            ) : null}
          </div>
        )}

        {externalUrl && externalLabel && externalAriaLabel ? (
          <div className="preview-toolbar">
            <code className="preview-url">{externalUrl}</code>
            <a
              className="target-inline-action preview-open-link"
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={externalAriaLabel}
            >
              {externalLabel}
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
