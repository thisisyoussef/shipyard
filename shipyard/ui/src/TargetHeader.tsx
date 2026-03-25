import { Badge, MicroLabel } from "./primitives.js";
import { EnrichmentIndicator } from "./EnrichmentIndicator.js";
import type { TargetManagerViewModel } from "./view-models.js";

interface TargetHeaderProps {
  activePhase: "code" | "target-manager";
  targetManager: TargetManagerViewModel;
  onOpenSwitcher: () => void;
  onRequestEnrichment: () => void;
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

  return "Target selected. Run enrichment to generate a richer project summary.";
}

export function TargetHeader(props: TargetHeaderProps) {
  const description = createTargetDescription(
    props.activePhase,
    props.targetManager,
  );
  const hasSelectedTarget = props.activePhase === "code";

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
        <EnrichmentIndicator
          status={props.targetManager.enrichmentStatus.status}
          message={props.targetManager.enrichmentStatus.message}
          hasProfile={props.targetManager.currentTarget.hasProfile}
          canEnrich={hasSelectedTarget}
          onRequestEnrichment={props.onRequestEnrichment}
        />
        <button
          type="button"
          className="target-primary-action"
          onClick={props.onOpenSwitcher}
        >
          {hasSelectedTarget ? "Change target" : "Browse targets"}
        </button>
      </div>
    </section>
  );
}
