import { useEffect, useRef, type ReactNode } from "react";

import { HostedAccessGate } from "./HostedAccessGate.js";
import { HumanFeedbackPage } from "./HumanFeedbackPage.js";
import { ShipyardWorkbench } from "./ShipyardWorkbench.js";
import {
  getPreferredEditorRoute,
  resolveAppRoute,
  selectEditorRouteState,
  type EditorRouteState,
} from "./app-route.js";
import type { Route } from "./router.js";
import { NavBar } from "./shell/NavBar.js";
import {
  extractBootstrapAccessToken,
  resolveUiPage,
  shouldCancelBusyInstructionOnSubmit,
  useWorkbenchController,
} from "./use-workbench-controller.js";
import { useRouter } from "./use-router.js";
import { DashboardLandingView } from "./views/DashboardLandingView.js";
import { RoutePlaceholderView } from "./views/RoutePlaceholderView.js";

export {
  extractBootstrapAccessToken,
  resolveUiPage,
  shouldCancelBusyInstructionOnSubmit,
} from "./use-workbench-controller.js";

function getEditorIntentKey(
  routeState: EditorRouteState | null,
): string | null {
  if (!routeState || routeState.status !== "opening") {
    return null;
  }

  switch (routeState.intent.kind) {
    case "activate-project":
      return `activate:${routeState.intent.projectId}`;
    case "switch-target":
      return `switch:${routeState.intent.targetPath}`;
    case "none":
      return null;
  }
}

function isEditorRouteLoading(
  route: Route,
  routeState: EditorRouteState | null,
  hasLoadedWorkbenchState: boolean,
): boolean {
  return (
    route.view === "editor" &&
    routeState?.status === "missing" &&
    !hasLoadedWorkbenchState
  );
}

