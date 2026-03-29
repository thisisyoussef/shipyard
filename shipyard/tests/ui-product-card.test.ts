import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductCard } from "../ui/src/views/ProductCard.js";

describe("ProductCard", () => {
  it("renders a live preview frame when the dashboard card has a preview url", () => {
    const markup = renderToStaticMarkup(
      createElement(ProductCard, {
        product: {
          id: "/tmp/alpha-app",
          path: "/tmp/alpha-app",
          name: "alpha-app",
          description: "Alpha product",
          stackLabel: "React",
          status: "ready",
          statusLabel: "Active",
          lastActivity: "2026-03-28T12:10:00.000Z",
          starred: false,
          previewUrl: "http://127.0.0.1:4173",
          previewLabel: "Live preview",
          previewDetail: "Open this product to inspect the live workspace and recent runtime state.",
          active: true,
          open: true,
        },
        onOpen: () => undefined,
        onToggleStar: () => undefined,
      }),
    );

    expect(markup).toContain("product-card-live-preview");
    expect(markup).toContain('src="http://127.0.0.1:4173"');
    expect(markup).toContain("Live preview");
  });
});
