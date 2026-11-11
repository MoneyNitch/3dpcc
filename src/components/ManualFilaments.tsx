"use client";

import { useLocale } from "@/lib/locale";
import { getIntlLocale } from "@/lib/i18n";
import { randomUUID } from "@/lib/clientId";
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
  const inputClass = "mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  function update(filamentId: string, patch: Partial<FilamentDraft>) {
    onChange(items.map((item) => item.filamentId === filamentId ? { ...item, ...patch } : item));
  }
  function addFilament() {
    const usedIds = new Set(items.map((item) => item.filamentId));
    const baseId = randomUUID();
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    onChange([...items, {
      filamentId: id,
      type: materials[0]?.type ?? "PLA",
      color: materials[0]?.color ?? "#ffffff",
      weight: "",
      supportWeight: "",
      towerWeight: "",
      otherWeight: "",
    }]);
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("manual.filaments")}</p>
        <p className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
          {t("print.totalWeight")}: {manualFilamentPayload(items).filaments.reduce((sum, item) => sum + (item.usedGramsTotal || 0), 0).toLocaleString(getIntlLocale(lang))} g
        </p>
      </div>
      {items.map((item, index) => (
        <div key={item.filamentId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <span aria-hidden="true" style={{ backgroundColor: item.color }} className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600" />
              {t("manual.material")} {index + 1}
            </p>
            <button type="button" disabled={items.length === 1} onClick={() => onChange(items.filter((entry) => entry.filamentId !== item.filamentId))} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30" aria-label={`${t("manual.removeFilament")} ${index + 1}`}>
              {t("extra.remove")}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)]">
            <label className="min-w-0 text-sm text-slate-700 dark:text-slate-200">
              {t("manual.material")} {index + 1}
              <input list="manual-material-options" value={item.type} required maxLength={100} onChange={(event) => update(item.filamentId, { type: event.target.value })} className={inputClass} />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              {t("manual.color")}
              <input type="color" value={item.color} onChange={(event) => update(item.filamentId, { color: event.target.value })} className="mt-1.5 block h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-900" />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              {t("category.model")} (g)
              <input type="number" min="0" step="any" required value={item.weight} onChange={(event) => update(item.filamentId, { weight: event.target.value })} className={inputClass} />
            </label>
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 dark:border-slate-700 sm:grid-cols-3">
            {([ ["supportWeight", "category.support"], ["towerWeight", "category.tower"], ["otherWeight", "category.other"] ] as const).map(([field, label]) => (
              <label key={field} className="text-sm text-slate-700 dark:text-slate-200">
                {t(label)} (g)
                <input type="number" min="0" step="any" value={item[field]} placeholder="0" onChange={(event) => update(item.filamentId, { [field]: event.target.value })} className={inputClass} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <datalist id="manual-material-options">{[...new Set(materials.map((item) => item.type))].map((type) => <option key={type} value={type} />)}</datalist>
      <button type="button" disabled={items.length >= 32} onClick={addFilament} className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-orange-950/20 dark:hover:text-orange-300 disabled:opacity-40">
        {t("manual.addFilament")}
      </button>
    </div>
  );
}