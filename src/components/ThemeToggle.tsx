"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale";
import type { Theme } from "@/lib/types";

export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const { t } = useLocale();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  const label = theme === "dark" ? t("theme.toLight") : t("theme.toDark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
