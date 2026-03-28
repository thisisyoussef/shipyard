/**
 * KanbanColumn — A single column in the Kanban board.
 *
 * UIR — Kanban Board View
 *
 * Renders a column header with state label and count badge,
 * plus a scrollable list of TaskCards filtered to this column's state.
 */

import { Badge } from "../primitives.js";
import { TaskCard } from "./TaskCard.js";

export interface TaskStateDefinition {
  id: string;
  label: string;
  order: number;
  agentAffinity?: string;
}

export interface TaskCardData {
  id: string;
  title: string;
  description: string;
  state: string;
  agentId: string | null;
  storyId: string | null;
  dependencies: string[];
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumnProps {
  stateDefinition: TaskStateDefinition;
  tasks: TaskCardData[];
  hoveredTaskId: string | null;
  onHoverTask: (taskId: string | null) => void;
}

export function KanbanColumn({
  stateDefinition,
  tasks,
  hoveredTaskId,
  onHoverTask,
}: KanbanColumnProps) {
  const columnTasks = tasks.filter((t) => t.state === stateDefinition.id);

  return (
    <div className="kanban-column">
      <div className="kanban-column-header">
        <span className="kanban-column-label">{stateDefinition.label}</span>
        <Badge tone="neutral">{columnTasks.length}</Badge>
      </div>

      <div className="kanban-column-cards">
        {columnTasks.map((task) => (
          <TaskCard
            key={task.id}
            id={task.id}
            title={task.title}
            description={task.description}
            agentId={task.agentId}
            dependencies={task.dependencies}
            blocked={task.blocked}
            isActive={hoveredTaskId === task.id}
            onHover={onHoverTask}
          />
        ))}
      </div>
    </div>
  );
}
