"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useLocale } from "@/lib/locale";
import type { ParsedPlate } from "@/lib/types";

export function PrintDataEditor({ id, plate }: { id: string; plate: ParsedPlate }) {
  const router = useRouter();
  const { t, lang } = useLocale();
  const [open, setOpen] = useState(false);
  const formatDecimal = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", {
      useGrouping: false,
      maximumFractionDigits,
    }).format(value);
  const parseDecimal = (value: string) =>
    parseFloat(lang === "de" ? value.replace(",", ".") : value);
  const [weight, setWeight] = useState(formatDecimal(plate.totalWeightGrams));
  const [minutes, setMinutes] = useState(String(Math.round(plate.totalPrintTimeSeconds / 60)));
  const [filaments, setFilaments] = useState(
    plate.filaments.map((item) => formatDecimal(item.usedGramsTotal))
  );

  async function save() {
    const totalWeightGrams = parseDecimal(weight);
    const totalPrintTimeSeconds = parseDecimal(minutes) * 60;
    const weights = filaments.map(parseDecimal);
    if (![totalWeightGrams, totalPrintTimeSeconds, ...weights].every((value) => Number.isFinite(value) && value >= 0)) return;
    const response = await fetch(`/api/prints/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plate: { totalWeightGrams, totalPrintTimeSeconds, printTimeSeconds: totalPrintTimeSeconds, filaments: plate.filaments.map((item, index) => ({ ...item, usedGramsTotal: weights[index] })) } }) });
    if (response.ok) { setOpen(false); router.refresh(); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600">✎ {t("print.editValues")}</button>
    {open && <Modal title={t("print.editValues")} onClose={() => setOpen(false)}><div className="flex flex-col gap-3">
      <Field label={t("print.totalWeight")} value={weight} onChange={setWeight} />
      <Field label={t("print.printTimeMinutes")} value={minutes} onChange={setMinutes} />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("print.filamentWeights")}</p>
      {plate.filaments.map((item, index) => <Field key={item.filamentId} label={`${item.type} (${item.color})`} value={filaments[index]} onChange={(value) => setFilaments((current) => current.map((old, itemIndex) => itemIndex === index ? value : old))} />)}
      <button type="button" onClick={() => void save()} className="mt-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">{t("print.saveValues")}</button>
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
