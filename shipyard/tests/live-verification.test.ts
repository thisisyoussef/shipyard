import { describe, expect, it } from "vitest";

import {
  createTranscriptCollector,
  extractToolCallsFromTranscript,
  verifySurgicalEdit,
} from "../src/engine/live-verification.js";

describe("live verification helpers", () => {
  it("collects transcript lines and extracts tool calls in order", () => {
    const transcript = createTranscriptCollector();

    transcript.logger.log("[raw-loop] turn 1 tool_call read_file input={\"path\":\"src/app.ts\"}");
    transcript.logger.log("[raw-loop] turn 1 tool_result read_file success output=Path: src/app.ts");
    transcript.logger.log("[raw-loop] turn 2 tool_call edit_block input={\"path\":\"src/app.ts\"}");

    expect(transcript.lines).toHaveLength(3);
    expect(extractToolCallsFromTranscript(transcript.lines)).toEqual([
      "read_file",
      "edit_block",
    ]);
  });

  it("verifies that only the targeted block changed byte-for-byte", () => {
    const before = [
      'export function alpha() {',
      '  return "alpha";',
      '}',
      "",
      'export function beta() {',
      '  return "before";',
      '}',
      "",
      'export function gamma() {',
      '  return "gamma";',
      '}',
      "",
    ].join("\n");
    const after = [
      'export function alpha() {',
      '  return "alpha";',
      '}',
      "",
      'export function beta() {',
      '  return "after";',
      '}',
      "",
      'export function gamma() {',
      '  return "gamma";',
      '}',
      "",
    ].join("\n");
    const verification = verifySurgicalEdit(
      before,
      after,
      ['export function beta() {', '  return "before";', '}'].join("\n"),
      ['export function beta() {', '  return "after";', '}'].join("\n"),
    );

    expect(verification.oldBlockMatches).toBe(1);
    expect(verification.newBlockMatches).toBe(1);
    expect(verification.prefixUnchanged).toBe(true);
    expect(verification.suffixUnchanged).toBe(true);
    expect(verification.changedOnlyTarget).toBe(true);
  });
});
