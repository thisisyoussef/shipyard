/**
 * OutputPanel — Command/Build output display.
 * Shows stdout/stderr from tool calls like command execution.
 */

import { useState } from "react";

import { Badge } from "../primitives.js";
import type { ActivityItemViewModel, TurnViewModel } from "../view-models.js";

/* ── Props ──────────────────────────────────────── */

export interface OutputPanelProps {
  /** All turns to extract command output from */
  turns: TurnViewModel[];
}

/* ── Helpers ────────────────────────────────────── */

interface CommandOutput {
  id: string;
  toolName: string;
  command: string;
  output: string;
  success: boolean;
  turnId: string;
  timestamp: string;
}

function extractCommandOutputs(turns: TurnViewModel[]): CommandOutput[] {
  const outputs: CommandOutput[] = [];

  for (const turn of turns) {
    for (const activity of turn.activity) {
      // Look for command/shell tool calls
      if (
        activity.kind === "tool" &&
        (activity.toolName === "command" ||
          activity.toolName === "run_command" ||
          activity.toolName === "execute" ||
          activity.toolName === "shell" ||
          activity.toolName?.includes("command"))
      ) {
        outputs.push({
          id: activity.id,
          toolName: activity.toolName ?? "command",
          command: extractCommand(activity.title, activity.detail),
          output: activity.detail,
          success: activity.tone === "success",
          turnId: turn.id,
          timestamp: turn.startedAt,
        });
      }
    }
  }

  return outputs.slice(0, 20); // Limit to recent 20
}

function extractCommand(title: string, detail: string): string {
  // Try to extract the actual command from the detail
  const lines = detail.split("\n");
  if (lines[0] && !lines[0].startsWith(" ") && lines[0].length < 100) {
    return lines[0];
  }
  return title;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ── Component ──────────────────────────────────── */

export function OutputPanel({ turns }: OutputPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const outputs = extractCommandOutputs(turns);

  return (
    <div className="output-panel">
      <div className="output-panel-header">
        <div>
          <p className="panel-kicker">Output</p>
          <h2 className="panel-title">
            {outputs.length > 0 ? `${outputs.length} commands` : "No output"}
          </h2>
        </div>
      </div>

      {outputs.length === 0 ? (
        <div className="context-empty">
          <p className="context-empty-text">
            Command output will appear here when the agent runs builds, tests, or other commands.
          </p>
        </div>
      ) : (
        <div className="output-list">
          {outputs.map((output) => (
            <div
              key={output.id}
              className="output-item"
              data-expanded={expanded === output.id}
              data-success={output.success}
            >
              <div
                className="output-item-header"
                onClick={() =>
                  setExpanded(expanded === output.id ? null : output.id)
                }
              >
                <code className="output-item-command">{output.command}</code>
                <div className="output-item-meta">
                  <Badge tone={output.success ? "success" : "danger"}>
                    {output.success ? "OK" : "ERR"}
                  </Badge>
                  <span className="output-item-time">
                    {formatTime(output.timestamp)}
                  </span>
                </div>
              </div>

              {expanded === output.id && (
                <pre className="output-item-content">{output.output}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
