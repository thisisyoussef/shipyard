/**
 * FilePanel — File tree and diff viewer.
 * UIV3-S06 · Diff/File Viewer
 *
 * Shows file events from the session with diff previews.
 */

import { useState } from "react";

import { Badge } from "../primitives.js";
import type { FileEventViewModel } from "../view-models.js";

/* ── Icons ──────────────────────────────────────── */

function FileIcon() {
  return (
    <svg
      className="file-item-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

/* ── Props ──────────────────────────────────────── */

export interface FilePanelProps {
  /** List of file events */
  fileEvents: FileEventViewModel[];
}

/* ── Helpers ────────────────────────────────────── */

function getEventTone(
  status: FileEventViewModel["status"],
): "success" | "danger" | "accent" | "neutral" {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "running":
    case "diff":
      return "accent";
    default:
      return "neutral";
  }
}

function getEventLabel(status: FileEventViewModel["status"]): string {
  switch (status) {
    case "success":
      return "OK";
    case "error":
      return "ERR";
    case "running":
      return "...";
    case "diff":
      return "DIFF";
  }
}

/* ── Component ──────────────────────────────────── */

export function FilePanel({ fileEvents }: FilePanelProps) {
  const [selectedFileEventId, setSelectedFileEventId] = useState<string | null>(null);

  const selectedEvent = fileEvents.find((event) => event.id === selectedFileEventId);

  return (
    <div className="file-panel">
      <div className="file-panel-header">
        <div>
          <p className="panel-kicker">Files</p>
          <h2 className="panel-title">
            {fileEvents.length > 0 ? `${fileEvents.length} changes` : "No changes"}
          </h2>
        </div>
      </div>

      {fileEvents.length === 0 ? (
        <div className="context-empty">
          <p className="context-empty-text">
            File changes will appear here as the agent works.
          </p>
        </div>
      ) : (
        <>
          <div className="file-list" role="listbox" aria-label="File changes">
            {fileEvents.map((event) => {
              const tone = getEventTone(event.status);
              const label = getEventLabel(event.status);
              const fileName = event.path.split("/").pop() ?? event.path;

              return (
                <div
                  key={event.id}
                  className="file-item"
                  role="option"
                  aria-selected={selectedFileEventId === event.id}
                  data-selected={selectedFileEventId === event.id}
                  onClick={() =>
                    setSelectedFileEventId(
                      selectedFileEventId === event.id ? null : event.id,
                    )
                  }
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedFileEventId(
                        selectedFileEventId === event.id ? null : event.id,
                      );
                    }
                  }}
                >
                  <FileIcon />
                  <div className="file-item-copy">
                    <span className="file-item-name" title={event.path}>
                      {fileName}
                    </span>
                    <span className="file-item-summary">{event.summary}</span>
                  </div>
                  <Badge tone={tone} className="file-item-badge">
                    {label}
                  </Badge>
                </div>
              );
            })}
          </div>

          {selectedEvent && (
            <div className="diff-viewer">
              {selectedEvent.beforePreview ? (
                <div className="file-preview-pair">
                  <div className="file-preview-card">
                    <span className="file-preview-label">Before</span>
                    <pre className="file-preview-code">
                      {selectedEvent.beforePreview}
                    </pre>
                  </div>
                  <div className="file-preview-card">
                    <span className="file-preview-label">After</span>
                    <pre className="file-preview-code">
                      {selectedEvent.afterPreview ?? "No updated preview."}
                    </pre>
                  </div>
                </div>
              ) : null}

              {selectedEvent.diffLines.length > 0 ? (
                selectedEvent.diffLines.map((line) => (
                  <div
                    key={line.id}
                    className="diff-line"
                    data-kind={line.kind}
                  >
                    <span className="diff-line-number" />
                    <span className="diff-line-content">{line.text}</span>
                  </div>
                ))
              ) : (
                <p className="context-empty-text">
                  No diff lines were recorded for this step.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
