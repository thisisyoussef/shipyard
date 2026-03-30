/**
 * KanbanView — Data-driven Kanban board.
 *
 * The production app passes real board state through props. When no props are
 * provided, the preview harness still renders the original mock board.
 */

import { useMemo, useState } from "react";

import type { BadgeTone } from "../primitives.js";
import { Badge } from "../primitives.js";
import { KanbanColumn } from "./KanbanColumn.js";
import type { TaskStateDefinition, TaskCardData } from "./KanbanColumn.js";

const MOCK_STATES: TaskStateDefinition[] = [
  { id: "backlog", label: "Backlog", order: 0 },
  { id: "discovery", label: "Discovery", order: 1, agentAffinity: "explorer" },
  { id: "planning", label: "Planning", order: 2, agentAffinity: "coordinator" },
  { id: "coding", label: "Coding", order: 3, agentAffinity: "coordinator" },
  { id: "verifying", label: "Verifying", order: 4, agentAffinity: "verifier" },
  { id: "review", label: "Review", order: 5 },
  { id: "done", label: "Done", order: 6 },
];

const MOCK_TASKS: TaskCardData[] = [
  {
    id: "task-1",
    title: "Set up database schema",
    description: "Create the initial DB schema",
    state: "done",
    agentId: "coordinator",
    storyId: "story-1",
    dependencies: [],
    blocked: false,
    createdAt: "2026-03-28T10:00:00Z",
    updatedAt: "2026-03-28T10:30:00Z",
  },
  {
    id: "task-2",
    title: "Design auth API",
    description: "Plan the authentication endpoints",
    state: "planning",
    agentId: "coordinator",
    storyId: "story-1",
    dependencies: [],
    blocked: false,
    createdAt: "2026-03-28T10:00:00Z",
    updatedAt: "2026-03-28T11:00:00Z",
  },
  {
    id: "task-3",
    title: "Implement login form",
    description: "Build the login UI",
    state: "coding",
    agentId: "coordinator",
    storyId: "story-1",
    dependencies: ["task-1", "task-2"],
    blocked: false,
    createdAt: "2026-03-28T11:00:00Z",
    updatedAt: "2026-03-28T11:30:00Z",
  },
  {
    id: "task-4",
    title: "Create session management",
    description: "Handle user sessions",
    state: "coding",
    agentId: "explorer",
    storyId: "story-1",
    dependencies: ["task-2"],
    blocked: false,
    createdAt: "2026-03-28T11:00:00Z",
    updatedAt: "2026-03-28T12:00:00Z",
  },
  {
    id: "task-5",
    title: "Write tests for signup",
    description: "Test coverage for signup flow",
    state: "verifying",
    agentId: "verifier",
    storyId: "story-1",
    dependencies: ["task-3", "task-4"],
    blocked: false,
    createdAt: "2026-03-28T12:00:00Z",
    updatedAt: "2026-03-28T12:30:00Z",
  },
  {
    id: "task-6",
    title: "Build signup flow",
    description: "User registration",
    state: "backlog",
    agentId: null,
    storyId: "story-1",
    dependencies: ["task-2"],
    blocked: true,
    createdAt: "2026-03-28T10:00:00Z",
    updatedAt: "2026-03-28T10:00:00Z",
  },
  {
    id: "task-7",
    title: "Set up CI pipeline",
    description: "GitHub Actions",
    state: "discovery",
    agentId: "explorer",
    storyId: "story-2",
    dependencies: [],
    blocked: false,
    createdAt: "2026-03-28T09:00:00Z",
    updatedAt: "2026-03-28T09:30:00Z",
  },
  {
    id: "task-8",
    title: "Review auth middleware",
    description: "Security review",
    state: "review",
    agentId: null,
    storyId: "story-1",
    dependencies: ["task-3"],
    blocked: false,
    createdAt: "2026-03-28T13:00:00Z",
    updatedAt: "2026-03-28T13:00:00Z",
  },
];

interface MockStory {
  id: string;
  title: string;
  taskIds: string[];
}

const MOCK_STORIES: MockStory[] = [
  {
    id: "story-1",
    title: "User authentication",
    taskIds: [
      "task-1",
      "task-2",
      "task-3",
      "task-4",
      "task-5",
      "task-6",
      "task-8",
    ],
  },
  { id: "story-2", title: "DevOps setup", taskIds: ["task-7"] },
];

export interface KanbanStoryOption {
  id: string;
  label: string;
  taskCount: number;
}

