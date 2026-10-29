"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { getIntlLocale, parseLocalizedNumber } from "@/lib/i18n";
import { useLocale } from "@/lib/locale";
import type { Material, ParsedPlate } from "@/lib/types";
import { ManualFilaments, manualFilamentPayload, type FilamentDraft } from "./ManualFilaments";

export function PrintDataEditor({ id, plate, manual = false, materials = [] }: { id: string; plate: ParsedPlate; manual?: boolean; materials?: Material[] }) {
  const router = useRouter();
  const { t, lang } = useLocale();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [manualFilaments, setManualFilaments] = useState<FilamentDraft[]>(plate.filaments.map((item) => {
    const categories = plate.categoryByFilament?.find((entry) => entry.filamentId === item.filamentId)?.categories;
    const grams = (category: string) => categories?.find((entry) => entry.category === category)?.grams ?? 0;
    return {
      filamentId: item.filamentId, type: item.type, color: item.color,
      weight: String(categories ? grams("model") : item.usedGramsTotal),
      supportWeight: grams("support") ? String(grams("support")) : "",
      towerWeight: grams("tower") ? String(grams("tower")) : "",
      otherWeight: grams("other") ? String(grams("other")) : "",
    };
  }));
  const formatDecimal = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(getIntlLocale(lang), {
      useGrouping: false,
      maximumFractionDigits,
    }).format(value);
  const parseDecimal = (value: string) =>
    parseLocalizedNumber(value, lang);
  const [weight, setWeight] = useState(formatDecimal(plate.totalWeightGrams));
  const [minutes, setMinutes] = useState(manual ? String(plate.totalPrintTimeSeconds / 60) : String(Math.round(plate.totalPrintTimeSeconds / 60)));
  const [filaments, setFilaments] = useState(
    plate.filaments.map((item) => formatDecimal(item.usedGramsTotal))
  );

  async function save() {
    const manualPayload = manual ? manualFilamentPayload(manualFilaments) : null;
    const updatedFilaments = manualPayload?.filaments ?? plate.filaments.map((item, index) => ({ ...item, usedGramsTotal: parseDecimal(filaments[index]) }));
    const totalWeightGrams = manual
      ? updatedFilaments.reduce((sum, item) => sum + item.usedGramsTotal, 0)
      : parseDecimal(weight);
    const totalPrintTimeSeconds = parseDecimal(minutes) * 60;
    if (![totalWeightGrams, totalPrintTimeSeconds, ...updatedFilaments.map((item) => item.usedGramsTotal),
      ...(manualPayload?.categoryByFilament.flatMap((item) => item.categories.map((category) => category.grams)) ?? [])].every((value) => Number.isFinite(value) && value >= 0) ||
      (manual && (totalWeightGrams <= 0 || manualFilaments.some((item) => !item.weight || !item.type.trim())))) {
      setError(t("print.invalidValues"));
      return;
    }
    const data = new FormData();
    data.set("plate", JSON.stringify({ totalWeightGrams, totalPrintTimeSeconds, printTimeSeconds: totalPrintTimeSeconds,
      filaments: updatedFilaments, ...(manualPayload ? { categoryByFilament: manualPayload.categoryByFilament } : {}) }));
    if (image) data.set("image", image);
    if (removeImage) data.set("removeImage", "true");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/prints/${id}`, { method: "PUT", body: data });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error ?? t("manual.error"));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(t("manual.error"));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600">✎ {t("print.editValues")}</button>
    {open && <Modal title={t("print.editValues")} onClose={() => setOpen(false)} wide={manual}><div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
      {!manual && <Field label={t("print.totalWeight")} value={weight} onChange={setWeight} />}
      <Field label={t("print.printTimeMinutes")} value={minutes} onChange={setMinutes} />
      {manual ? <>
        <ManualFilaments items={manualFilaments} onChange={setManualFilaments} materials={materials} />
      </> : <>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("print.filamentWeights")}</p>
        {plate.filaments.map((item, index) => <Field key={item.filamentId} label={`${item.type} (${item.color})`} value={filaments[index]} onChange={(value) => setFilaments((current) => current.map((old, itemIndex) => itemIndex === index ? value : old))} />)}
      </>}
      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("manual.image")}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setImage(event.target.files?.[0] ?? null); setRemoveImage(false); }} className="mt-1 block w-full text-sm" />
        <span className="mt-1 block text-xs text-slate-500">{t("manual.imageHint")}</span>
      </label>
      {plate.thumbnailBase64 && <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={removeImage} onChange={(event) => { setRemoveImage(event.target.checked); if (event.target.checked) setImage(null); }} />{t("manual.removeImage")}
      </label>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="button" disabled={saving} onClick={() => void save()} className="mt-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">{saving ? t("upload.processing") : t("print.saveValues")}</button>
    </div></Modal>}
  </>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );
}
