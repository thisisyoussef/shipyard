/**
 * PreviewPanel — Local preview status and inline result surface.
 *
 * Shows preview lifecycle, direct navigation link, embedded result, and recent
 * preview logs without introducing a second UI system.
 */

import type { BadgeTone } from "../primitives.js";
import { Badge, StatusDot } from "../primitives.js";
import type {
  LatestDeployViewModel,
  PreviewStateViewModel,
} from "../view-models.js";

export interface PreviewPanelProps {
  preview: PreviewStateViewModel;
  deploy: LatestDeployViewModel;
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

function getDeployTone(deploy: LatestDeployViewModel): BadgeTone {
  if (deploy.status === "success") {
    return "success";
  }

  if (deploy.status === "deploying") {
    return "accent";
  }

  if (deploy.status === "error") {
    return "danger";
  }

  return deploy.available ? "neutral" : "warning";
}

function getDeployLabel(deploy: LatestDeployViewModel): string {
  if (deploy.status === "success") {
    return "Success";
  }

  if (deploy.status === "deploying") {
    return "Deploying";
  }

  if (deploy.status === "error") {
    return "Error";
  }

  return deploy.available ? "Ready" : "Unavailable";
}

function getProductionUrlLabel(deploy: LatestDeployViewModel): string {
  if (deploy.status === "success") {
    return "Deployed target-app URL";
  }

  if (deploy.status === "deploying") {
    return "Current production URL";
  }

  if (deploy.status === "error" && deploy.productionUrl) {
    return "Last successful production URL";
  }

  return "Target-app URL";
}

export function PreviewPanel({
  preview,
  deploy,
  hostedEditorUrl,
}: PreviewPanelProps) {
  const tone = getPreviewTone(preview.status);
  const label = getPreviewLabel(preview.status);
  const deployTone = getDeployTone(deploy);
  const deployLabel = getDeployLabel(deploy);
  const showPulse =
    preview.status === "starting" || preview.status === "refreshing";
  const showDeployPulse = deploy.status === "deploying";
  const showPreviewLink = preview.url !== null;
  const showPreviewFrame = shouldRenderPreviewFrame(preview);
  const showProductionLink = deploy.productionUrl !== null;

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
        <div className="preview-surface-grid">
          <div className="preview-meta-block preview-surface-card">
            <div className="preview-surface-card-header">
              <div>
                <span className="preview-link-label">Hosted Shipyard URL</span>
                <p className="preview-summary">
                  This is the Railway-hosted Shipyard editor you are using right now.
                </p>
              </div>
            </div>
            <code className="preview-url">{hostedEditorUrl}</code>
          </div>

          <div className="preview-meta-block preview-surface-card">
            <div className="preview-surface-card-header">
              <div>
                <span className="preview-link-label">Production deploy</span>
                <p className="preview-summary">{deploy.summary}</p>
              </div>
              <Badge tone={deployTone}>
                <StatusDot tone={deployTone} pulse={showDeployPulse} />
                {deployLabel}
              </Badge>
            </div>

            {showProductionLink ? (
              <div className="preview-link-row">
                <div className="preview-link-copy">
                  <span className="preview-link-label">
                    {getProductionUrlLabel(deploy)}
                  </span>
                  <code className="preview-url">{deploy.productionUrl}</code>
                </div>
                <a
                  className="target-inline-action preview-open-link"
                  href={deploy.productionUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open deployed app at ${deploy.productionUrl}`}
                >
                  Open deployed app
                </a>
              </div>
            ) : (
              <p className="preview-note" data-tone={deployTone}>
                Deploy to publish a public target-app URL that you can share outside Shipyard.
              </p>
            )}

            {deploy.unavailableReason ? (
              <p className="preview-note" data-tone={deployTone}>
                <strong>Deploy prerequisites:</strong> {deploy.unavailableReason}
              </p>
            ) : null}

            {deploy.command ? (
              <p className="preview-note" data-tone="neutral">
                <strong>Deploy command:</strong> <code>{deploy.command}</code>
              </p>
            ) : null}

            {deploy.status === "error" && deploy.logExcerpt ? (
              <details className="preview-log-shell">
                <summary>Provider output excerpt</summary>
                <pre className="preview-log-output">{deploy.logExcerpt}</pre>
              </details>
            ) : null}
          </div>
        </div>

        <div className="preview-meta-block">
          <p className="preview-summary">{preview.summary}</p>
          <p className="preview-note" data-tone="neutral">
            This preview stays local to the hosted Shipyard workspace until you deploy the target.
          </p>

          {showPreviewLink ? (
            <>
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
            </>
          ) : preview.lastRestartReason ? (
            <p className="preview-note" data-tone={tone}>
              <strong>{getReasonLabel(preview.status)}:</strong>{" "}
              {preview.lastRestartReason}
            </p>
          ) : (
            <div className="context-empty">
              <p className="context-empty-text">
                Shipyard will publish a loopback URL here once the preview
                runtime reports one.
              </p>
            </div>
          )}
        </div>

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
