"use client";

import { useMemo } from "react";
import type { AppSettings, ParsedPlate } from "@/lib/types";
import { calculateCost, findMaterialPriceForFilament, findPrinter } from "@/lib/costCalculator";
import { useCostInputs } from "@/lib/costInputsContext";
import { useLocale } from "@/lib/locale";
import { currencySymbol } from "@/lib/i18n";

export function CostCalculator({
  plate,
  settings,
}: {
  plate: ParsedPlate;
  settings: AppSettings;
}) {
  const { inputs, update, save, saved } = useCostInputs();
  const { t, money, currency, lang } = useLocale();
  const unit = currencySymbol(currency);
  const formatDecimal = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", {
      useGrouping: false,
      maximumFractionDigits,
    }).format(value);
  const parseDecimal = (value: string) =>
    parseFloat(lang === "de" ? value.replace(",", ".") : value) || 0;

  const result = useMemo(() => calculateCost(plate, settings, inputs), [plate, settings, inputs]);

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  function updateMaterialPrice(filamentId: string, pricePerKg: number) {
    update("materialPriceOverrides", { ...inputs.materialPriceOverrides, [filamentId]: pricePerKg });
  }

  const printer = findPrinter(settings, inputs.printerId);
  const estimatedKwh = (printer.powerConsumptionW / 1000) * (plate.totalPrintTimeSeconds / 3600);
  const usesManualEnergy = inputs.energyKwhOverride !== null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("cost.title")}</h2>

      <label className="mt-4 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {t("cost.printer")}
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
              {p.id === settings.defaultPrinterId ? ` ${t("cost.default")}` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t("cost.materialPrices")}
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
                {f.type} ({formatDecimal(f.usedGramsTotal, 1)} g)
              </span>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={formatDecimal(price, 2)}
                onChange={(e) => updateMaterialPrice(f.filamentId, parseDecimal(e.target.value))}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">{unit}/kg</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t("cost.energy")}
        </p>
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="radio"
              checked={!usesManualEnergy}
              onChange={() => update("energyKwhOverride", null)}
            />
            {t("cost.energyEstimated", { kwh: formatDecimal(estimatedKwh) })}
          </label>
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="radio"
              checked={usesManualEnergy}
              onChange={() => update("energyKwhOverride", estimatedKwh)}
            />
            {t("cost.energyMeasured")}
          </label>
          {usesManualEnergy && (
            <div className="ml-6 flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                defaultValue={formatDecimal(inputs.energyKwhOverride ?? 0)}
                onChange={(e) => update("energyKwhOverride", parseDecimal(e.target.value))}
                className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">{t("cost.kwhTotal")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("cost.quantity")}
          <input
            type="number"
            min={1}
            value={inputs.quantity}
            onChange={(e) => update("quantity", Math.max(1, parseInt(e.target.value) || 1))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("cost.laborMinutes")}
          <input
            type="text"
            inputMode="decimal"
            defaultValue={formatDecimal(inputs.laborMinutes)}
            onChange={(e) => update("laborMinutes", parseDecimal(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("cost.packaging")} ({unit})
          <input
            type="text"
            inputMode="decimal"
            defaultValue={formatDecimal(inputs.packagingCost)}
            onChange={(e) => update("packagingCost", parseDecimal(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("cost.margin")} (%)
          <input
            type="text"
            inputMode="decimal"
            defaultValue={formatDecimal(inputs.marginPercent)}
            onChange={(e) => update("marginPercent", parseDecimal(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("cost.tax")} (%)
          <input
            type="text"
            inputMode="decimal"
            defaultValue={formatDecimal(inputs.vatPercent)}
            onChange={(e) => update("vatPercent", parseDecimal(e.target.value))}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-5 space-y-1.5 text-sm">
        {result.materialLines.map((l, i) => (
          <div key={i} className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>{t("cost.material")} – {l.label}</span>
            <span>{money(l.amount)}</span>
          </div>
        ))}
        {result.extraCostsTotal > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>{t("extra.title")}</span>
            <span>{money(result.extraCostsTotal)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>{t("cost.electricity")}</span>
          <span>{money(result.energyCost)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>{t("cost.machine")}</span>
          <span>{money(result.machineCost)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>{t("cost.labor")}</span>
          <span>{money(result.laborCost)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>{t("cost.packaging")}</span>
          <span>{money(result.packagingCost)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <span>{t("cost.subtotal")}</span>
          <span>{money(result.subtotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>{t("cost.margin")} ({inputs.marginPercent}%)</span>
          <span>{money(result.marginAmount)}</span>
        </div>
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>{t("cost.tax")} ({inputs.vatPercent}%)</span>
          <span>{money(result.vatAmount)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-300 pt-2 text-lg font-bold text-slate-900 dark:border-slate-600 dark:text-slate-100">
          <span>{t("cost.totalPrice")}</span>
          <span>{money(result.totalPrice)}</span>
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500">
          {t("cost.perGram", { price: money(result.pricePerGram) })}
        </div>
      </div>

      <button
        onClick={save}
        className="mt-5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        {saved ? t("cost.saved") : t("cost.save")}
      </button>
    </div>
  );
}
