"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale";
import { usePlateSelection } from "@/lib/plateSelectionContext";

export function PrintPlateSelector({ printId }: { printId: string }) {
  const { plates, plate, allSelected, selectPlate, selectAllPlates } = usePlateSelection();
  const { t } = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (plates.length < 2) return null;

  async function createIndividualPrints() {
    if (!window.confirm(t("print.createPlatePrintsConfirm", { count: plates.length }))) return;
    setCreating(true);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch(`/api/prints/${encodeURIComponent(printId)}/plates`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t("print.createPlatePrintsError"));
      setMessage(t("print.createPlatePrintsSuccess", { count: result.count }));
      router.refresh();
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : t("print.createPlatePrintsError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("print.plates")}
        </span>
        <button
          type="button"
          aria-pressed={allSelected}
          onClick={selectAllPlates}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
            allSelected
              ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
              : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          {t("print.allPlates")}
        </button>
        {plates.map((item, index) => {
          const indexValue = item.plateIndex ?? index + 1;
          return (
            <button
              key={indexValue}
              type="button"
              aria-pressed={!allSelected && plate.plateIndex === item.plateIndex}
              onClick={() => selectPlate(indexValue)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                !allSelected && plate.plateIndex === item.plateIndex
                  ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {item.plateName || t("print.plateNumber", { number: item.plateIndex ?? index + 1 })}
            </button>
          );
        })}
        <button
          type="button"
          disabled={creating}
          onClick={() => void createIndividualPrints()}
          className="ml-auto rounded-lg border border-orange-500 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
        >
          {creating ? t("print.creatingPlatePrints") : t("print.createPlatePrints")}
        </button>
      </div>
      {allSelected && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("print.allPlatesCostHint")}</p>
      )}
      {message && (
        <p role={error ? "alert" : "status"} className={`mt-2 text-sm ${error ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
          {message}
        </p>
      )}
    </section>
  );
}
