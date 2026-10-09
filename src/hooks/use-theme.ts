import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // Storage can be blocked; the class still applies for this page.
  }
  apply(theme);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chosen theme and its setter. index.html applies it before first paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return { theme, setTheme };
}
