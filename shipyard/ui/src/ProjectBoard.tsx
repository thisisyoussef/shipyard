import { Badge, MicroLabel, StatusDot } from "./primitives.js";
import type { ProjectBoardViewModel } from "./view-models.js";

interface ProjectBoardProps {
  projectBoard: ProjectBoardViewModel | null;
  onActivateProject: (projectId: string) => void;
  onOpenTargets: () => void;
}

function createStatusTone(
  status: ProjectBoardViewModel["openProjects"][number]["status"],
): "neutral" | "accent" | "success" | "danger" | "warning" {
  switch (status) {
    case "ready":
      return "success";
    case "agent-busy":
      return "accent";
    case "error":
      return "danger";
    case "connecting":
      return "warning";
    default:
      return "neutral";
  }
}

function createStatusLabel(
  status: ProjectBoardViewModel["openProjects"][number]["status"],
): string {
  switch (status) {
    case "agent-busy":
      return "Working";
    case "ready":
      return "Ready";
    case "error":
      return "Needs attention";
    case "connecting":
      return "Connecting";
    default:
      return "Offline";
  }
}

export function ProjectBoard(props: ProjectBoardProps) {
  const openProjects = props.projectBoard?.openProjects ?? [];

  return (
    <section className="project-board" aria-label="Open projects">
      <div className="project-board-header">
        <div className="project-board-copy">
          <MicroLabel>Workbench</MicroLabel>
          <h2>Open projects</h2>
        </div>
        <button
          type="button"
          className="target-inline-action"
          onClick={props.onOpenTargets}
        >
          Open or create
        </button>
      </div>

      {openProjects.length > 0 ? (
        <div className="project-board-strip">
          {openProjects.map((project) => {
            const tone = createStatusTone(project.status);
            const isActive = project.projectId === props.projectBoard?.activeProjectId;

            return (
              <button
                key={project.projectId}
                type="button"
                className="project-board-item"
                data-active={isActive}
                aria-current={isActive ? "true" : undefined}
                onClick={() => props.onActivateProject(project.projectId)}
              >
                <div className="project-board-item-row">
                  <strong>{project.targetName}</strong>
                  <Badge tone={tone}>
                    <StatusDot tone={tone} pulse={project.status === "agent-busy"} />
                    {createStatusLabel(project.status)}
                  </Badge>
                </div>
                <p className="project-board-item-status">
                  {project.agentStatus}
                </p>
                {project.description ? (
                  <p className="project-board-item-description">
                    {project.description}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="project-board-empty">
          Open a target to keep multiple projects within reach.
        </p>
      )}
    </section>
  );
}
