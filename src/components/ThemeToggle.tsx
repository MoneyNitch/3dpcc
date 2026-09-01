"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  if (theme === null) {
    // Avoid a hydration mismatch flash before we know the current theme.
    return <span className="h-9 w-9" />;
  }

  return (
    <button
      onClick={() => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={theme === "dark" ? "Zu hellem Modus wechseln" : "Zu dunklem Modus wechseln"}
      title={theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
