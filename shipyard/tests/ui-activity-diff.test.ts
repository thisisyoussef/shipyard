import { describe, expect, it } from "vitest";

import {
  buildActivityBlocks,
  buildDiffPreview,
  selectVisibleFileEvents,
  selectVisibleTurns,
} from "../ui/src/activity-diff.js";
import type {
  FileEventViewModel,
  TurnViewModel,
} from "../ui/src/view-models.js";

const turns: TurnViewModel[] = [
  {
    id: "turn-2",
    instruction: "update src/app.ts",
    status: "success",
    startedAt: "2026-03-24T12:05:00.000Z",
    summary: "Patched the component.",
    contextPreview: [],
    agentMessages: [],
    activity: [
      {
        id: "event-1",
        kind: "tool",
        title: "read file",
        detail: "path: src/app.ts",
        tone: "working",
        toolName: "read_file",
        callId: "call-read-1234",
      },
      {
        id: "event-2",
        kind: "tool",
        title: "read file finished",
        detail: "Read src/app.ts (32 lines).",
        tone: "success",
        toolName: "read_file",
        callId: "call-read-1234",
      },
      {
        id: "event-3",
        kind: "tool",
        title: "edit block",
        detail: "path: src/app.ts",
        tone: "working",
        toolName: "edit_block",
        callId: "call-edit-5678",
      },
      {
        id: "event-4",
        kind: "tool",
        title: "edit block failed",
        detail: "Anchor matched zero times.",
        tone: "danger",
        toolName: "edit_block",
        callId: "call-edit-5678",
      },
      {
        id: "event-5",
        kind: "error",
        title: "Agent error",
        detail: "Anchor matched zero times.",
        tone: "danger",
      },
    ],
  },
  {
    id: "turn-1",
    instruction: "inspect package.json",
    status: "error",
    startedAt: "2026-03-24T12:00:00.000Z",
    summary: "Failed to inspect the package.",
    contextPreview: [],
    agentMessages: [],
    activity: [],
  },
];

const fileEvents: FileEventViewModel[] = [
  {
    id: "file-1",
    path: "src/app.ts",
    status: "diff",
    title: "Diff preview",
    summary: "Updated the greeting copy.",
    turnId: "turn-2",
    diffLines: [
      { id: "diff-0", kind: "meta", text: "@@ -1,6 +1,6 @@" },
      { id: "diff-1", kind: "context", text: " export function App() {" },
      { id: "diff-2", kind: "remove", text: "-  return 'before';" },
      { id: "diff-3", kind: "add", text: "+  return 'after';" },
      { id: "diff-4", kind: "context", text: " }" },
      { id: "diff-5", kind: "context", text: "" },
      { id: "diff-6", kind: "context", text: " export const value = 1;" },
      { id: "diff-7", kind: "context", text: " export const next = 2;" },
      { id: "diff-8", kind: "context", text: " export const done = true;" },
    ],
  },
  {
    id: "file-2",
    path: "package.json",
    status: "error",
    title: "read file",
    summary: "File not found.",
    turnId: "turn-1",
    diffLines: [],
  },
];

describe("ui activity + diff presentation", () => {
  it("groups tool request, result, and linked errors into a single activity block", () => {
    const blocks = buildActivityBlocks(turns[0]?.activity ?? []);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      kind: "tool",
      title: "read file",
      statusLabel: "complete",
      tone: "success",
      metadata: [
        { label: "Tool", value: "read_file", monospace: true },
        { label: "Call", value: "call-rea", monospace: true },
        { label: "Path", value: "src/app.ts", monospace: true },
      ],
    });
    expect(blocks[0]?.details).toEqual([
      {
        id: "event-1-request",
        label: "Request",
        text: "path: src/app.ts",
        tone: "accent",
      },
      {
        id: "event-2-result",
        label: "Result",
        text: "Read src/app.ts (32 lines).",
        tone: "success",
      },
    ]);
    expect(blocks[1]).toMatchObject({
      kind: "tool",
      title: "edit block",
      statusLabel: "failed",
      tone: "danger",
    });
    expect(blocks[1]?.details.map((detail) => detail.label)).toEqual([
      "Request",
      "Result",
      "Error",
    ]);
  });

  it("focuses activity and file events on the latest run by default", () => {
    const visibleTurns = selectVisibleTurns(turns, "latest");
    const visibleFileEvents = selectVisibleFileEvents(
      fileEvents,
      visibleTurns,
      "latest",
    );

    expect(visibleTurns.map((turn) => turn.id)).toEqual(["turn-2"]);
    expect(visibleFileEvents.map((fileEvent) => fileEvent.id)).toEqual(["file-1"]);
  });

  it("adds explicit labels to diff lines and truncates large previews", () => {
    const preview = buildDiffPreview(fileEvents[0]!, false, 5);

    expect(preview.lines.map((line) => line.label)).toEqual([
      "META",
      "CTX",
      "DEL",
      "ADD",
      "CTX",
    ]);
    expect(preview.hasOverflow).toBe(true);
    expect(preview.hiddenLineCount).toBe(4);
    expect(buildDiffPreview(fileEvents[0]!, true, 5).lines).toHaveLength(9);
  });
});
