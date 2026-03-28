/**
 * KanbanView — Data-driven Kanban board with mock data.
 *
 * UIR — Kanban Board View
 *
 * Columns are driven by TaskStateDefinition[], not hardcoded.
 * Includes story filtering, hover state, and responsive layout.
 */

import { useState, useMemo } from "react";
import { KanbanColumn } from "./KanbanColumn.js";
import type { TaskStateDefinition, TaskCardData } from "./KanbanColumn.js";

// ── Mock Data ────────────────────────────────────

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

// ── Component ────────────────────────────────────

export function KanbanView() {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<string>("all");

  const sortedStates = useMemo(
    () => [...MOCK_STATES].sort((a, b) => a.order - b.order),
    [],
  );

  const filteredTasks = useMemo(() => {
    if (selectedStory === "all") return MOCK_TASKS;
    const story = MOCK_STORIES.find((s) => s.id === selectedStory);
    if (!story) return MOCK_TASKS;
    const taskIdSet = new Set(story.taskIds);
    return MOCK_TASKS.filter((t) => taskIdSet.has(t.id));
  }, [selectedStory]);

  const hasVisibleTasks = filteredTasks.length > 0;

  return (
    <div className="kanban-view">
      <div className="kanban-toolbar">
        <select
          className="kanban-story-select"
          value={selectedStory}
          onChange={(e) => setSelectedStory(e.target.value)}
          aria-label="Filter by story"
        >
          <option value="all">All stories</option>
          {MOCK_STORIES.map((story) => (
            <option key={story.id} value={story.id}>
              {story.title}
            </option>
          ))}
        </select>
      </div>

      {hasVisibleTasks ? (
        <div className="kanban-board">
          {sortedStates.map((state) => (
            <KanbanColumn
              key={state.id}
              stateDefinition={state}
              tasks={filteredTasks}
              hoveredTaskId={hoveredTaskId}
              onHoverTask={setHoveredTaskId}
            />
          ))}
        </div>
      ) : (
        <div className="kanban-empty">
          <p>No tasks to display.</p>
        </div>
      )}
    </div>
  );
}
