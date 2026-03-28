export type Route =
  | { view: "dashboard" }
  | { view: "editor"; productId: string }
  | { view: "board" }
  | { view: "human-feedback" };

export function parseHash(hash: string): Route {
  const normalized = hash.replace(/^#\/?/, "");

  if (normalized === "" || normalized === "/") {
    return { view: "dashboard" };
  }

  if (normalized === "board") {
    return { view: "board" };
  }

  if (normalized === "human-feedback") {
    return { view: "human-feedback" };
  }

  const editorMatch = normalized.match(/^editor\/(.+)$/);
  if (editorMatch && editorMatch[1] !== undefined) {
    return { view: "editor", productId: decodeURIComponent(editorMatch[1]) };
  }

  return { view: "dashboard" };
}

export function buildHash(route: Route): string {
  switch (route.view) {
    case "dashboard":
      return "#/";
    case "editor":
      return `#/editor/${encodeURIComponent(route.productId)}`;
    case "board":
      return "#/board";
    case "human-feedback":
      return "#/human-feedback";
  }
}
