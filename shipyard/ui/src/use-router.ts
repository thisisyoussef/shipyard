import { useCallback, useSyncExternalStore } from "react";
import { buildHash, parseHash, type Route } from "./router.js";

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getSnapshot(): string {
  return window.location.hash;
}

export function useRouter() {
  const hash = useSyncExternalStore(subscribe, getSnapshot);
  const route = parseHash(hash);

  const navigate = useCallback((next: Route) => {
    window.location.hash = buildHash(next);
  }, []);

  return { route, navigate };
}
