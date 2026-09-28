"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";
import type { Material } from "@/lib/types";
import { ManualFilaments, manualFilamentPayload, type FilamentDraft } from "./ManualFilaments";

export function ManualPrintForm({ materials }: { materials: Material[] }) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <section className="border-b border-slate-200 pb-6 dark:border-slate-700">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600">
        {t("manual.add")}
      </button>
      {open && (
        <form onSubmit={(event) => void submit(event)} className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">
            {t("manual.name")}
            <input name="name" required maxLength={200} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("print.printTimeMinutes")}
            <input name="minutes" type="number" required min="0" step="any" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <ManualFilaments items={filaments} onChange={setFilaments} materials={materials} />
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">
            {t("manual.image")}
            <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 dark:text-slate-300 dark:file:bg-slate-700 dark:file:text-slate-100" />
            <span className="mt-1 block text-xs text-slate-500">{t("manual.imageHint")}</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50 sm:col-span-2">
            {saving ? t("upload.processing") : t("manual.create")}
          </button>
        </form>
      )}
    </section>
  );
}