import { Badge, type BadgeTone } from "./primitives.js";

interface EnrichmentIndicatorProps {
  status: "idle" | "started" | "in-progress" | "complete" | "error";
  message: string | null;
  hasProfile: boolean;
  canEnrich: boolean;
  onRequestEnrichment: () => void;
}

function getTone(
  status: EnrichmentIndicatorProps["status"],
): BadgeTone {
  if (status === "complete") {
    return "success";
  }

  if (status === "error") {
    return "danger";
  }

  if (status === "started" || status === "in-progress") {
    return "accent";
  }

  return "neutral";
}

export function EnrichmentIndicator(props: EnrichmentIndicatorProps) {
  if (!props.canEnrich) {
    return null;
  }

  if (props.status === "started" || props.status === "in-progress") {
    return (
      <Badge
        className="target-enrichment-pill"
        tone={getTone(props.status)}
        aria-live="polite"
      >
        <span className="target-spinner" aria-hidden="true" />
        {props.message ?? "Analyzing target..."}
      </Badge>
    );
  }

  if (props.status === "error") {
    return (
      <button
        type="button"
        className="target-inline-action target-inline-action-danger"
        onClick={props.onRequestEnrichment}
      >
        Retry enrichment
      </button>
    );
  }

  if (props.hasProfile) {
    return (
      <Badge className="target-enrichment-pill" tone={getTone(props.status)}>
        Enriched
      </Badge>
    );
  }

  return (
    <button
      type="button"
      className="target-inline-action"
      onClick={props.onRequestEnrichment}
    >
      Enrich target
    </button>
  );
}
