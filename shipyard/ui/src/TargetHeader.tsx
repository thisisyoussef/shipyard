import type { BadgeTone } from "./primitives.js";
import { Badge, MicroLabel, StatusDot } from "./primitives.js";
import { EnrichmentIndicator } from "./EnrichmentIndicator.js";
import type {
  LatestDeployViewModel,
  TargetManagerViewModel,
} from "./view-models.js";

interface TargetHeaderProps {
  activePhase: "code" | "target-manager";
  targetManager: TargetManagerViewModel;
  latestDeploy: LatestDeployViewModel;
  onOpenSwitcher: () => void;
}

function createTargetDescription(
  activePhase: TargetHeaderProps["activePhase"],
  targetManager: TargetManagerViewModel,
): string {
  if (targetManager.currentTarget.description) {
    return targetManager.currentTarget.description;
  }

  if (activePhase === "target-manager") {
    return "Select an existing project or create a new scaffold to begin.";
  }

  return "Target selected. Shipyard will analyze it automatically when enough context is available.";
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
    return "Published";
  }

  if (deploy.status === "deploying") {
    return "Publishing";
  }

  if (deploy.status === "error") {
    return "Needs attention";
  }

  return deploy.available ? "Auto-publish ready" : "Publish unavailable";
}

function getOpenAppLabel(deploy: LatestDeployViewModel): string {
  return deploy.status === "error" ? "Open last live app" : "Open app";
}

export function TargetHeader(props: TargetHeaderProps) {
  const description = createTargetDescription(
    props.activePhase,
    props.targetManager,
  );
  const hasSelectedTarget = props.activePhase === "code";
  const deployTone = getDeployTone(props.latestDeploy);
  const deployLabel = getDeployLabel(props.latestDeploy);
  const hasPublicApp = hasSelectedTarget && props.latestDeploy.productionUrl !== null;
  const showPublishPulse = props.latestDeploy.status === "deploying";

  return (
    <section className="target-header" aria-label="Target context">
      <button
        type="button"
        className="target-header-summary"
        onClick={props.onOpenSwitcher}
        aria-haspopup="dialog"
        aria-label={`Open target switcher. Current target: ${props.targetManager.currentTarget.name}`}
      >
        <div className="target-header-copy">
          <MicroLabel>Target</MicroLabel>
          <div className="target-header-row">
            <strong>{props.targetManager.currentTarget.name}</strong>
            {props.targetManager.currentTarget.language ? (
              <Badge tone="neutral">
                {props.targetManager.currentTarget.language}
              </Badge>
            ) : null}
            {props.targetManager.currentTarget.framework ? (
              <Badge tone="accent">
                {props.targetManager.currentTarget.framework}
              </Badge>
            ) : null}
          </div>
          <p className="target-header-description" title={description}>
            {description}
          </p>
        </div>
        <span className="target-header-hint">
          {props.targetManager.availableTargets.length} targets available
        </span>
      </button>

      <div className="target-header-actions">
        <div className="target-status-group">
          <EnrichmentIndicator
            status={props.targetManager.enrichmentStatus.status}
            message={props.targetManager.enrichmentStatus.message}
            hasProfile={props.targetManager.currentTarget.hasProfile}
            canEnrich={hasSelectedTarget}
          />
          {hasSelectedTarget ? (
            <Badge tone={deployTone}>
              <StatusDot tone={deployTone} pulse={showPublishPulse} />
              {deployLabel}
            </Badge>
          ) : null}
        </div>
        <div className="target-action-group">
          {hasPublicApp ? (
            <a
              className="target-primary-action"
              href={props.latestDeploy.productionUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              {getOpenAppLabel(props.latestDeploy)}
            </a>
          ) : null}
          <button
            type="button"
            className={hasSelectedTarget ? "target-inline-action" : "target-primary-action"}
            onClick={props.onOpenSwitcher}
          >
            {hasSelectedTarget ? "Change target" : "Browse targets"}
          </button>
        </div>
        {hasSelectedTarget ? (
          <p className="target-action-hint">
            {props.latestDeploy.summary}
          </p>
        ) : null}
        {hasSelectedTarget &&
        props.latestDeploy.unavailableReason &&
        props.latestDeploy.unavailableReason !== props.latestDeploy.summary ? (
          <p className="target-action-hint">
            {props.latestDeploy.unavailableReason}
          </p>
        ) : null}
        {hasPublicApp ? (
          <code className="target-deploy-url">
            {props.latestDeploy.productionUrl}
          </code>
        ) : null}
        {hasSelectedTarget &&
        props.latestDeploy.status === "error" &&
        props.latestDeploy.logExcerpt ? (
          <details className="target-deploy-log">
            <summary>Provider output excerpt</summary>
            <pre className="target-deploy-log-output">
              {props.latestDeploy.logExcerpt}
            </pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}
