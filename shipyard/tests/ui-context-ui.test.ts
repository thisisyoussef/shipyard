import { describe, expect, it } from "vitest";

import {
  buildTextPreview,
  validateContextDraft,
} from "../ui/src/context-ui.js";

describe("ui context helpers", () => {
  it("rejects whitespace-only context drafts with a clear validation error", () => {
    expect(validateContextDraft("   \n\t  ")).toBe(
      "Context note only contains whitespace. Add text or clear it before submitting.",
    );
    expect(validateContextDraft("Follow the schema exactly.")).toBeNull();
  });

  it("truncates long context receipts until expanded", () => {
    const longText = "alpha ".repeat(60).trimEnd();

    const collapsed = buildTextPreview(longText, false, 40);
    const expanded = buildTextPreview(longText, true, 40);

    expect(collapsed.isTruncated).toBe(true);
    expect(collapsed.text.endsWith("…")).toBe(true);
    expect(expanded.isTruncated).toBe(false);
    expect(expanded.text).toBe(longText);
  });
});
