import { Badge, type BadgeTone } from "./primitives.js";

interface EnrichmentIndicatorProps {
  status: "idle" | "queued" | "started" | "in-progress" | "complete" | "error";
  message: string | null;
  hasProfile: boolean;
  canEnrich: boolean;
}

function getTone(
  status: EnrichmentIndicatorProps["status"],
  hasProfile: boolean,
): BadgeTone {
  if (status === "complete" || hasProfile) {
    return "success";
  }

  if (status === "error") {
    return "danger";
  }

  if (
    status === "queued" ||
    status === "started" ||
    status === "in-progress"
  ) {
    return "accent";
  }

  return "neutral";
}

function createStatusLabel(
  props: EnrichmentIndicatorProps,
): string {
  if (props.message) {
    return props.message;
  }

  if (props.status === "complete" || props.hasProfile) {
    return "Ready";
  }

  if (props.status === "error") {
    return "Analysis unavailable";
  }

  if (
    props.status === "queued" ||
    props.status === "started" ||
    props.status === "in-progress"
  ) {
    return "Analyzing target...";
  }

  return "Analysis pending";
}

export function EnrichmentIndicator(props: EnrichmentIndicatorProps) {
  if (!props.canEnrich) {
    return null;
  }

  const showSpinner =
    props.status === "queued" ||
    props.status === "started" ||
    props.status === "in-progress";

  return (
    <Badge
      className="target-enrichment-pill"
      tone={getTone(props.status, props.hasProfile)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {showSpinner ? (
        <span className="target-spinner" aria-hidden="true" />
      ) : null}
      {createStatusLabel(props)}
    </Badge>
  );
}
