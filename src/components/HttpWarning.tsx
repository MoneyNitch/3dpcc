"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "@/lib/locale";

const subscribe = () => () => {};

export function HttpWarning() {
  const { t } = useLocale();
  const insecure = useSyncExternalStore(subscribe, () => window.location.protocol === "http:", () => false);
  if (!insecure) return null;
  return <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
    {t("security.httpWarning")}
  </p>;
}
