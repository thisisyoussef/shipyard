/**
 * TaskCard — Individual task card for the Kanban board.
 *
 * UIR — Kanban Board View
 *
 * Shows task title, agent badge, status dot, dependencies,
 * and blocked/active visual states.
 */

import { Badge, StatusDot } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";

export interface TaskCardProps {
  id: string;
  title: string;
  description: string;
  agentId: string | null; // "coordinator" | "explorer" | "verifier" | null
  dependencies: string[];
  blocked: boolean;
  isActive: boolean;
  onHover: (taskId: string | null) => void;
}

interface AgentDisplay {
  label: string;
  symbol: string;
  tone: BadgeTone;
}

function getAgentDisplay(agentId: string | null): AgentDisplay {
  switch (agentId) {
    case "coordinator":
      return { label: "coord.", symbol: "\u25C9", tone: "accent" };
    case "explorer":
      return { label: "explr.", symbol: "\u25C9", tone: "success" };
    case "verifier":
      return { label: "verif.", symbol: "\u25C9", tone: "warning" };
    default:
      return { label: "queued", symbol: "\u25CB", tone: "neutral" };
  }
}

export function TaskCard({
  id,
  title,
  agentId,
  dependencies,
  blocked,
  isActive,
  onHover,
}: TaskCardProps) {
  const agent = getAgentDisplay(agentId);

  const classNames = [
    "task-card",
    blocked ? "task-card--blocked" : null,
    isActive ? "task-card--active" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classNames}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="task-card-header">
        <span className="task-card-title">{title}</span>
        <StatusDot
          tone={isActive ? "accent" : "neutral"}
          pulse={isActive}
        />
      </div>

      <Badge tone={agent.tone}>
        {agent.symbol} {agent.label}
      </Badge>

      {dependencies.length > 0 && (
        <p className="task-card-deps">
          deps: {dependencies.join(", ")}
        </p>
      )}
    </article>
  );
}
