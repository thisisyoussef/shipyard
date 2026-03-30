import type { Route } from "../router.js";
import { Badge, MicroLabel, StatusDot, SurfaceCard } from "../primitives.js";
import type {
  ProjectBoardViewModel,
  TargetManagerViewModel,
} from "../view-models.js";

interface DashboardLandingViewProps {
  targetManager: TargetManagerViewModel | null;
  projectBoard: ProjectBoardViewModel | null;
  editorRoute: Extract<Route, { view: "editor" }> | null;
  onNavigate: (route: Route) => void;
}

function createStatusModel(
  targetPath: string,
  projectBoard: ProjectBoardViewModel | null,
): {
  label: string;
  tone: "neutral" | "accent" | "success" | "danger" | "warning";
  pulse: boolean;
} {
  const project = projectBoard?.openProjects.find(
    (openProject) => openProject.targetPath === targetPath,
  );

  switch (project?.status) {
    case "agent-busy":
      return { label: "Working", tone: "accent", pulse: true };
    case "ready":
      return { label: "Ready", tone: "success", pulse: false };
    case "error":
      return { label: "Needs attention", tone: "danger", pulse: false };
    case "connecting":
      return { label: "Connecting", tone: "warning", pulse: true };
    default:
      return { label: "Available", tone: "neutral", pulse: false };
  }
}

export function DashboardLandingView(props: DashboardLandingViewProps) {
  const targets = props.targetManager?.availableTargets ?? [];

  return (
    <div className="dashboard-landing">
      <SurfaceCard className="dashboard-landing-hero">
        <MicroLabel>Phase UI Integration</MicroLabel>
        <h1>Shared app routing is live.</h1>
        <p>
          The workbench is now route-aware. Dashboard and board feature wiring
          will land in follow-up stories, but you can already move through the
          new shell without giving up the live editor runtime.
        </p>

        {props.editorRoute ? (
          <div className="dashboard-landing-actions">
            <button
              type="button"
              className="target-inline-action"
              onClick={() => props.onNavigate(props.editorRoute!)}
            >
              Open active editor
            </button>
          </div>
        ) : null}
      </SurfaceCard>

      <section className="dashboard-landing-targets" aria-label="Available targets">
        <div className="dashboard-landing-section-header">
          <div>
            <MicroLabel>Targets</MicroLabel>
            <h2>Available products</h2>
          </div>
          <p>
            This route stays truthful to current target and project state while
            the richer product-catalog UX lands next.
          </p>
        </div>

        {targets.length > 0 ? (
          <div className="dashboard-landing-grid">
            {targets.map((target) => {
              const status = createStatusModel(target.path, props.projectBoard);

              return (
                <button
                  key={target.path}
                  type="button"
                  className="dashboard-landing-target"
                  onClick={() =>
                    props.onNavigate({
                      view: "editor",
                      productId: target.path,
                    })}
                >
                  <div className="dashboard-landing-target-row">
                    <strong>{target.name}</strong>
                    <Badge tone={status.tone}>
                      <StatusDot tone={status.tone} pulse={status.pulse} />
                      {status.label}
                    </Badge>
                  </div>
                  <p className="dashboard-landing-target-meta">
                    {target.framework ?? target.language ?? "Unknown stack"}
                  </p>
                  {target.description ? (
                    <p className="dashboard-landing-target-description">
                      {target.description}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <SurfaceCard className="dashboard-landing-empty">
            <p>
              No targets are available yet. Keep using the current workbench
              creation flow while the dedicated dashboard launch flow lands.
            </p>
          </SurfaceCard>
        )}
      </section>
    </div>
  );
}
