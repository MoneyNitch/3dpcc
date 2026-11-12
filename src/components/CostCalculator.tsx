"use client";
import { usePermission } from "@/lib/auth/context";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { AppSettings } from "@/lib/types";
import { calculateAllPlatesCost, calculateCost, findFilamentPrice, findPrinter } from "@/lib/costCalculator";
import { externalSpoolKey, spoolConsumptionForFilaments, type ExternalSpoolResult } from "@/lib/externalFilaments";
import { useCostInputs } from "@/lib/costInputsContext";
import { useLocale } from "@/lib/locale";
import { currencySymbol, getIntlLocale, parseLocalizedNumber } from "@/lib/i18n";
import { usePlateSelection } from "@/lib/plateSelectionContext";
import type { MaterialBooking } from "@/lib/types";

export function CostCalculator({
  settings,
  printId,
}: {
  settings: AppSettings;
  printId: string;
}) {
  const { plates, plate, allSelected } = usePlateSelection();
  const { inputs, update, save, saved, saveError, inventoryBusy, setInventoryBusy, inventoryRevision } = useCostInputs();
  const canSave = usePermission("prints.write");
  const { t, money, currency, lang } = useLocale();
  const targetPriceHelpId = useId();
  const [spoolResults, setSpoolResults] = useState<ExternalSpoolResult[] | null>(null);
  const [loadingSpools, setLoadingSpools] = useState(false);
  const [spoolError, setSpoolError] = useState(false);
  const [priceInputVersion, setPriceInputVersion] = useState(0);
  const [consuming, setConsuming] = useState(false);
  const [bookings, setBookings] = useState<MaterialBooking[]>([]);
  const [journalError, setJournalError] = useState(false);
  const [consumptionMessage, setConsumptionMessage] = useState<{ error: boolean; text: string } | null>(null);
  const spools = spoolResults?.flatMap((result) => result.spools) ?? [];
  const unit = currencySymbol(currency, lang);
  const formatDecimal = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(getIntlLocale(lang), {
      useGrouping: false,
      maximumFractionDigits,
    }).format(value);
  const parseDecimal = (value: string) =>
    parseLocalizedNumber(value, lang) || 0;

  const result = useMemo(
    () => allSelected
      ? calculateAllPlatesCost(plates, settings, inputs)
      : calculateCost(plate, settings, inputs),
    [allSelected, plates, plate, settings, inputs]
  );
  const costFilaments = useMemo(() => {
    if (!allSelected) return plate.filaments;
    const totals = new Map<string, (typeof plate.filaments)[number]>();
    for (const item of plates.flatMap((item) => item.filaments)) {
      const key = `${item.filamentId}\0${item.type}\0${item.color}`;
      const existing = totals.get(key);
      if (existing) {
        existing.usedGramsTotal += item.usedGramsTotal;
        existing.usedMetersTotal += item.usedMetersTotal;
      } else {
        totals.set(key, { ...item });
      }
    }
    return [...totals.values()];
  }, [allSelected, plates, plate]);
  const spoolConsumption = spoolConsumptionForFilaments(costFilaments, inputs.externalSpools ?? {}, inputs.quantity);

  const loadBookings = useCallback(async () => {
    try {
      const response = await fetch(`/api/filament-bookings?printId=${encodeURIComponent(printId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load material booking journal.");
      const body: { bookings: MaterialBooking[] } = await response.json();
      setBookings(body.bookings);
      setJournalError(false);
    } catch {
      setJournalError(true);
    }
  }, [printId]);

  useEffect(() => {
    void Promise.resolve().then(loadBookings);
  }, [loadBookings]);

  async function consumeSpool(key: string) {
    const entry = spoolConsumption.get(key);
    if (!entry || consuming || inventoryBusy) return;
    if (!window.confirm(t("filamentDb.consumeConfirm", {
      name: entry.spool.name,
      grams: formatDecimal(entry.grams, 3),
    }))) return;
    setConsuming(true);
    setInventoryBusy(true);
    setConsumptionMessage(null);
    let knownRejection = false;
    try {
      const response = await fetch("/api/filament-spools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printId,
          provider: entry.spool.provider,
          sourceUrl: entry.spool.sourceUrl,
          id: entry.spool.id,
          grams: entry.grams,
          confirmed: true,
        }),
      });
      const body: { error?: string; booking?: MaterialBooking } = await response.json();
      if (!response.ok) {
        knownRejection = body.error !== undefined && body.error !== "uncertain";
        throw new Error(t(`filamentDb.consumeError.${body.error ?? "uncertain"}`));
      }
      if (body.booking) setBookings((current) => [body.booking!, ...current]);
      setConsumptionMessage({ error: false, text: t("filamentDb.consumed") });
      await loadSpools();
    } catch (error) {
      await loadBookings();
      setConsumptionMessage({
        error: true,
        text: knownRejection && error instanceof Error ? error.message : t("filamentDb.consumeError.uncertain"),
      });
    } finally {
      setConsuming(false);
      setInventoryBusy(false);
    }
  }

  async function reverseBooking(booking: MaterialBooking) {
    if (consuming || inventoryBusy) return;
    if (!window.confirm(t("filamentDb.reverseConfirm"))) return;
    setConsuming(true);
    setInventoryBusy(true);
    setConsumptionMessage(null);
    try {
      const response = await fetch("/api/filament-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedBookingId: booking.id, confirmed: true }),
      });
      const body: { error?: string; booking?: MaterialBooking } = await response.json();
      if (!response.ok || !body.booking) {
        throw new Error(t(`filamentDb.reverseError.${body.error ?? "save"}`));
      }
      setBookings((current) => [body.booking!, ...current]);
      setConsumptionMessage({ error: false, text: t("filamentDb.reversed") });
    } catch (error) {
      setConsumptionMessage({
        error: true,
        text: error instanceof Error ? error.message : t("filamentDb.reverseError.save"),
      });
      await loadBookings();
    } finally {
      setConsuming(false);
      setInventoryBusy(false);
    }
  }

  const inputClass =
    "mt-1 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  function updateMaterialPrice(filamentId: string, pricePerKg: number) {
    update("materialPriceOverrides", { ...inputs.materialPriceOverrides, [filamentId]: pricePerKg });
  }

  const loadSpools = useCallback(async () => {
    setLoadingSpools(true);
    setSpoolError(false);
    try {
      const response = await fetch("/api/filament-spools", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load external spools.");
      const body: { results: ExternalSpoolResult[] } = await response.json();
      setSpoolResults(body.results);
    } catch {
      setSpoolError(true);
    } finally {
      setLoadingSpools(false);
    }
  }, []);

  useEffect(() => {
    if (inventoryRevision === 0) return;
    void Promise.resolve().then(() => Promise.all([loadBookings(), loadSpools()]));
  }, [inventoryRevision, loadBookings, loadSpools]);

  function selectSpool(filamentId: string, key: string) {
    const externalSpools = { ...inputs.externalSpools };
    const materialPriceOverrides = { ...inputs.materialPriceOverrides };
    const spool = spools.find((item) => externalSpoolKey(item) === key);
    if (spool) {
      externalSpools[filamentId] = spool;
      if (spool.pricePerKg !== null) delete materialPriceOverrides[filamentId];
    } else {
      delete externalSpools[filamentId];
    }
    update("externalSpools", externalSpools);
    update("materialPriceOverrides", materialPriceOverrides);
    setPriceInputVersion((version) => version + 1);
  }

  const printer = findPrinter(settings, inputs.printerId);
  const totalPrintTimeSeconds = allSelected
    ? plates.reduce((total, item) => total + item.totalPrintTimeSeconds, 0)
    : plate.totalPrintTimeSeconds;
  const estimatedKwh = (printer.powerConsumptionW / 1000) * (totalPrintTimeSeconds / 3600);
  const usesManualEnergy = inputs.energyKwhOverride !== null;
  const targetPriceCannotBeReached = inputs.targetPricePerUnit !== null &&
    inputs.targetPricePerUnit > 0 &&
    (1 + inputs.vatPercent / 100) <= 0;

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
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
        <button type="button" disabled={loadingSpools} onClick={() => void loadSpools()}
          className="self-start text-xs font-medium text-orange-600 hover:underline disabled:opacity-50 dark:text-orange-400">
          {loadingSpools ? t("filamentDb.loading") : t("filamentDb.loadSpools")}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("filamentDb.currencyNote")}</p>
        {spoolError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t("filamentDb.error.connection")}</p>}
        {spoolResults?.map((result) => result.error && (
          <p key={result.provider} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {result.provider === "spoolman" ? "Spoolman" : "FilaMan"}: {t(`filamentDb.error.${result.error}`)}
          </p>
        ))}
        {spoolResults?.length === 0 && <Link href="/settings" className="text-xs text-orange-600 hover:underline dark:text-orange-400">{t("filamentDb.configure")}</Link>}
        {spoolResults && spoolResults.length > 0 && spools.length === 0 && !spoolResults.some((result) => result.error) &&
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("filamentDb.empty")}</p>}
        {costFilaments.map((f) => {
          const price = findFilamentPrice(f, settings, inputs);
          const selected = inputs.externalSpools?.[f.filamentId];
          const selectedKey = selected ? externalSpoolKey(selected) : "";
          return (
            <div key={f.filamentId} className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: f.color }}
                />
                <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                  {f.type} ({formatDecimal(f.usedGramsTotal, 1)} g)
                </span>
                <input
                  key={`${selectedKey}:${priceInputVersion}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={formatDecimal(price, 2)}
                  onChange={(e) => updateMaterialPrice(f.filamentId, parseDecimal(e.target.value))}
                  className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">{unit}/kg</span>
              </div>
              {(selected || spools.length > 0) && (
                <label className="block text-xs text-slate-600 dark:text-slate-300">
                  {t("filamentDb.spoolFor", { material: f.type, id: f.filamentId })}
                  <select value={selectedKey} onChange={(event) => selectSpool(f.filamentId, event.target.value)} className={inputClass}>
                    <option value="">{t("filamentDb.noSpool")}</option>
                    {selected && !spools.some((spool) => externalSpoolKey(spool) === selectedKey) && (
                      <option value={selectedKey}>{selected.name} (#{selected.id}, {selected.provider})</option>
                    )}
                    {spools.map((spool) => (
                      <option key={externalSpoolKey(spool)} value={externalSpoolKey(spool)}>
                        {spool.provider === "spoolman" ? "Spoolman" : "FilaMan"} #{spool.id}: {spool.name} · {spool.material}
                        {spool.color ? ` · ${spool.color}` : ""}
                        {spool.remainingGrams !== null ? ` · ${formatDecimal(spool.remainingGrams, 0)} g` : ""}
                        {spool.pricePerKg !== null ? ` · ${money(spool.pricePerKg)}/kg` : ` · ${t("filamentDb.noPrice")}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected && spools.some((spool) => externalSpoolKey(spool) === selectedKey) && (
                <button type="button" onClick={() => selectSpool(f.filamentId, selectedKey)}
                  className="text-xs text-orange-600 hover:underline dark:text-orange-400">
                  {t("filamentDb.useCurrentPrice")}
                </button>
              )}
              {selected?.pricePerKg === null && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("filamentDb.manualPrice")}</p>
              )}
              {selected && <p className="text-xs text-slate-500 dark:text-slate-400">{t("filamentDb.snapshotNote")}</p>}
            </div>
          );
        })}
        {[...spoolConsumption].map(([key, { spool, grams }]) => {
          const handled = bookings.some((booking) =>
            booking.kind === "consumption" && booking.provider === spool.provider &&
            booking.sourceUrl === spool.sourceUrl && booking.spoolId === spool.id &&
            ["pending", "confirmed", "uncertain"].includes(booking.status));
          return (
            <button key={key} type="button"
              disabled={!canSave || consuming || inventoryBusy || handled || journalError || !spool.sourceUrl || grams <= 0}
              onClick={() => void consumeSpool(key)}
              className="rounded-lg border border-orange-300 px-3 py-2 text-left text-xs text-orange-700 disabled:opacity-50 dark:border-orange-800 dark:text-orange-300">
              {handled ? t("filamentDb.consumeHandled") :
                t("filamentDb.consume", { name: spool.name, grams: formatDecimal(grams, 3) })}
            </button>
          );
        })}
        <section className="mt-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
          <h3 className="font-semibold">{t("filamentDb.journalTitle")}</h3>
          {journalError ? <p role="alert" className="mt-2 text-red-600 dark:text-red-400">
            {t("filamentDb.journalError")}
          </p> : bookings.length === 0 ? <p className="mt-2 text-slate-500 dark:text-slate-400">
            {t("filamentDb.journalEmpty")}
          </p> : <ol className="mt-2 flex flex-col gap-3">
            {bookings.map((booking) => {
              const reversed = bookings.some((entry) =>
                entry.kind === "reversal" && entry.relatedBookingId === booking.id);
              return (
                <li key={booking.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                  <div>
                    <p className="font-medium">
                      {t(`filamentDb.entry.${booking.kind}`, { grams: formatDecimal(booking.grams, 3) })} · {booking.spoolName}
                    </p>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      {booking.provider === "spoolman" ? "Spoolman" : "FilaMan"} #{booking.spoolId} · {t(booking.kind === "reversal" ? "filamentDb.status.local" : `filamentDb.status.${booking.status}`)} · {new Date(booking.createdAt).toLocaleString(getIntlLocale(lang))}
                    </p>
                  </div>
                  {booking.kind === "consumption" && booking.status === "confirmed" && !reversed &&
                    canSave && <button type="button" disabled={consuming || inventoryBusy} onClick={() => void reverseBooking(booking)}
                      className="rounded border border-slate-300 px-2 py-1 text-orange-700 disabled:opacity-50 dark:border-slate-600 dark:text-orange-400">
                      {t("filamentDb.reverse")}
                    </button>}
                  {booking.kind === "consumption" && reversed &&
                    <span className="text-slate-500 dark:text-slate-400">{t("filamentDb.reversedStatus")}</span>}
                </li>
              );
            })}
          </ol>}
        </section>
        {consumptionMessage && (
          <p role={consumptionMessage.error ? "alert" : "status"}
            className={`text-xs ${consumptionMessage.error ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
            {consumptionMessage.text}
          </p>
        )}
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
          {t("cost.quantityDiscountThreshold")}
          <input
            type="number"
            min={1}
            value={inputs.quantityDiscountThreshold}
            onChange={(e) => update("quantityDiscountThreshold", Math.max(1, parseInt(e.target.value) || 1))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("cost.quantityDiscountPercent")} (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={inputs.quantityDiscountPercent}
            onChange={(e) => update("quantityDiscountPercent", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
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
            value={inputs.targetPricePerUnit === null
              ? formatDecimal(inputs.marginPercent)
              : result.subtotal > 0
                ? formatDecimal((result.marginAmount / result.subtotal) * 100)
                : t("cost.marginNotAvailable")}
            readOnly={inputs.targetPricePerUnit !== null}
            onChange={(e) => update("marginPercent", parseDecimal(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            {t("cost.targetPricePerUnit")} ({unit})
            <span
              role="img"
              tabIndex={0}
              aria-label={t("cost.targetPriceInfo")}
              aria-describedby={targetPriceHelpId}
              className="group relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 outline-offset-2 hover:text-orange-600 focus-visible:outline-2 focus-visible:outline-orange-500 dark:text-slate-500 dark:hover:text-orange-400"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor">
                <circle cx="8" cy="8" r="6.25" strokeWidth="1.5" />
                <path d="M8 7.25v4M8 4.75h.01" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span
                id={targetPriceHelpId}
                role="tooltip"
                className="invisible pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs font-normal text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
              >
                {t("cost.targetPriceHelp")}
              </span>
            </span>
          </span>
          <input
            type="text"
            inputMode="decimal"
            defaultValue={inputs.targetPricePerUnit === null ? "" : formatDecimal(inputs.targetPricePerUnit)}
            onChange={(e) => {
              const value = e.target.value.trim();
              const targetPrice = value ? parseLocalizedNumber(value, lang) : null;
              update("targetPricePerUnit", targetPrice !== null && Number.isFinite(targetPrice) ? targetPrice : null);
            }}
            className={inputClass}
          />
        </label>
        {targetPriceCannotBeReached && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {t("cost.targetPriceUnavailable")}
            </p>
        )}
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
        {result.quantityDiscountAmount > 0 && (
          <div className="flex justify-between text-green-700 dark:text-green-400">
            <span>{t("cost.quantityDiscount")} ({result.quantityDiscountPercent}%)</span>
            <span>−{money(result.quantityDiscountAmount)}</span>
          </div>
        )}
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
        disabled={!canSave}
        onClick={save}
        className="mt-5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        {!canSave ? t("auth.readOnlyCalculation") : saved ? t("cost.saved") : t("cost.save")}
      </button>
      {saveError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{t("cost.saveError")}</p>}
    </div>
  );
}
