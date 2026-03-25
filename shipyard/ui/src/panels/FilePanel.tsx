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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const selectedEvent = fileEvents.find((e) => e.path === selectedFile);

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
                  key={event.path}
                  className="file-item"
                  role="option"
                  aria-selected={selectedFile === event.path}
                  data-selected={selectedFile === event.path}
                  onClick={() =>
                    setSelectedFile(
                      selectedFile === event.path ? null : event.path,
                    )
                  }
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedFile(
                        selectedFile === event.path ? null : event.path,
                      );
                    }
                  }}
                >
                  <FileIcon />
                  <span className="file-item-name" title={event.path}>
                    {fileName}
                  </span>
                  <Badge tone={tone} className="file-item-badge">
                    {label}
                  </Badge>
                </div>
              );
            })}
          </div>

          {selectedEvent && selectedEvent.diffLines.length > 0 && (
            <div className="diff-viewer">
              {selectedEvent.diffLines.map((line) => (
                <div
                  key={line.id}
                  className="diff-line"
                  data-kind={line.kind}
                >
                  <span className="diff-line-number" />
                  <span className="diff-line-content">{line.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
