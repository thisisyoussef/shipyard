import { describe, it, expect } from "vitest";
import { parseHash, buildHash } from "../../ui/src/router.js";

describe("parseHash", () => {
  it("parses empty hash as dashboard", () => {
    expect(parseHash("")).toEqual({ view: "dashboard" });
  });

  it("parses #/ as dashboard", () => {
    expect(parseHash("#/")).toEqual({ view: "dashboard" });
  });

  it("parses #/editor/:productId", () => {
    expect(parseHash("#/editor/my-app")).toEqual({
      view: "editor",
      productId: "my-app",
    });
  });

  it("decodes editor routes that carry full target paths", () => {
    expect(parseHash("#/editor/%2Ftmp%2Falpha-app")).toEqual({
      view: "editor",
      productId: "/tmp/alpha-app",
    });
  });

  it("parses #/board as board", () => {
    expect(parseHash("#/board")).toEqual({ view: "board" });
  });

  it("parses #/human-feedback as human-feedback", () => {
    expect(parseHash("#/human-feedback")).toEqual({ view: "human-feedback" });
  });

  it("falls back to dashboard for unknown hash", () => {
    expect(parseHash("#/unknown/route")).toEqual({ view: "dashboard" });
  });
});

describe("buildHash", () => {
  it("builds dashboard hash", () => {
    expect(buildHash({ view: "dashboard" })).toBe("#/");
  });

  it("builds editor hash with productId", () => {
    expect(buildHash({ view: "editor", productId: "my-app" })).toBe("#/editor/my-app");
  });

  it("encodes editor hashes for filesystem-like target paths", () => {
    expect(buildHash({ view: "editor", productId: "/tmp/alpha-app" })).toBe(
      "#/editor/%2Ftmp%2Falpha-app",
    );
  });

  it("builds board hash", () => {
    expect(buildHash({ view: "board" })).toBe("#/board");
  });
});
