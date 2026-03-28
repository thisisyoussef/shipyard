import type { ReactNode } from "react";

import { SurfaceCard } from "../primitives.js";

interface RoutePlaceholderViewProps {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function RoutePlaceholderView(props: RoutePlaceholderViewProps) {
  return (
    <div className="route-placeholder-shell">
      <SurfaceCard className="route-placeholder-card">
        <p className="route-placeholder-kicker">{props.kicker}</p>
        <h1 className="route-placeholder-title">{props.title}</h1>
        <p className="route-placeholder-description">{props.description}</p>
        {props.action ? (
          <div className="route-placeholder-action">{props.action}</div>
        ) : null}
      </SurfaceCard>
    </div>
  );
}
