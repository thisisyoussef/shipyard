import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LiveViewPanel } from "../ui/src/panels/LiveViewPanel.js";
import type { TurnViewModel } from "../ui/src/view-models.js";

const turns: TurnViewModel[] = [
  {
    id: "turn-2",
    instruction: "make the button yellow",
    status: "working",
    startedAt: "2026-03-24T12:05:00.000Z",
    summary: "Applying the requested color update.",
    contextPreview: [],
    agentMessages: [],
    langSmithTrace: null,
    activity: [
      {
        id: "event-think",
        kind: "thinking",
        title: "Thinking",
        detail: "Inspecting the current button styles first.",
        tone: "working",
      },
      {
        id: "event-edit",
        kind: "edit",
        title: "src/button.tsx",
        detail: "Applied targeted edit to src/button.tsx",
        tone: "success",
        path: "src/button.tsx",
        diff: [
          "@@ -1,3 +1,3 @@",
          "-  background: var(--blue-6);",
          "+  background: var(--amber-6);",
        ].join("\n"),
        beforePreview: "background: var(--blue-6);",
        afterPreview: "background: var(--amber-6);",
        addedLines: 1,
        removedLines: 1,
      },
      {
        id: "event-command",
        kind: "tool",
        title: "run command finished",
        detail: "Verified the CSS build.",
        tone: "success",
        toolName: "run_command",
        callId: "call-build",
        command: "pnpm build",
        detailBody: [
          "Command: pnpm build",
          "Exit code: 0",
          "Build completed successfully.",
        ].join("\n"),
      },
    ],
  },
];

describe("LiveViewPanel", () => {
  it("renders sequential run steps with editor and terminal detail surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(LiveViewPanel, {
        turns,
        tracePath: "/tmp/demo/.shipyard/traces/session-123.jsonl",
      }),
    );

    expect(markup).toContain("Live view");
    expect(markup).toContain("Step-by-step run playback");
    expect(markup).toContain("Inspecting the current button styles first.");
    expect(markup).toContain("Applied targeted edit to src/button.tsx");
    expect(markup).toContain("Before");
    expect(markup).toContain("background: var(--blue-6);");
    expect(markup).toContain("After");
    expect(markup).toContain("background: var(--amber-6);");
    expect(markup).toContain("pnpm build");
    expect(markup).toContain("/tmp/demo/.shipyard/traces/session-123.jsonl");
  });
});

