// Colour mode for the page.
//
// This app owns the mode outright: it sets `data-mode` on the document
// root, persists the choice, and passes the mode to the embedded
// conseqa-viz views, which take it as a prop and render no control of
// their own. One setting, one control, one writer.

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const KEY = "conseqa-playground-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-mode", "dark");
  else root.removeAttribute("data-mode");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const set = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // A blocked storage API is not fatal; the mode still applies.
    }
    apply(next);
    for (const listener of listeners) listener();
  }, []);

  return [theme, set];
}
