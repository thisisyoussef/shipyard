export type Route =
  | { view: "dashboard" }
  | { view: "editor"; productId: string }
  | { view: "board"; productId: string }
  | { view: "human-feedback" };

export function parseHash(hash: string): Route {
  const normalized = hash.replace(/^#\/?/, "");

  if (normalized === "" || normalized === "/") {
    return { view: "dashboard" };
  }

  if (normalized === "human-feedback") {
    return { view: "human-feedback" };
  }

  const boardMatch = normalized.match(/^board\/(.+)$/);
  if (boardMatch && boardMatch[1] !== undefined) {
    return { view: "board", productId: decodeURIComponent(boardMatch[1]) };
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
      return `#/board/${encodeURIComponent(route.productId)}`;
    case "human-feedback":
      return "#/human-feedback";
  }
}
