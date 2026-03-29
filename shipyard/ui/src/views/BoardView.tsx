import type { Route } from "../router.js";
import type { BoardViewModel } from "../board-view-model.js";
import { KanbanView } from "./KanbanView.js";
import { RoutePlaceholderView } from "./RoutePlaceholderView.js";

interface BoardViewProps {
  board: BoardViewModel;
  preferredEditorRoute: Extract<Route, { view: "editor" }> | null;
  onNavigate: (route: Route) => void;
  onSelectStory: (storyId: string) => void;
}

export function BoardView({
  board,
  preferredEditorRoute,
  onNavigate,
  onSelectStory,
}: BoardViewProps) {
  if (board.status === "missing-target") {
    return (
      <RoutePlaceholderView
        kicker="Board"
        title={board.emptyState?.title ?? "Select a product first"}
        description={
          board.emptyState?.detail ??
          "Open a product from the dashboard or editor before viewing the task board."
        }
        action={
          <button
            type="button"
            className="target-inline-action"
            onClick={() => onNavigate({ view: "dashboard" })}
          >
            Open dashboard
          </button>
        }
      />
    );
  }

  if (board.status === "loading") {
    return (
      <RoutePlaceholderView
        kicker="Board"
        title={board.emptyState?.title ?? "Loading board"}
        description={
          board.emptyState?.detail ??
          "Shipyard is synchronizing the latest task graph for this product."
        }
        action={
          preferredEditorRoute ? (
            <button
              type="button"
              className="target-inline-action"
              onClick={() => onNavigate(preferredEditorRoute)}
            >
              Return to editor
            </button>
          ) : (
            <button
              type="button"
              className="target-inline-action"
              onClick={() => onNavigate({ view: "dashboard" })}
            >
              Return to dashboard
            </button>
          )
        }
      />
    );
  }

  return (
    <KanbanView
      title="Live task board"
      summary={board.summary}
      states={board.columns}
      tasks={board.tasks}
      selectedStoryId={board.selectedStoryId}
      storyOptions={board.storyOptions}
      notice={board.notice}
      emptyState={board.emptyState}
      onSelectedStoryChange={onSelectStory}
    />
  );
}
