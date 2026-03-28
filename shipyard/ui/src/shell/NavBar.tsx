/**
 * NavBar — Top navigation bar with brand, view links, and ultimate mode badge.
 * UIR-T03 · NavBar Component
 */

import type { Route } from "../router.js";

export interface NavBarProps {
  currentView: Route["view"];
  onNavigate: (route: Route) => void;
  ultimateActive: boolean;
  onUltimateClick: () => void;
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
  onNavigate,
  ultimateActive,
  onUltimateClick,
}: NavBarProps) {
  const navItems: Array<{ label: string; view: Route["view"]; disabled?: boolean }> = [
    { label: "Dashboard", view: "dashboard" },
    { label: "Editor", view: "editor", disabled: currentView !== "editor" },
    { label: "Board", view: "board" },
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
              if (item.view === "editor") return; // editor requires productId, handled externally
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

      {/* Ultimate mode badge */}
      <button
        type="button"
        className={`navbar-ultimate-badge${ultimateActive ? " navbar-ultimate-badge--active" : ""}`}
        onClick={onUltimateClick}
        aria-label={ultimateActive ? "Ultimate mode active" : "Activate ultimate mode"}
      >
        {ultimateActive && <span className="navbar-ultimate-dot" aria-hidden="true" />}
        <span className="navbar-ultimate-label">Ultimate</span>
      </button>
    </nav>
  );
}
