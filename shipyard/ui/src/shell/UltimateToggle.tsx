/**
 * UltimateToggle — Pill-shaped toggle for the composer area.
 * UIR-T03 · Ultimate Mode Toggle
 */

export interface UltimateToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

function LightningIcon() {
  return (
    <svg
      className="ultimate-toggle-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.5 1L3 8h3.5L6 13l5-7H7.5L8.5 1h-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function UltimateToggle({ enabled, onToggle }: UltimateToggleProps) {
  return (
    <button
      type="button"
      className={`ultimate-toggle${enabled ? " ultimate-toggle--active" : ""}`}
      onClick={onToggle}
      aria-pressed={enabled}
    >
      <LightningIcon />
      <span>Ultimate</span>
    </button>
  );
}
