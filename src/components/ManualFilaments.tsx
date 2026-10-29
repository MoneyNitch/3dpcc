"use client";

import { useLocale } from "@/lib/locale";
import { getIntlLocale } from "@/lib/i18n";
import type { Material } from "@/lib/types";

export interface FilamentDraft {
  filamentId: string;
  type: string;
  color: string;
  weight: string;
  supportWeight: string;
  towerWeight: string;
  otherWeight: string;
}

export function manualFilamentPayload(items: FilamentDraft[]) {
  const categoryByFilament = items.map((item) => ({
    filamentId: item.filamentId,
    categories: [
      { category: "model", grams: Number(item.weight) },
      { category: "support", grams: Number(item.supportWeight || 0) },
      { category: "tower", grams: Number(item.towerWeight || 0) },
      { category: "other", grams: Number(item.otherWeight || 0) },
    ],
  }));
  const filaments = items.map((item, index) => ({
    filamentId: item.filamentId, type: item.type, color: item.color,
    usedGramsTotal: categoryByFilament[index].categories.reduce((sum, entry) => sum + entry.grams, 0),
  }));
  return { filaments, categoryByFilament };
}

export function ManualFilaments({ items, onChange, materials }: {
  items: FilamentDraft[];
  onChange: (items: FilamentDraft[]) => void;
  materials: Material[];
}) {
  const { t, lang } = useLocale();
  function update(filamentId: string, patch: Partial<FilamentDraft>) {
    onChange(items.map((item) => item.filamentId === filamentId ? { ...item, ...patch } : item));
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("manual.filaments")}</p>
      {items.map((item, index) => (
        <div key={item.filamentId} className="grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-700 sm:grid-cols-[1fr_auto_110px_auto] sm:items-end">
          <label className="min-w-0 text-sm text-slate-700 dark:text-slate-200">
            {t("manual.material")} {index + 1}
            <input list="manual-material-options" value={item.type} required maxLength={100} onChange={(event) => update(item.filamentId, { type: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            {t("manual.color")}
            <input type="color" value={item.color} onChange={(event) => update(item.filamentId, { color: event.target.value })} className="mt-1 block h-10 w-16 cursor-pointer rounded border border-slate-300 bg-white dark:border-slate-600" />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            {t("category.model")} (g)
            <input type="number" min="0" step="any" required value={item.weight} onChange={(event) => update(item.filamentId, { weight: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <button type="button" disabled={items.length === 1} onClick={() => onChange(items.filter((entry) => entry.filamentId !== item.filamentId))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 disabled:opacity-40" aria-label={`${t("manual.removeFilament")} ${index + 1}`} title={t("manual.removeFilament")}>
            &times;
          </button>
          <div className="grid gap-3 sm:col-span-4 sm:grid-cols-3">
            {([ ["supportWeight", "category.support"], ["towerWeight", "category.tower"], ["otherWeight", "category.other"] ] as const).map(([field, label]) => (
              <label key={field} className="text-sm text-slate-700 dark:text-slate-200">
                {t(label)} (g)
                <input type="number" min="0" step="any" value={item[field]} onChange={(event) => update(item.filamentId, { [field]: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
              </label>
            ))}
          </div>
        </div>
      ))}
      <datalist id="manual-material-options">{[...new Set(materials.map((item) => item.type))].map((type) => <option key={type} value={type} />)}</datalist>
      <button type="button" disabled={items.length >= 32} onClick={() => onChange([...items, { filamentId: crypto.randomUUID(), type: materials[0]?.type ?? "PLA", color: materials[0]?.color ?? "#ffffff", weight: "", supportWeight: "", towerWeight: "", otherWeight: "" }])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:border-orange-400 dark:border-slate-600 disabled:opacity-40">
        {t("manual.addFilament")}
      </button>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("print.totalWeight")}: {manualFilamentPayload(items).filaments.reduce((sum, item) => sum + (item.usedGramsTotal || 0), 0).toLocaleString(getIntlLocale(lang))} g</p>
    </div>
  );
}