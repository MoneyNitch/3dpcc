"use client";

import { useState } from "react";
import { usePermission } from "@/lib/auth/context";
import { useCostInputs } from "@/lib/costInputsContext";
import { useLocale } from "@/lib/locale";
import { usePlateSelection } from "@/lib/plateSelectionContext";
import { bookPrintInventory, printInventoryTargets, type InventoryResult } from "@/lib/printInventory";
import type { MaterialBooking } from "@/lib/types";

export function PrintInventoryAction({ printId }: { printId: string }) {
  const canBook = usePermission("prints.write");
  const { t } = useLocale();
  const { inputs, save, inventoryBusy, setInventoryBusy, inventoryChanged } = useCostInputs();
  const { plates, plate, allSelected } = usePlateSelection();
  const [results, setResults] = useState<InventoryResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  function failureText(result: InventoryResult) {
    if (result.code === "uncertain") return t("inventory.uncertain");
    if (result.accessory) {
      if (result.code === "insufficient_stock") return t("accessory.stockInsufficient");
      if (result.code === "no_accessories") return t("accessory.stockNoItems");
      if (result.code === "stock_limit") return t("accessory.stockLimit");
    } else if (["stock", "source", "missing", "auth", "connection", "input"].includes(result.code ?? "")) {
      return t(`filamentDb.consumeError.${result.code}`);
    }
    return t("inventory.rejected");
  }

  async function book() {
    if (inventoryBusy || !window.confirm(t("inventory.confirm"))) return;
    setInventoryBusy(true);
    setError(null);
    setResults([]);
    try {
      if (!await save()) {
        setError(t("cost.saveError"));
        return;
      }
      const response = await fetch(`/api/filament-bookings?printId=${encodeURIComponent(printId)}`, { cache: "no-store" });
      const body: { bookings?: MaterialBooking[] } = await response.json();
      if (!response.ok || !body.bookings) throw new Error("Could not load material booking journal.");
      const targets = printInventoryTargets(printId, allSelected ? plates : [plate], inputs, body.bookings);
      if (!targets.length) {
        setError(t("inventory.empty"));
        return;
      }
      const outcome = await bookPrintInventory(targets);
      setResults(outcome.results);
      inventoryChanged(outcome.accessories);
    } catch (error) {
      console.error("Could not update print inventory:", error);
      setError(t("inventory.failed"));
    } finally {
      setInventoryBusy(false);
    }
  }

  if (!canBook) return null;
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <button type="button" disabled={inventoryBusy} onClick={() => void book()}
        className="w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
        {inventoryBusy ? t("inventory.booking") : t("inventory.update")}
      </button>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("inventory.hint")}</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {results.length > 0 && (
        <ul role={results.some((result) => result.status === "error") ? "alert" : "status"} className="mt-3 space-y-2 text-sm">
          {results.map((result, index) => (
            <li key={index} className={result.status === "error" ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"}>
              {result.accessory ? t("settings.accessoryMaterials") : result.name}:{" "}
              {result.status === "error" ? failureText(result) :
                t(`inventory.${result.status}`)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
