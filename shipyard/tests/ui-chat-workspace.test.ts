import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatWorkspace } from "../ui/src/panels/ChatWorkspace.js";
import type { TurnViewModel } from "../ui/src/view-models.js";

const turns: TurnViewModel[] = [
  {
    id: "turn-1",
    instruction: "how are the imports looking?",
    status: "success",
    startedAt: "2026-03-24T21:26:00.000Z",
    summary: "The imports look clean and well organized.",
    contextPreview: ["Prioritize real imports over assumptions."],
    agentMessages: [
      "The imports look clean and well organized.",
    ],
    langSmithTrace: {
      projectName: "shipyard",
      runId: "run-123",
      traceUrl: "https://smith.langchain.com/runs/run-123",
      projectUrl: "https://smith.langchain.com/projects/shipyard",
    },
    activity: [
      {
        id: "event-1",
        kind: "thinking",
        title: "Thinking",
        detail: "Reviewing package imports and grouping patterns.",
        tone: "working",
      },
    ],
  },
];

describe("ChatWorkspace", () => {
  it("renders a conversation-first view with trace and step summaries", () => {
    const markup = renderToStaticMarkup(
      createElement(ChatWorkspace, {
        turns,
        emptyContent: null,
      }),
    );

    expect(markup).toContain("Latest conversation");
    expect(markup).toContain("how are the imports looking?");
    expect(markup).toContain("The imports look clean and well organized.");
    expect(markup).toContain("Prioritize real imports over assumptions.");
    expect(markup).toContain("1 step recorded");
    expect(markup).toContain("Open trace");
    expect(markup).toContain('href="https://smith.langchain.com/runs/run-123"');
  });
});
