import type {
  ActivityItemViewModel,
  DiffLineViewModel,
  FileEventViewModel,
  TurnViewModel,
} from "./view-models.js";
import type { BadgeTone } from "./primitives.js";

export type ActivityScope = "latest" | "all";

export interface ActivityMetadataItemViewModel {
  label: string;
  value: string;
  monospace?: boolean;
}

export interface ActivityDetailViewModel {
  id: string;
  label: string;
  text: string;
  tone: BadgeTone;
}

export interface ActivityBlockViewModel {
  id: string;
  kind: "tool" | "note";
  title: string;
  headline: string;
  preview: string;
  statusLabel: string;
  tone: BadgeTone;
  metadata: ActivityMetadataItemViewModel[];
  details: ActivityDetailViewModel[];
}

export interface DiffRenderLineViewModel extends DiffLineViewModel {
  label: "META" | "CTX" | "ADD" | "DEL";
}

export interface DiffPreviewViewModel {
  lines: DiffRenderLineViewModel[];
  hasOverflow: boolean;
  hiddenLineCount: number;
  totalLineCount: number;
}

function toBadgeTone(
  tone: ActivityItemViewModel["tone"],
): BadgeTone {
  switch (tone) {
    case "working":
      return "accent";
    case "success":
      return "success";
    case "danger":
      return "danger";
    default:
      return "neutral";
  }
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/_/g, " ");
}