export interface KanbanNotice {
  tone: BadgeTone;
  title: string;
  detail: string;
}

export interface KanbanEmptyState {
  title: string;
  detail: string;
}

export interface KanbanViewProps {
  title?: string;
  summary?: string | null;
  states?: TaskStateDefinition[];
  tasks?: TaskCardData[];
  selectedStoryId?: string;
  storyOptions?: KanbanStoryOption[];
  notice?: KanbanNotice | null;
  emptyState?: KanbanEmptyState | null;
  onSelectedStoryChange?: (storyId: string) => void;
}

const DEFAULT_STORY_OPTIONS: KanbanStoryOption[] = [
  { id: "all", label: "All stories", taskCount: MOCK_TASKS.length },
  ...MOCK_STORIES.map((story) => ({
    id: story.id,
    label: story.title,
    taskCount: story.taskIds.length,
  })),
];

export function KanbanView(props: KanbanViewProps = {}) {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [internalSelectedStoryId, setInternalSelectedStoryId] = useState("all");
  const controlledSelection = typeof props.selectedStoryId === "string";
  const selectedStoryId = controlledSelection
    ? props.selectedStoryId!
    : internalSelectedStoryId;
  const stateDefinitions = useMemo(
    () =>
      [...(props.states ?? MOCK_STATES)].sort((left, right) => left.order - right.order),
    [props.states],
  );
  const storyOptions = props.storyOptions ?? DEFAULT_STORY_OPTIONS;
  const usesMockTasks = props.tasks === undefined;
  const tasks = useMemo(() => {
    if (!usesMockTasks) {
      return props.tasks ?? [];
    }

    if (selectedStoryId === "all") {
      return MOCK_TASKS;
    }

    const story = MOCK_STORIES.find((candidate) => candidate.id === selectedStoryId);

    if (!story) {
      return MOCK_TASKS;
    }

    const taskIds = new Set(story.taskIds);
    return MOCK_TASKS.filter((task) => taskIds.has(task.id));
  }, [props.tasks, selectedStoryId, usesMockTasks]);
  const selectedStoryLabel =
    storyOptions.find((option) => option.id === selectedStoryId)?.label ?? "All stories";

  function handleSelectedStoryChange(nextStoryId: string): void {
    if (!controlledSelection) {
      setInternalSelectedStoryId(nextStoryId);
    }

    props.onSelectedStoryChange?.(nextStoryId);
  }

  return (
    <div className="kanban-view">
      <div className="kanban-header">
        <div className="kanban-header-copy">
          <p className="kanban-kicker">Board</p>
          <h1 className="kanban-title">{props.title ?? "Task board"}</h1>
          {props.summary ? (
            <p className="kanban-summary">{props.summary}</p>
          ) : null}
        </div>

        <div className="kanban-header-meta">
          <Badge tone="neutral">{tasks.length} visible</Badge>
          <Badge tone={selectedStoryId === "all" ? "accent" : "warning"}>
            {selectedStoryLabel}
          </Badge>
        </div>
      </div>

      {props.notice ? (
        <div
          className="surface-card kanban-notice"
          data-tone={props.notice.tone}
          role={props.notice.tone === "danger" ? "alert" : "status"}
          aria-live={props.notice.tone === "danger" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <strong>{props.notice.title}</strong>
          <p>{props.notice.detail}</p>
        </div>
      ) : null}

      <div className="kanban-toolbar">
        <label className="kanban-toolbar-label" htmlFor="kanban-story-filter">
          Story filter
        </label>
        <select
          id="kanban-story-filter"
          className="kanban-story-select"
          value={selectedStoryId}
          onChange={(event) => handleSelectedStoryChange(event.target.value)}
          aria-label="Filter by story"
        >
          {storyOptions.map((story) => (
            <option key={story.id} value={story.id}>
              {story.label} ({story.taskCount})
            </option>
          ))}
        </select>
      </div>

      {tasks.length > 0 ? (
        <div className="kanban-board">
          {stateDefinitions.map((stateDefinition) => (
            <KanbanColumn
              key={stateDefinition.id}
              stateDefinition={stateDefinition}
              tasks={tasks}
              hoveredTaskId={hoveredTaskId}
              onHoverTask={setHoveredTaskId}
            />
          ))}
        </div>
      ) : (
        <div className="kanban-empty">
          <div className="surface-card kanban-empty-card">
            <h2>{props.emptyState?.title ?? "No tasks to display"}</h2>
            <p>
              {props.emptyState?.detail ??
                "Shipyard will populate the board once work has been planned for this product."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
