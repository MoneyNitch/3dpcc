"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  AccessoryMaterial,
  AppSettings,
  Currency,
  Language,
  Material,
  PrinterProfile,
} from "@/lib/types";
import { randomUUID } from "@/lib/clientId";
import { useLocale } from "@/lib/locale";
import { currencySymbol } from "@/lib/i18n";

type SettingsTab = "general" | "materials" | "accessories" | "printers" | "numbering" | "costs";

export function SettingsForm({ initialSettings }: { initialSettings: AppSettings }) {
  const router = useRouter();
  const { t, setLocale, lang } = useLocale();
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saved, setSaved] = useState(false);
  const [selectedPrinterId, setSelectedPrinterId] = useState(initialSettings.defaultPrinterId);
  const [printerSaved, setPrinterSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const unit = currencySymbol(settings.general.currency);
  const formatDecimal = (value: number, maximumFractionDigits = 3) =>
    new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", {
      useGrouping: false,
      maximumFractionDigits,
    }).format(value);
  const parseDecimal = (value: string) =>
    parseFloat(lang === "de" ? value.replace(",", ".") : value) || 0;
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: t("settings.general") },
    { id: "materials", label: t("settings.materials") },
    { id: "accessories", label: t("settings.accessoryMaterials") },
    { id: "printers", label: t("settings.printers") },
    { id: "numbering", label: t("settings.numbering") },
    { id: "costs", label: t("settings.costsTitle") },
  ];

  function updateNumbering(kind: "invoice" | "quote", patch: Partial<AppSettings["numbering"]["invoice"]>) {
    setSettings((s) => ({
      ...s,
      numbering: { ...s.numbering, [kind]: { ...s.numbering[kind], ...patch } },
    }));
    setSaved(false);
  }

  function updateMaterial(id: string, patch: Partial<Material>) {
    setSettings((s) => ({
      ...s,
      materials: s.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    setSaved(false);
  }

  function addMaterial() {
    setSettings((s) => ({
      ...s,
      materials: [
        ...s.materials,
        { id: randomUUID(), name: t("settings.newMaterial"), type: "PLA", color: "#FFFFFF", pricePerKg: 20 },
      ],
    }));
    setSaved(false);
  }

  function removeMaterial(id: string) {
    setSettings((s) => ({ ...s, materials: s.materials.filter((m) => m.id !== id) }));
    setSaved(false);
  }

  function updateAccessoryMaterial(id: string, patch: Partial<AccessoryMaterial>) {
    setSettings((s) => ({
      ...s,
      accessoryMaterials: s.accessoryMaterials.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
    setSaved(false);
  }

  function addAccessoryMaterial() {
    setSettings((s) => ({
      ...s,
      accessoryMaterials: [
        ...s.accessoryMaterials,
        { id: randomUUID(), name: t("settings.newAccessory"), pricePerPack: 1, unitsPerPack: 1 },
      ],
    }));
    setSaved(false);
  }

  function removeAccessoryMaterial(id: string) {
    setSettings((s) => ({
      ...s,
      accessoryMaterials: s.accessoryMaterials.filter((item) => item.id !== id),
    }));
    setSaved(false);
  }

  function updatePrinter(id: string, patch: Partial<PrinterProfile>) {
    setSettings((s) => ({
      ...s,
      printers: s.printers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    setSaved(false);
    setPrinterSaved(false);
  }

  function addPrinter() {
    const id = randomUUID();
    setSettings((s) => ({
      ...s,
      printers: [
        ...s.printers,
        {
          id,
          name: t("settings.newPrinter"),
          powerConsumptionW: 150,
          purchasePrice: 500,
          lifetimeHours: 8000,
          maintenanceCostPerHour: 0.1,
        },
      ],
    }));
    setSelectedPrinterId(id);
    setSaved(false);
    setPrinterSaved(false);
  }

  function removePrinter(id: string) {
    setSettings((s) => {
      const printers = s.printers.filter((p) => p.id !== id);
      if (printers.length === 0) return s; // always keep at least one printer
      const defaultPrinterId = s.defaultPrinterId === id ? printers[0].id : s.defaultPrinterId;
      if (selectedPrinterId === id) setSelectedPrinterId(printers[0].id);
      return { ...s, printers, defaultPrinterId };
    });
    setSaved(false);
    setPrinterSaved(false);
  }

  function setDefaultPrinter(id: string) {
    setSettings((s) => ({ ...s, defaultPrinterId: id }));
    setSaved(false);
    setPrinterSaved(false);
  }

  function updateGeneral(patch: Partial<AppSettings["general"]>) {
    setSettings((s) => ({ ...s, general: { ...s.general, ...patch } }));
    setSaved(false);
  }

  async function save() {
    const wasFirstRun = !settings.setupCompleted;
    const payload = { ...settings, setupCompleted: true };
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSettings(payload);
    setLocale(payload.general.language, payload.general.currency);
    setSaved(true);
    router.refresh();
    if (wasFirstRun) router.push("/");
  }

  async function savePrinters() {
    await save();
    setPrinterSaved(true);
  }

  const textInputClass =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label={t("settings.title")} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-settings-panel`}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab.id
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id="general-settings-panel"
        role="tabpanel"
        className={`${activeTab === "general" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.general")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.language")}>
            <select
              value={settings.general.language}
              onChange={(e) => updateGeneral({ language: e.target.value as Language })}
              className={`w-full ${textInputClass}`}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t("settings.currency")}>
            <select
              value={settings.general.currency}
              onChange={(e) => updateGeneral({ currency: e.target.value as Currency })}
              className={`w-full ${textInputClass}`}
            >
              <option value="EUR">Euro (€)</option>
              <option value="USD">US-Dollar ($)</option>
            </select>
          </Field>
        </div>
      </section>

      <section
        id="materials-settings-panel"
        role="tabpanel"
        className={`${activeTab === "materials" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.materials")}</h2>
        <div className="mt-3 flex flex-col gap-3">
          {settings.materials.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(m.color) ? m.color : "#cccccc"}
                onChange={(e) => updateMaterial(m.id, { color: e.target.value })}
                className="h-9 w-9 rounded"
              />
              <input
                value={m.name}
                onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
                className={`w-40 ${textInputClass}`}
                placeholder={t("settings.materialName")}
              />
              <input
                value={m.type}
                onChange={(e) => updateMaterial(m.id, { type: e.target.value })}
                className={`w-24 ${textInputClass}`}
                placeholder={t("settings.materialType")}
              />
              <input
                type="text"
                inputMode="decimal"
                defaultValue={formatDecimal(m.pricePerKg, 2)}
                onChange={(e) => updateMaterial(m.id, { pricePerKg: parseDecimal(e.target.value) })}
                className={`w-24 ${textInputClass}`}
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">{unit}/kg</span>
              <button
                onClick={() => removeMaterial(m.id)}
                className="ml-auto text-xs font-medium text-red-500 hover:underline dark:text-red-400"
              >
                {t("extra.remove")}
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addMaterial}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {t("settings.addMaterial")}
        </button>
      </section>

      <section
        id="accessories-settings-panel"
        role="tabpanel"
        className={`${activeTab === "accessories" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {t("settings.accessoryMaterials")}
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {settings.accessoryMaterials.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => updateAccessoryMaterial(item.id, { name: e.target.value })}
                className={`w-40 ${textInputClass}`}
                placeholder={t("settings.accessoryName")}
              />
              <input
                type="text"
                inputMode="decimal"
                defaultValue={formatDecimal(item.pricePerPack, 2)}
                onChange={(e) =>
                  updateAccessoryMaterial(item.id, {
                    pricePerPack: parseDecimal(e.target.value),
                  })
                }
                className={`w-24 ${textInputClass}`}
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">{unit}</span>
              <input
                type="number"
                min={1}
                step="1"
                value={item.unitsPerPack}
                onChange={(e) =>
                  updateAccessoryMaterial(item.id, { unitsPerPack: parseInt(e.target.value, 10) || 1 })
                }
                className={`w-20 ${textInputClass}`}
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">{t("settings.unitsPerPack")}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t("settings.costPerUnit")}: {unit}
                {new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                }).format(item.pricePerPack / Math.max(1, item.unitsPerPack))}
              </span>
              <button
                onClick={() => removeAccessoryMaterial(item.id)}
                className="ml-auto text-xs font-medium text-red-500 hover:underline dark:text-red-400"
              >
                {t("extra.remove")}
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addAccessoryMaterial}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {t("settings.addAccessoryMaterial")}
        </button>
      </section>

      <section
        id="printers-settings-panel"
        role="tabpanel"
        className={`${activeTab === "printers" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.printers")}</h2>
          <button
            onClick={addPrinter}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {t("settings.addPrinter")}
          </button>
        </div>

        <Field label={t("settings.selectPrinter")}>
          <select
            value={selectedPrinterId}
            onChange={(e) => setSelectedPrinterId(e.target.value)}
            className={`w-full ${textInputClass}`}
          >
            {settings.printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === settings.defaultPrinterId ? ` ${t("cost.default")}` : ""}
              </option>
            ))}
          </select>
        </Field>

        {settings.printers
          .filter((p) => p.id === selectedPrinterId)
          .map((printer) => (
            <div key={printer.id} className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="radio"
                    name="defaultPrinter"
                    checked={settings.defaultPrinterId === printer.id}
                    onChange={() => setDefaultPrinter(printer.id)}
                  />
                  {t("settings.useAsDefault")}
                </label>
                <button
                  onClick={() => removePrinter(printer.id)}
                  disabled={settings.printers.length <= 1}
                  className="text-xs font-medium text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
                >
                  {t("extra.remove")}
                </button>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label={t("settings.printerName")}>
                  <input
                    value={printer.name}
                    onChange={(e) => updatePrinter(printer.id, { name: e.target.value })}
                    className={`w-full ${textInputClass}`}
                  />
                </Field>
                <Field label={t("settings.powerConsumption")}>
                  <NumberInput
                    value={printer.powerConsumptionW}
                    onChange={(v) => updatePrinter(printer.id, { powerConsumptionW: v })}
                  />
                </Field>
                <Field label={`${t("settings.purchasePrice")} (${unit})`}>
                  <NumberInput
                    value={printer.purchasePrice}
                    onChange={(v) => updatePrinter(printer.id, { purchasePrice: v })}
                  />
                </Field>
                <Field label={t("settings.lifetimeHours")}>
                  <NumberInput
                    value={printer.lifetimeHours}
                    onChange={(v) => updatePrinter(printer.id, { lifetimeHours: v })}
                  />
                </Field>
                <Field label={`${t("settings.maintenanceCost")} (${unit}/h)`}>
                  <NumberInput
                    step={0.01}
                    value={printer.maintenanceCostPerHour}
                    onChange={(v) => updatePrinter(printer.id, { maintenanceCostPerHour: v })}
                  />
                </Field>
              </div>
              <button
                onClick={savePrinters}
                className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                {printerSaved ? t("settings.saved") : t("settings.savePrinter")}
              </button>
            </div>
          ))}
      </section>

      <section
        id="numbering-settings-panel"
        role="tabpanel"
        className={`${activeTab === "numbering" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.numbering")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.numberingHint")}</p>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("nav.invoices")}</h3>
            <div className="mt-2 grid gap-3">
              <Field label={t("settings.numberPrefix")}>
                <input
                  value={settings.numbering.invoice.prefix}
                  onChange={(e) => updateNumbering("invoice", { prefix: e.target.value })}
                  className={`w-full ${textInputClass}`}
                />
              </Field>
              <Field label={t("settings.nextNumber")}>
                <input
                  type="number"
                  min={1}
                  value={settings.numbering.invoice.nextNumber}
                  onChange={(e) => updateNumbering("invoice", { nextNumber: parseInt(e.target.value, 10) || 1 })}
                  className={`w-full ${textInputClass}`}
                />
              </Field>
              <Field label={t("settings.numberDigits")}>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.numbering.invoice.digits}
                  onChange={(e) => updateNumbering("invoice", { digits: parseInt(e.target.value, 10) || 1 })}
                  className={`w-full ${textInputClass}`}
                />
              </Field>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("nav.quotes")}</h3>
            <div className="mt-2 grid gap-3">
              <Field label={t("settings.numberPrefix")}>
                <input
                  value={settings.numbering.quote.prefix}
                  onChange={(e) => updateNumbering("quote", { prefix: e.target.value })}
                  className={`w-full ${textInputClass}`}
                />
              </Field>
              <Field label={t("settings.nextNumber")}>
                <input
                  type="number"
                  min={1}
                  value={settings.numbering.quote.nextNumber}
                  onChange={(e) => updateNumbering("quote", { nextNumber: parseInt(e.target.value, 10) || 1 })}
                  className={`w-full ${textInputClass}`}
                />
              </Field>
              <Field label={t("settings.numberDigits")}>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.numbering.quote.digits}
                  onChange={(e) => updateNumbering("quote", { digits: parseInt(e.target.value, 10) || 1 })}
                  className={`w-full ${textInputClass}`}
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section
        id="costs-settings-panel"
        role="tabpanel"
        className={`${activeTab === "costs" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.costsTitle")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={`${t("settings.electricityPrice")} (${unit}/kWh)`}>
            <NumberInput
              step={0.01}
              value={settings.costs.electricityPricePerKwh}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, electricityPricePerKwh: v } }))}
            />
          </Field>
          <Field label={`${t("settings.wearAndTear")} (${unit}/h)`}>
            <NumberInput
              step={0.01}
              value={settings.costs.wearAndTearPerHour}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, wearAndTearPerHour: v } }))}
            />
          </Field>
          <Field label={`${t("settings.laborRate")} (${unit}/h)`}>
            <NumberInput
              value={settings.costs.laborRatePerHour}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, laborRatePerHour: v } }))}
            />
          </Field>
          <Field label={t("settings.defaultLaborMinutes")}>
            <NumberInput
              value={settings.costs.defaultLaborMinutes}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, defaultLaborMinutes: v } }))}
            />
          </Field>
          <Field label={`${t("settings.defaultPackaging")} (${unit})`}>
            <NumberInput
              step={0.1}
              value={settings.costs.packagingCost}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, packagingCost: v } }))}
            />
          </Field>
          <Field label={t("settings.defaultMargin")}>
            <NumberInput
              value={settings.costs.marginPercent}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, marginPercent: v } }))}
            />
          </Field>
          <Field label={t("settings.tax")}>
            <NumberInput
              value={settings.costs.vatPercent}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, vatPercent: v } }))}
            />
          </Field>
        </div>
      </section>

      <button
        onClick={save}
        className="self-start rounded-lg bg-orange-500 px-5 py-2.5 font-medium text-white hover:bg-orange-600"
      >
        {!initialSettings.setupCompleted
          ? t("settings.finishSetup")
          : saved
            ? t("settings.saved")
            : t("settings.save")}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const { lang } = useLocale();
  const formatDecimal = new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", {
    useGrouping: false,
    maximumFractionDigits: 3,
  }).format(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      step={step}
      defaultValue={formatDecimal}
      onChange={(e) => onChange(parseFloat(lang === "de" ? e.target.value.replace(",", ".") : e.target.value) || 0)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
    />
  );
}
