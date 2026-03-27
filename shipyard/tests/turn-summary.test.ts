import { describe, expect, it } from "vitest";

import {
  TOOL_RESULT_DETAIL_MAX_CHARS,
  TOOL_RESULT_DETAIL_MAX_LINES,
  createToolResultDetailExcerpt,
} from "../src/engine/turn-summary.js";

describe("turn summary helpers", () => {
  it("returns small tool-result detail unchanged", () => {
    expect(
      createToolResultDetailExcerpt("Build completed successfully.\nExit code: 0"),
    ).toBe("Build completed successfully.\nExit code: 0");
  });

  it("truncates oversized tool-result detail with a compact suffix", () => {
    const oversized = Array.from(
      { length: TOOL_RESULT_DETAIL_MAX_LINES + 4 },
      (_, index) => `line-${String(index + 1)} ${"x".repeat(80)}`,
    ).join("\n");

    const result = createToolResultDetailExcerpt(oversized, {
      maxLines: TOOL_RESULT_DETAIL_MAX_LINES,
      maxChars: TOOL_RESULT_DETAIL_MAX_CHARS,
    });

    expect(result).toContain("line-1");
    expect(result).toContain("...[truncated");
    expect(result).not.toContain(
      `line-${String(TOOL_RESULT_DETAIL_MAX_LINES + 4)}`,
    );
  });
});
