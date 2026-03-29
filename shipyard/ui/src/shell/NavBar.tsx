/**
 * NavBar — Top navigation bar with brand, view links, and ultimate mode badge.
 * UIR-T03 · NavBar Component
 */

import type { Route } from "../router.js";
import { shouldShowUltimateBadge } from "../ultimate-composer.js";
import type { UltimateUiStateViewModel } from "../view-models.js";
import { UltimateBadge } from "./UltimateBadge.js";

export interface NavBarProps {
  currentView: Route["view"];
  editorRoute: Extract<Route, { view: "editor" }> | null;
  boardRoute: Extract<Route, { view: "board" }> | null;
  onNavigate: (route: Route) => void;
  ultimateState: UltimateUiStateViewModel;
  ultimateDisabled?: boolean;
  onUltimateClick: () => void;
  onSendUltimateFeedback: (text: string) => void;
  onStopUltimate: () => void;
}

/* ── Inline SVG brand mark ────────────────────── */

function BrandMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="navbar-brand-logo"
    >
      <polygon points="10,1 19,18 1,18" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/* ── NavBar ────────────────────────────────────── */

export function NavBar({
  currentView,
  editorRoute,
  boardRoute,
  onNavigate,
  ultimateState,
  ultimateDisabled = false,
  onUltimateClick,
  onSendUltimateFeedback,
  onStopUltimate,
}: NavBarProps) {
  const navItems: Array<{ label: string; view: Route["view"]; disabled?: boolean }> = [
    { label: "Dashboard", view: "dashboard" },
    { label: "Editor", view: "editor", disabled: editorRoute === null },
    { label: "Board", view: "board", disabled: boardRoute === null },
  ];

  return (
    <nav className="navbar" aria-label="Main navigation">
      {/* Brand */}
      <button
        type="button"
        className="navbar-brand"
        onClick={() => onNavigate({ view: "dashboard" })}
      >
        <BrandMark />
        <span className="navbar-brand-wordmark">Shipyard</span>
      </button>

      {/* Nav links */}
      <div className="navbar-links">
        {navItems.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`navbar-link${currentView === item.view ? " navbar-link--active" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.view === "editor") {
                if (editorRoute) {
                  onNavigate(editorRoute);
                }
                return;
              }

              if (item.view === "board") {
                if (boardRoute) {
                  onNavigate(boardRoute);
                }
                return;
              }

              onNavigate({ view: item.view } as Route);
            }}
            aria-current={currentView === item.view ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="navbar-spacer" />

      {shouldShowUltimateBadge(ultimateState) ? (
        <UltimateBadge
          phase={ultimateState.phase}
          turnCount={ultimateState.turnCount}
          pendingFeedbackCount={ultimateState.pendingFeedbackCount}
          currentBrief={ultimateState.currentBrief}
          lastCycleSummary={ultimateState.lastCycleSummary}
          onSendFeedback={onSendUltimateFeedback}
          onStop={onStopUltimate}
        />
      ) : (
        <button
          type="button"
          className="navbar-ultimate-badge"
          disabled={ultimateDisabled}
          onClick={onUltimateClick}
          aria-label="Arm ultimate mode in the editor"
        >
          <span className="navbar-ultimate-label">Ultimate</span>
        </button>
      )}
    </nav>
  );
}