export function App() {
  const controller = useWorkbenchController();
  const { navigate } = useRouter();
  const requestedEditorIntentRef = useRef<string | null>(null);
  const shouldFollowCreatedTargetRef = useRef(false);
  const appRoute = resolveAppRoute(
    typeof window === "undefined" ? "/" : window.location.pathname,
    typeof window === "undefined" ? "" : window.location.hash,
  );
  const preferredEditorRoute = getPreferredEditorRoute(
    controller.viewState.projectBoard,
    controller.viewState.targetManager,
  );
  const navEditorRoute =
    appRoute.view === "editor" ? appRoute : preferredEditorRoute;
  const editorRouteState = appRoute.view === "editor"
    ? selectEditorRouteState({
        productId: appRoute.productId,
        projectBoard: controller.viewState.projectBoard,
        targetManager: controller.viewState.targetManager,
      })
    : null;
  const hasLoadedWorkbenchState =
    controller.viewState.targetManager !== null ||
    controller.viewState.projectBoard !== null;
  const loadingEditorRoute = isEditorRouteLoading(
    appRoute,
    editorRouteState,
    hasLoadedWorkbenchState,
  );

  useEffect(() => {
    const intentKey = getEditorIntentKey(editorRouteState);
    const nextEditorRouteState = editorRouteState;

    if (
      !controller.hasUnlockedAccess ||
      appRoute.view !== "editor" ||
      !nextEditorRouteState ||
      !intentKey ||
      loadingEditorRoute
    ) {
      requestedEditorIntentRef.current = null;
      return;
    }

    if (requestedEditorIntentRef.current === intentKey) {
      return;
    }

    requestedEditorIntentRef.current = intentKey;

    switch (nextEditorRouteState.intent.kind) {
      case "activate-project":
        controller.onActivateProject(nextEditorRouteState.intent.projectId);
        return;
      case "switch-target":
        controller.onRequestTargetSwitch(nextEditorRouteState.intent.targetPath);
        return;
      case "none":
        return;
    }
  }, [
    appRoute,
    controller,
    editorRouteState,
    loadingEditorRoute,
  ]);

  useEffect(() => {
    if (!shouldFollowCreatedTargetRef.current || appRoute.view !== "editor") {
      return;
    }

    if (!preferredEditorRoute) {
      return;
    }

    if (preferredEditorRoute.productId === appRoute.productId) {
      shouldFollowCreatedTargetRef.current = false;
      return;
    }

    shouldFollowCreatedTargetRef.current = false;
    navigate(preferredEditorRoute);
  }, [appRoute, navigate, preferredEditorRoute]);

  function handleNavigateToEditor(targetPath: string): void {
    navigate({
      view: "editor",
      productId: targetPath,
    });
  }

  function handleActivateProject(projectId: string): void {
    const project = controller.viewState.projectBoard?.openProjects.find(
      (openProject) => openProject.projectId === projectId,
    );

    if (!project) {
      controller.onActivateProject(projectId);
      return;
    }

    handleNavigateToEditor(project.targetPath);
  }

  function handleTargetCreate(
    input: Parameters<typeof controller.onRequestTargetCreate>[0],
  ): void {
    shouldFollowCreatedTargetRef.current = true;
    controller.onRequestTargetCreate(input);
  }

  function renderEditorContent(): ReactNode {
    if (loadingEditorRoute) {
      return (
        <RoutePlaceholderView
          kicker="Editor"
          title="Loading workspace"
          description="Shipyard is resolving the editor route against the live target state."
        />
      );
    }

    if (!editorRouteState) {
      return null;
    }

    if (editorRouteState.status === "opening") {
      return (
        <RoutePlaceholderView
          kicker="Editor"
          title={`Opening ${editorRouteState.productName ?? "workspace"}`}
          description="Shipyard is synchronizing the requested project with the live browser session."
          action={
            preferredEditorRoute ? (
              <button
                type="button"
                className="target-inline-action"
                onClick={() => navigate(preferredEditorRoute)}
              >
                Open active editor instead
              </button>
            ) : undefined
          }
        />
      );
    }

    if (editorRouteState.status === "missing") {
      return (
        <RoutePlaceholderView
          kicker="Editor"
          title="This product is not available"
          description="The requested product route does not match any open project or known target in the current Shipyard session."
          action={
            <button
              type="button"
              className="target-inline-action"
              onClick={() => navigate({ view: "dashboard" })}
            >
              Return to dashboard
            </button>
          }
        />
      );
    }

    return (
      <ShipyardWorkbench
        sessionState={controller.viewState.sessionState}
        sessionHistory={controller.viewState.sessionHistory}
        targetManager={controller.viewState.targetManager}
        projectBoard={controller.viewState.projectBoard}
        turns={controller.deferredTurns}
        fileEvents={controller.deferredFileEvents}
        previewState={controller.viewState.previewState}
        latestDeploy={controller.viewState.latestDeploy}
        contextHistory={controller.deferredContextHistory}
        pendingUploads={controller.viewState.pendingUploads}
        connectionState={controller.viewState.connectionState}
        agentStatus={controller.viewState.agentStatus}
        instruction={controller.instruction}
        contextDraft={controller.contextDraft}
        composerNotice={controller.composerNotice}
        composerAttachments={controller.composerAttachments}
        instructionInputRef={controller.instructionInputRef}
        contextInputRef={controller.contextInputRef}
        onInstructionChange={controller.onInstructionChange}
        onContextChange={controller.onContextChange}
        onInstructionKeyDown={controller.onInstructionKeyDown}
        onContextKeyDown={controller.onContextKeyDown}
        onClearContext={controller.onClearContext}
        onAttachFiles={controller.onAttachFiles}
        onSubmitInstruction={controller.onSubmitInstruction}
        onCancelInstruction={controller.onCancelInstruction}
        onRemoveAttachment={controller.onRemoveAttachment}
        onRequestSessionResume={controller.onRequestSessionResume}
        onRequestTargetSwitch={handleNavigateToEditor}
        onRequestTargetCreate={handleTargetCreate}
        onActivateProject={handleActivateProject}
        onRefreshStatus={controller.onRefreshStatus}
        onCopyTracePath={controller.onCopyTracePath}
        traceButtonLabel={controller.traceButtonLabel}
        leftSidebarOpen={controller.leftSidebarOpen}
        rightSidebarOpen={controller.rightSidebarOpen}
        onToggleLeftSidebar={controller.onToggleLeftSidebar}
        onToggleRightSidebar={controller.onToggleRightSidebar}
      />
    );
  }

  if (!controller.hasUnlockedAccess) {
    return (
      <HostedAccessGate
        accessToken={controller.accessToken}
        checking={!controller.accessState.checked}
        submitting={controller.accessSubmitting}
        message={controller.accessState.message}
        onAccessTokenChange={controller.onAccessTokenChange}
        onSubmit={controller.onAccessSubmit}
      />
    );
  }

  if (appRoute.view === "human-feedback") {
    return (
      <HumanFeedbackPage
        sessionState={controller.viewState.sessionState}
        previewState={controller.viewState.previewState}
        turns={controller.deferredTurns}
        connectionState={controller.viewState.connectionState}
        agentStatus={controller.viewState.agentStatus}
        instruction={controller.humanFeedbackInstruction}
        textareaRef={controller.humanFeedbackInputRef}
        notice={controller.composerNotice}
        onInstructionChange={controller.onHumanFeedbackInstructionChange}
        onInstructionKeyDown={controller.onHumanFeedbackKeyDown}
        onSubmit={controller.onSubmitHumanFeedback}
        onRefreshStatus={controller.onRefreshStatus}
      />
    );
  }

  return (
    <div className="app-route-shell">
      <NavBar
        currentView={appRoute.view}
        editorRoute={navEditorRoute}
        boardDisabled={true}
        onNavigate={navigate}
        ultimateActive={false}
        ultimateDisabled={true}
        onUltimateClick={() => undefined}
      />

      <main className="app-route-content">
        {appRoute.view === "dashboard" ? (
          <DashboardLandingView
            targetManager={controller.viewState.targetManager}
            projectBoard={controller.viewState.projectBoard}
            editorRoute={preferredEditorRoute}
            onNavigate={navigate}
          />
        ) : null}

        {appRoute.view === "editor" ? renderEditorContent() : null}

        {appRoute.view === "board" ? (
          <RoutePlaceholderView
            kicker="Board"
            title="Kanban is parked for now"
            description="The shared route shell is live, but the production board projection is intentionally waiting for its dedicated backend story."
            action={
              preferredEditorRoute ? (
                <button
                  type="button"
                  className="target-inline-action"
                  onClick={() => navigate(preferredEditorRoute)}
                >
                  Return to editor
                </button>
              ) : (
                <button
                  type="button"
                  className="target-inline-action"
                  onClick={() => navigate({ view: "dashboard" })}
                >
                  Return to dashboard
                </button>
              )
            }
          />
        ) : null}
      </main>
    </div>
  );
}
