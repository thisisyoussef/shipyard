/**
 * Shipyard base UI primitives.
 *
 * UIR-S01 — Visual System and Layout Refresh
 *
 * These components are the shared building blocks reused across all
 * panels. They consume the visual token system defined in tokens/
 * and should not contain layout-specific positioning.
 */

import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

// ── Types ──────────────────────────────────────

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning";

// ── Helpers ────────────────────────────────────

function joinClassNames(
  ...parts: Array<string | null | undefined | false>
): string {
  return parts.filter(Boolean).join(" ");
}

// ── SurfaceCard ────────────────────────────────

interface SurfaceCardProps extends PropsWithChildren {
  /** Rendered HTML element — defaults to `section`. */
  as?: "section" | "article" | "div";
  className?: string;
}

export function SurfaceCard({
  as = "section",
  className,
  children,
}: SurfaceCardProps) {
  const Component = as;

  return (
    <Component className={joinClassNames("surface-card", className)}>
      {children}
    </Component>
  );
}

// ── SectionHeader ──────────────────────────────

interface SectionHeaderProps {
  /** Uppercase kicker label above the title. */
  kicker?: string;
  /** Section title. */
  title: string;
  /** Optional trailing slot (badges, actions). */
  meta?: ReactNode;
}

export function SectionHeader({ kicker, title, meta }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-header-copy">
        {kicker ? <p className="section-kicker">{kicker}</p> : null}
        <h2>{title}</h2>
      </div>
      {meta ? <div className="section-header-meta">{meta}</div> : null}
    </div>
  );
}

// ── Badge ──────────────────────────────────────

interface BadgeProps
  extends PropsWithChildren,
    HTMLAttributes<HTMLSpanElement> {
  /** Visual tone — maps to `data-tone` attribute for CSS styling. */
  tone?: BadgeTone;
  className?: string;
}

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={joinClassNames("ui-badge", className)}
      data-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}

// ── StatusDot ──────────────────────────────────

interface StatusDotProps {
  /** Visual tone — drives color and optional pulse animation. */
  tone: BadgeTone;
}

export function StatusDot({ tone }: StatusDotProps) {
  return <span className="status-dot" data-tone={tone} aria-hidden="true" />;
}

// ── Divider ────────────────────────────────────

interface DividerProps {
  /** Optional spacing override (CSS class). */
  className?: string;
}

/**
 * Horizontal rule matching the token system's subtle border.
 * Use between logical sections inside a panel.
 */
export function Divider({ className }: DividerProps) {
  return (
    <hr
      className={joinClassNames("ui-divider", className)}
      aria-hidden="true"
    />
  );
}

// ── MicroLabel ─────────────────────────────────

interface MicroLabelProps extends PropsWithChildren {
  className?: string;
}

/**
 * Small uppercase kicker label reusable outside of SectionHeader.
 * Renders as a `<span>` so it can sit inside flex/grid rows.
 */
export function MicroLabel({ className, children }: MicroLabelProps) {
  return (
    <span className={joinClassNames("micro-label", className)}>
      {children}
    </span>
  );
}
