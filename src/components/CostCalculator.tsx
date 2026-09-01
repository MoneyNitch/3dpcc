"use client";

import { useMemo } from "react";
import type { AppSettings, ParsedPlate } from "@/lib/types";
import { calculateCost, findMaterialPriceForFilament, findPrinter } from "@/lib/costCalculator";
import { formatEuro } from "@/lib/format";
import { useCostInputs } from "@/lib/costInputsContext";

export function CostCalculator({
  plate,
  settings,
}: {
  plate: ParsedPlate;
  settings: AppSettings;
}) {
  const { inputs, update, save, saved } = useCostInputs();

  const result = useMemo(() => calculateCost(plate, settings, inputs), [plate, settings, inputs]);

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  function updateMaterialPrice(filamentId: string, pricePerKg: number) {
    update("materialPriceOverrides", { ...inputs.materialPriceOverrides, [filamentId]: pricePerKg });
  }

  const printer = findPrinter(settings, inputs.printerId);
  const estimatedKwh = (printer.powerConsumptionW / 1000) * (plate.totalPrintTimeSeconds / 3600);
  const usesManualEnergy = inputs.energyKwhOverride !== null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Kostenrechner</h2>

      <label className="mt-4 block text-sm font-medium text-slate-600 dark:text-slate-300">
        Drucker
        <select
          value={inputs.printerId ?? settings.defaultPrinterId}
          onChange={(e) =>
            update("printerId", e.target.value === settings.defaultPrinterId ? null : e.target.value)
          }
          className={inputClass}
        >
          {settings.printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === settings.defaultPrinterId ? " (Standard)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Materialpreise für diesen Druck
        </p>
        {plate.filaments.map((f) => {
          const price =
            inputs.materialPriceOverrides[f.filamentId] ?? findMaterialPriceForFilament(f, settings);
          return (
            <div key={f.filamentId} className="flex items-center gap-2 text-sm">
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
                style={{ backgroundColor: f.color }}
              />
              <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                {f.type} ({f.usedGramsTotal.toFixed(1)} g)
              </span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={price}
                onChange={(e) => updateMaterialPrice(f.filamentId, parseFloat(e.target.value) || 0)}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">€/kg</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Stromverbrauch
        </p>
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="radio"
              checked={!usesManualEnergy}
              onChange={() => update("energyKwhOverride", null)}
            />
            Geschätzt aus Druckzeit ({estimatedKwh.toFixed(2)} kWh)
          </label>
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="radio"
              checked={usesManualEnergy}
              onChange={() => update("energyKwhOverride", estimatedKwh)}
            />
            Gemessen (z. B. Smart-Steckdose)
          </label>
          {usesManualEnergy && (
            <div className="ml-6 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={inputs.energyKwhOverride ?? 0}
                onChange={(e) => update("energyKwhOverride", parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">kWh gesamt</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Menge (Stück)
          <input
            type="number"
            min={1}
            value={inputs.quantity}
            onChange={(e) => update("quantity", Math.max(1, parseInt(e.target.value) || 1))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Arbeitszeit (Minuten)
          <input
            type="number"
            min={0}
            value={inputs.laborMinutes}
            onChange={(e) => update("laborMinutes", parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Verpackung (€)
          <input
            type="number"
            min={0}
            step="0.1"
            value={inputs.packagingCost}
            onChange={(e) => update("packagingCost", parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Gewinnmarge (%)
          <input
            type="number"
            min={0}
            value={inputs.marginPercent}
            onChange={(e) => update("marginPercent", parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          MwSt. (%)
          <input
            type="number"
            min={0}
            value={inputs.vatPercent}
            onChange={(e) => update("vatPercent", parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-5 space-y-1.5 text-sm">
        {result.materialLines.map((l, i) => (
          <div key={i} className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Material – {l.label}</span>
            <span>{formatEuro(l.amount)}</span>
          </div>
        ))}
        {result.extraCostsTotal > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Zusätzliche Materialkosten</span>
            <span>{formatEuro(result.extraCostsTotal)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Stromkosten</span>
          <span>{formatEuro(result.energyCost)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Maschinenkosten (Abschreibung/Verschleiß)</span>
          <span>{formatEuro(result.machineCost)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Arbeitszeit</span>
          <span>{formatEuro(result.laborCost)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Verpackung</span>
          <span>{formatEuro(result.packagingCost)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <span>Zwischensumme</span>
          <span>{formatEuro(result.subtotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Gewinnmarge ({inputs.marginPercent}%)</span>
          <span>{formatEuro(result.marginAmount)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>MwSt. ({inputs.vatPercent}%)</span>
          <span>{formatEuro(result.vatAmount)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-300 pt-2 text-lg font-bold text-slate-900 dark:border-slate-600 dark:text-slate-100">
          <span>Gesamtpreis</span>
          <span>{formatEuro(result.totalPrice)}</span>
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500">
          ≈ {formatEuro(result.pricePerGram)} pro Gramm
        </div>
      </div>

      <button
        onClick={save}
        className="mt-5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        {saved ? "Gespeichert ✓" : "Kalkulation speichern"}
      </button>
    </div>
  );
}
