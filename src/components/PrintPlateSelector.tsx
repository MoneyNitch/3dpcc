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
  const [editingName, setEditingName] = useState(false);
  const [plateName, setPlateName] = useState("");
  const [savingName, setSavingName] = useState(false);

  async function savePlateName() {
    const name = plateName.trim();
    if (!name) {
      setError(true);
      setMessage(t("print.plateNameRequired"));
      return;
    }
    setSavingName(true);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch(`/api/prints/${encodeURIComponent(printId)}/plates`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plateIndex: plate.plateIndex ?? plates.indexOf(plate) + 1, plateName: name }),
      });
      if (!response.ok) throw new Error(`Plate rename failed: HTTP ${response.status}`);
      setEditingName(false);
      setMessage(t("print.plateNameSaved"));
      router.refresh();
    } catch (reason) {
      console.error("Plate rename failed:", reason);
      setError(true);
      setMessage(t("print.plateNameError"));
    } finally {
      setSavingName(false);
    }
  }

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
        {plates.length > 1 && <button
          type="button"
          aria-pressed={allSelected}
          disabled={savingName}
          onClick={() => { setEditingName(false); selectAllPlates(); }}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
            allSelected
              ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
              : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          {t("print.allPlates")}
        </button>}
        {plates.map((item, index) => {
          const indexValue = item.plateIndex ?? index + 1;
          return (
            <button
              key={indexValue}
              type="button"
              disabled={savingName}
              aria-pressed={!allSelected && plate === item}
              onClick={() => { setEditingName(false); selectPlate(indexValue); }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                !allSelected && plate === item
                  ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {item.plateName || t("print.plateNumber", { number: item.plateIndex ?? index + 1 })}
            </button>
          );
        })}
        {!allSelected && !editingName && <button type="button"
          onClick={() => {
            setPlateName(plate.plateName ?? t("print.plateNumber", { number: plate.plateIndex ?? plates.indexOf(plate) + 1 }));
            setMessage(null);
            setEditingName(true);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
          {t("print.renamePlate")}
        </button>}
        {plates.length > 1 && <button
          type="button"
          disabled={creating || savingName}
          onClick={() => void createIndividualPrints()}
          className="ml-auto rounded-lg border border-orange-500 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
        >
          {creating ? t("print.creatingPlatePrints") : t("print.createPlatePrints")}
        </button>}
      </div>
      {editingName && (
        <form onSubmit={(event) => { event.preventDefault(); void savePlateName(); }}
          className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            {t("print.plateName")}
            <input autoFocus value={plateName} maxLength={200} disabled={savingName}
              onChange={(event) => setPlateName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape" && !savingName) setEditingName(false); }}
              className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
          </label>
          <button type="submit" disabled={savingName}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {t(savingName ? "upload.processing" : "print.saveValues")}
          </button>
          <button type="button" disabled={savingName} onClick={() => setEditingName(false)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">
            {t("print.cancelPlateRename")}
          </button>
        </form>
      )}
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