function extractPath(detail: string): string | null {
  const match = detail.match(/path:\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

function shortenCallId(callId: string): string {
  return callId.slice(0, 8);
}

function formatPathLabel(path: string | null): string {
  return path ?? "the requested file";
}

function extractCommand(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const commandMatch = candidate.match(/command:\s*([^\n]+)/i);

    if (commandMatch?.[1]) {
      return commandMatch[1].trim();
    }

    const quotedCommandMatch = candidate.match(/`([^`]+)`/);

    if (quotedCommandMatch?.[1]) {
      return quotedCommandMatch[1].trim();
    }
  }

  return null;
}

function createToolHeadline(
  activity: ActivityItemViewModel,
  path: string | null,
): string {
  switch (activity.toolName) {
    case "read_file":
      return `Reading ${formatPathLabel(path)}`;
    case "edit_block":
      return `Editing ${formatPathLabel(path)}`;
    case "write_file":
      return `Writing ${formatPathLabel(path)}`;
    case "list_files":
      return path ? `Listing files in ${path}` : "Listing files";
    case "search_files":
      return path ? `Searching ${path}` : "Searching the workspace";
    case "run_command": {
      const command = extractCommand(activity.detail);
      return command ? `Running ${command}` : "Running a command";
    }
    case "git_diff":
      return path ? `Checking the diff for ${path}` : "Checking the current diff";
    default:
      return path
        ? `${humanizeToolName(activity.toolName ?? activity.title)} ${path}`
        : activity.title;
  }
}

function createNoteHeadline(activity: ActivityItemViewModel): string {
  switch (activity.kind) {
    case "thinking":
      return "Planning the next step";
    case "text":
      return "Sharing the current readout";
    case "edit":
      return `Updated ${activity.title}`;
    case "done":
      return "Turn complete";
    case "error":
      return "Run needs attention";
    default:
      return activity.title;
  }
}

function createActivityMetadata(
  activity: ActivityItemViewModel,
): ActivityMetadataItemViewModel[] {
  const metadata: ActivityMetadataItemViewModel[] = [];

  if (activity.toolName) {
    metadata.push({
      label: "Tool",
      value: activity.toolName,
      monospace: true,
    });
  }

  if (activity.callId) {
    metadata.push({
      label: "Call",
      value: shortenCallId(activity.callId),
      monospace: true,
    });
  }

  const path = extractPath(activity.detail);

  if (path) {
    metadata.push({
      label: "Path",
      value: path,
      monospace: true,
    });
  }

  return metadata;
}

function createNoteBlock(
  activity: ActivityItemViewModel,
): ActivityBlockViewModel {
  const headline = createNoteHeadline(activity);

  return {
    id: activity.id,
    kind: "note",
    title: activity.title,
    headline,
    preview: activity.detail,
    statusLabel:
      activity.kind === "error"
        ? "error"
        : activity.kind === "done"
          ? "complete"
          : activity.kind === "thinking"
            ? "thinking"
            : "note",
    tone: toBadgeTone(activity.tone),
    metadata: [],
    details: [
      {
        id: `${activity.id}-detail`,
        label: "Detail",
        text: activity.detail,
        tone: toBadgeTone(activity.tone),
      },
    ],
  };
}

function createToolBlock(
  start: ActivityItemViewModel,
  result: ActivityItemViewModel | null,
  linkedError: ActivityItemViewModel | null,
): ActivityBlockViewModel {
  const path = extractPath(start.detail);
  const title = start.toolName
    ? humanizeToolName(start.toolName)
    : start.title;
  const headline = createToolHeadline(start, path);
  const finalTone = toBadgeTone(result?.tone ?? start.tone);
  const details: ActivityDetailViewModel[] = [
    {
      id: `${start.id}-request`,
      label: "Request",
      text: start.detail,
      tone: toBadgeTone(start.tone),
    },
  ];

  if (result) {
    details.push({
      id: `${result.id}-result`,
      label: "Result",
      text: result.detail,
      tone: toBadgeTone(result.tone),
    });
  }

  if (linkedError) {
    details.push({
      id: `${linkedError.id}-error`,
      label: "Error",
      text: linkedError.detail,
      tone: "danger",
    });
  }

  return {
    id: start.id,
    kind: "tool",
    title,
    headline,
    preview: result?.detail ?? linkedError?.detail ?? start.detail,
    statusLabel:
      result === null
        ? "running"
        : result.tone === "danger"
          ? "failed"
          : "complete",
    tone: finalTone,
    metadata: createActivityMetadata(start),
    details,
  };
}

export function selectVisibleTurns(
  turns: TurnViewModel[],
  scope: ActivityScope,
): TurnViewModel[] {
  if (scope === "all") {
    return turns;
  }

  return turns.slice(0, 1);
}

export function selectVisibleFileEvents(
  fileEvents: FileEventViewModel[],
  visibleTurns: TurnViewModel[],
  scope: ActivityScope,
): FileEventViewModel[] {
  if (scope === "all") {
    return fileEvents;
  }

  const visibleTurnIds = new Set(visibleTurns.map((turn) => turn.id));

  return fileEvents.filter((fileEvent) => visibleTurnIds.has(fileEvent.turnId));
}

export function buildActivityBlocks(
  activity: ActivityItemViewModel[],
): ActivityBlockViewModel[] {
  const blocks: ActivityBlockViewModel[] = [];

  for (let index = 0; index < activity.length; index += 1) {
    const current = activity[index];

    if (!current) {
      continue;
    }

    if (current.kind === "tool" && current.callId) {
      const next = activity[index + 1];
      const hasMatchingResult =
        next?.kind === "tool" &&
        next.callId === current.callId &&
        next.id !== current.id &&
        next.tone !== "working";
      const result = hasMatchingResult && next ? next : null;
      const maybeError = activity[index + (result ? 2 : 1)];
      const linkedError =
        result?.tone === "danger" && maybeError?.kind === "error"
          ? maybeError
          : null;

      blocks.push(createToolBlock(current, result, linkedError));

      if (result) {
        index += 1;
      }

      if (linkedError) {
        index += 1;
      }

      continue;
    }

    blocks.push(createNoteBlock(current));
  }

  return blocks;
}

function createDiffLabel(
  kind: DiffLineViewModel["kind"],
): DiffRenderLineViewModel["label"] {
  switch (kind) {
    case "add":
      return "ADD";
    case "remove":
      return "DEL";
    case "meta":
      return "META";
    default:
      return "CTX";
  }
}

export function buildDiffPreview(
  fileEvent: FileEventViewModel,
  expanded: boolean,
  visibleLineLimit = 8,
): DiffPreviewViewModel {
  const lines = fileEvent.diffLines.map((line) => ({
    ...line,
    label: createDiffLabel(line.kind),
  }));
  const visibleLines = expanded ? lines : lines.slice(0, visibleLineLimit);

  return {
    lines: visibleLines,
    hasOverflow: lines.length > visibleLines.length,
    hiddenLineCount: Math.max(lines.length - visibleLines.length, 0),
    totalLineCount: lines.length,
  };
}
