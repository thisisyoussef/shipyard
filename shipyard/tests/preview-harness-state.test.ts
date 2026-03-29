import { describe, expect, it } from "vitest";

import { resolvePreviewHarnessState } from "../ui/src/preview-harness-state.js";

describe("resolvePreviewHarnessState", () => {
  it("uses stable defaults when no preview query parameters are present", () => {
    expect(resolvePreviewHarnessState("")).toEqual({
      dashboardTab: "my-products",
      editorTab: "preview",
    });
  });

  it("keeps supported dashboard and editor tabs from the query string", () => {
    expect(
      resolvePreviewHarnessState("?dashboardTab=starred&editorTab=files"),
    ).toEqual({
      dashboardTab: "starred",
      editorTab: "files",
    });
  });

  it("falls back safely when unsupported preview query values are provided", () => {
    expect(
      resolvePreviewHarnessState("?dashboardTab=unknown&editorTab=sidebar"),
    ).toEqual({
      dashboardTab: "my-products",
      editorTab: "preview",
    });
  });
});
