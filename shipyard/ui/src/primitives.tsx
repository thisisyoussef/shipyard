import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "danger" | "warning";

interface SurfaceCardProps extends PropsWithChildren {
  as?: "section" | "article" | "div";
  className?: string;
}

interface SectionHeaderProps {
  kicker?: string;
  title: string;
  meta?: ReactNode;
}

interface BadgeProps extends PropsWithChildren, HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  className?: string;
}

interface StatusDotProps {
  tone: BadgeTone;
}

function joinClassNames(...parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
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

export function SectionHeader({
  kicker,
  title,
  meta,
}: SectionHeaderProps) {
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

export function StatusDot({ tone }: StatusDotProps) {
  return <span className="status-dot" data-tone={tone} aria-hidden="true" />;
}
