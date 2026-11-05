"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";

export function UserMenu({
  username,
  showSettings,
  showStatistics,
  showApi,
}: {
  username: string;
  showSettings: boolean;
  showStatistics: boolean;
  showApi: boolean;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error(`Logout failed (${response.status}).`);
      setOpen(false);
      router.replace("/login"); router.refresh();
    } catch (error) { console.error("Logout failed:", error); setError(true); }
    finally { setBusy(false); }
  }

  const itemClass = "block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("auth.userMenu")}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
      >
        {username}
        <span aria-hidden="true" className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {showSettings && <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={itemClass}>{t("nav.settings")}</Link>}
          {showStatistics && <Link role="menuitem" href="/statistics" onClick={() => setOpen(false)} className={itemClass}>{t("nav.statistics")}</Link>}
          {showApi && (
            <Link
              role="menuitem"
              href="/api/v1/docs"
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              {t("nav.api")}
            </Link>
          )}
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className={itemClass}>{t("auth.changePassword")}</Link>
          <button role="menuitem" type="button" disabled={busy} onClick={() => void logout()} className={itemClass}>{t("auth.logout")}</button>
          {error && <p role="alert" className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{t("auth.error.serverError")}</p>}
        </div>
      )}
    </div>
  );
}
