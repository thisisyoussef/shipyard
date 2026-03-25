import { useState } from "react";

import { Badge, StatusDot } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";
import type { ActivityItemViewModel, TurnViewModel } from "../view-models.js";

export interface LiveViewPanelProps {
  turns: TurnViewModel[];
  tracePath: string | null;
}

type ActivityScope = "latest" | "all";

interface LiveStep {
  id: string;
  turn: TurnViewModel;
  step: ActivityItemViewModel;
}

function getTone(status: TurnViewModel["status"] | ActivityItemViewModel["tone"]): BadgeTone {
  switch (status) {
    case "success":
      return "success";
    case "error":
    case "danger":
      return "danger";
    case "working":
      return "accent";
    default:
      return "neutral";
  }
}

function getStepLabel(step: ActivityItemViewModel): string {
  if (step.kind === "edit") {
    return step.detail;
  }

  if (step.command) {
    return step.command;
  }

  return step.detail || step.title;
}

function buildSteps(turns: TurnViewModel[], scope: ActivityScope): LiveStep[] {
  const visibleTurns = scope === "all" ? turns : turns.slice(0, 1);

  return visibleTurns.flatMap((turn) =>
    turn.activity.map((step) => ({
      id: `${turn.id}:${step.id}`,
      turn,
      step,
    })),
  );
}

function findDefaultStep(steps: LiveStep[]): LiveStep | null {
  return steps.find((entry) => entry.step.kind === "edit") ?? steps[0] ?? null;
}

export function LiveViewPanel({ turns, tracePath }: LiveViewPanelProps) {
  const [scope, setScope] = useState<ActivityScope>("latest");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const steps = buildSteps(turns, scope);
  const selectedStep =
    steps.find((entry) => entry.id === selectedStepId) ?? findDefaultStep(steps);

  return (
    <section className="live-view-panel" aria-labelledby="live-view-title">
      <div className="live-view-header">
        <div>
          <p className="panel-kicker">Live view</p>
          <h2 id="live-view-title" className="panel-title">
            Step-by-step run playback
          </h2>
        </div>
        <div className="live-view-actions">
          <div className="activity-scope-toggle" role="group" aria-label="Live view scope">
            <button
              type="button"
              className="activity-scope-button"
              data-active={scope === "latest"}
              aria-pressed={scope === "latest"}
              onClick={() => setScope("latest")}
            >
              Latest run
            </button>
            <button
              type="button"
              className="activity-scope-button"
              data-active={scope === "all"}
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All runs
            </button>
          </div>
        </div>
      </div>

      {steps.length === 0 || selectedStep === null ? (
        <div className="activity-empty">
          <p className="activity-empty-text">
            Tool calls, edits, and command output will appear here while Shipyard is working.
          </p>
        </div>
      ) : (
        <div className="live-view-layout">
          <div className="live-step-column" role="list" aria-label="Run steps">
            {steps.map((entry) => {
              const selected = entry.id === selectedStep.id;
              const tone = getTone(entry.step.tone);

              return (
                <button
                  key={entry.id}
                  type="button"
                  className="live-step-button"
                  data-selected={selected}
                  onClick={() => setSelectedStepId(entry.id)}
                >
                  <div className="live-step-row">
                    <span className="live-step-turn">{entry.turn.instruction}</span>
                    <Badge tone={tone}>
                      <StatusDot tone={tone} pulse={entry.step.tone === "working"} />
                      {entry.step.kind}
                    </Badge>
                  </div>
                  <p className="live-step-label">{getStepLabel(entry.step)}</p>
                </button>
              );
            })}
          </div>

          <div className="live-step-detail">
            <div className="live-step-detail-header">
              <div>
                <p className="live-step-detail-kicker">{selectedStep.turn.instruction}</p>
                <h3 className="live-step-detail-title">
                  {getStepLabel(selectedStep.step)}
                </h3>
              </div>
              <Badge tone={getTone(selectedStep.turn.status)}>
                <StatusDot
                  tone={getTone(selectedStep.turn.status)}
                  pulse={selectedStep.turn.status === "working"}
                />
                {selectedStep.turn.status}
              </Badge>
            </div>

            {selectedStep.step.kind === "edit" ? (
              <div className="live-code-grid">
                <div className="live-code-card">
                  <span className="live-code-label">Before</span>
                  <pre className="live-code-block">
                    {selectedStep.step.beforePreview ?? "No previous preview recorded."}
                  </pre>
                </div>
                <div className="live-code-card">
                  <span className="live-code-label">After</span>
                  <pre className="live-code-block">
                    {selectedStep.step.afterPreview ?? "No updated preview recorded."}
                  </pre>
                </div>
                <div className="live-code-card live-code-card-full">
                  <span className="live-code-label">Diff</span>
                  <pre className="live-code-block">{selectedStep.step.diff}</pre>
                </div>
              </div>
            ) : selectedStep.step.detailBody ? (
              <div className="live-terminal-shell">
                <span className="live-code-label">
                  {selectedStep.step.command ? "Terminal output" : "Step details"}
                </span>
                <pre className="live-terminal-output">{selectedStep.step.detailBody}</pre>
              </div>
            ) : (
              <div className="live-step-note">
                <p>{selectedStep.step.detail}</p>
              </div>
            )}

            <div className="live-trace-strip">
              {tracePath ? <code className="live-trace-path">{tracePath}</code> : null}
              {selectedStep.turn.langSmithTrace?.traceUrl ? (
                <a
                  className="chat-trace-link"
                  href={selectedStep.turn.langSmithTrace.traceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open trace
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
