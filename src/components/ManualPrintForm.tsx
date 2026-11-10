"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";
import type { Material } from "@/lib/types";
import { ManualFilaments, manualFilamentPayload, type FilamentDraft } from "./ManualFilaments";

export function ManualPrintForm({ materials }: { materials: Material[] }) {
  const router = useRouter();
  const { t } = useLocale();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputClass = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const [filaments, setFilaments] = useState<FilamentDraft[]>([
    { filamentId: "1", type: materials[0]?.type ?? "PLA", color: materials[0]?.color ?? "#ffffff", weight: "", supportWeight: "", towerWeight: "", otherWeight: "" },
  ]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set("mode", "manual");
    const payload = manualFilamentPayload(filaments);
    data.set("filaments", JSON.stringify(payload.filaments));
    data.set("categoryByFilament", JSON.stringify(payload.categoryByFilament));
    try {
      const response = await fetch("/api/prints", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? t("manual.error"));
        return;
      }
      router.push(`/prints/${result.print.id}`);
      router.refresh();
    } catch {
      setError(t("manual.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3 9 5-9 5-9-5 9-5Z M3 8v9l9 5 9-5V8 M12 13v9" />
            </svg>
          </span>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t("manual.title")}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("manual.subtitle")}</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={formId}
          className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-orange-500 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-950/60">
          {open ? t("manual.hideForm") : t("manual.add")}
        </button>
      </div>
      {open && (
        <form id={formId} onSubmit={(event) => void submit(event)} className="border-t border-slate-200 dark:border-slate-700">
          <div className="space-y-6 bg-slate-50/60 p-5 dark:bg-slate-900/20 sm:p-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("manual.basicDetails")}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t("manual.name")}
                  <input name="name" required maxLength={200} placeholder={t("manual.namePlaceholder")} className={inputClass} />
                </label>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t("print.printTimeMinutes")}
                  <input name="minutes" type="number" required min="0" step="any" placeholder="120" className={inputClass} />
                </label>
              </div>
            </div>
            <ManualFilaments items={filaments} onChange={setFilaments} materials={materials} />
            <label className="block rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
              {t("manual.image")}
              <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">{t("manual.imageHint")}</span>
              <input name="image" type="file" accept="image/png,image/jpeg,image/webp"
                className="mt-3 block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-700 dark:file:text-slate-100" />
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5 dark:border-slate-700 sm:px-6">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("manual.createHint")}</p>
            <button type="submit" disabled={saving} className="w-full rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-50 sm:w-auto">
              {saving ? t("upload.processing") : t("manual.create")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}