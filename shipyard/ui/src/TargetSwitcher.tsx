import { Badge, MicroLabel } from "./primitives.js";
import type { TargetManagerViewModel } from "./view-models.js";

interface TargetSwitcherProps {
  activePhase: "code" | "target-manager";
  open: boolean;
  targetManager: TargetManagerViewModel;
  onClose: () => void;
  onCreateNew: () => void;
  onSwitchTarget: (targetPath: string) => void;
}

export function TargetSwitcher(props: TargetSwitcherProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div
      className="target-overlay"
      role="presentation"
      onClick={props.onClose}
    >
      <section
        className="target-switcher"
        role="dialog"
        aria-modal="true"
        aria-label="Target switcher"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="target-switcher-header">
          <div>
            <MicroLabel>Project Targets</MicroLabel>
            <h2>Switch or create a working target</h2>
          </div>
          <button
            type="button"
            className="target-close"
            onClick={props.onClose}
            aria-label="Close target switcher"
          >
            Close
          </button>
        </div>

        {props.targetManager.availableTargets.length > 0 ? (
          <div className="target-card-list">
            {props.targetManager.availableTargets.map((target) => {
              const isCurrent =
                props.activePhase === "code" &&
                target.path === props.targetManager.currentTarget.path;

              return (
                <button
                  key={target.path}
                  type="button"
                  className="target-card"
                  onClick={() => props.onSwitchTarget(target.path)}
                  disabled={isCurrent}
                >
                  <div className="target-card-header">
                    <strong>{target.name}</strong>
                    <div className="target-card-badges">
                      {target.language ? (
                        <Badge tone="neutral">{target.language}</Badge>
                      ) : null}
                      {target.framework ? (
                        <Badge tone="accent">{target.framework}</Badge>
                      ) : null}
                      <Badge tone={target.hasProfile ? "success" : "warning"}>
                        {target.hasProfile ? "Enriched" : "Not enriched"}
                      </Badge>
                    </div>
                  </div>
                  <p>
                    {target.description ??
                      "No profile summary yet. Select it and enrich when ready."}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="target-empty-state">
            <MicroLabel>No saved targets</MicroLabel>
            <p>Create the first scaffold from inside the workbench.</p>
          </div>
        )}

        <div className="target-switcher-footer">
          <button
            type="button"
            className="target-primary-action"
            onClick={props.onCreateNew}
          >
            New Target
          </button>
        </div>
      </section>
    </div>
  );
}
