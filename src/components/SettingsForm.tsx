"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type ReactNode } from "react";
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
import {
  createLanguagePackTemplate,
  currencySymbol,
  getIntlLocale,
  parseLanguagePack,
  parseLocalizedNumber,
} from "@/lib/i18n";
import { getCurrencyOptions } from "@/lib/currency";
import packageJson from "../../package.json";
import { PreviewQueueSettings } from "./PreviewQueueSettings";
import { SupportExport } from "./SupportExport";

type SettingsTab = "general" | "support" | "database" | "filaments" | "materials" | "accessories" | "printers" | "numbering" | "costs" | "queue";

type ImportedPrinterProfile = Omit<PrinterProfile, "id">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePrinterProfileExport(value: unknown): ImportedPrinterProfile[] | null {
  if (
    !isRecord(value)
    || value.format !== "3dpcc-printer-profiles"
    || value.version !== 1
    || !Array.isArray(value.printers)
    || value.printers.length === 0
    || value.printers.length > 100
  ) {
    return null;
  }

  const printers: ImportedPrinterProfile[] = [];
  for (const item of value.printers) {
    if (!isRecord(item)) return null;
    const { name, powerConsumptionW, purchasePrice, lifetimeHours, maintenanceCostPerHour } = item;
    if (
      typeof name !== "string"
      || !name.trim()
      || typeof powerConsumptionW !== "number"
      || !Number.isFinite(powerConsumptionW)
      || powerConsumptionW < 0
      || typeof purchasePrice !== "number"
      || !Number.isFinite(purchasePrice)
      || purchasePrice < 0
      || typeof lifetimeHours !== "number"
      || !Number.isFinite(lifetimeHours)
      || lifetimeHours <= 0
      || typeof maintenanceCostPerHour !== "number"
      || !Number.isFinite(maintenanceCostPerHour)
      || maintenanceCostPerHour < 0
    ) {
      return null;
    }

    printers.push({
      name: name.trim(),
      powerConsumptionW,
      purchasePrice,
      lifetimeHours,
      maintenanceCostPerHour,
    });
  }

  return printers;
}

export function SettingsForm({ initialSettings, databaseSettings, filamentSettings }: {
  initialSettings: AppSettings;
  databaseSettings: ReactNode;
  filamentSettings: ReactNode;
}) {
  const router = useRouter();
  const { t, setLocale, lang } = useLocale();
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [selectedPrinterId, setSelectedPrinterId] = useState(initialSettings.defaultPrinterId);
  const [printerSaved, setPrinterSaved] = useState(false);
  const [printerProfilesMessage, setPrinterProfilesMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [languagePackMessage, setLanguagePackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const unit = currencySymbol(settings.general.currency, lang);
  const currencies = getCurrencyOptions(lang);
  const formatDecimal = (value: number, maximumFractionDigits = 3) =>
    new Intl.NumberFormat(getIntlLocale(lang), {
      useGrouping: false,
      maximumFractionDigits,
    }).format(value);
  const parseDecimal = (value: string) =>
    parseLocalizedNumber(value, lang) || 0;
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: t("settings.general") },
    { id: "materials", label: t("settings.materials") },
    { id: "printers", label: t("settings.printers") },
    { id: "costs", label: t("settings.costsTitle") },
    { id: "accessories", label: t("settings.accessoryMaterials") },
    { id: "numbering", label: t("settings.numbering") },
    { id: "queue", label: t("queue.title") },
    { id: "filaments", label: t("filamentDb.title") },
    { id: "database", label: t("db.title") },
    { id: "support", label: t("support.title") },
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

  function exportPrinterProfiles() {
    const data = {
      format: "3dpcc-printer-profiles",
      version: 1,
      printers: settings.printers.map(({ name, powerConsumptionW, purchasePrice, lifetimeHours, maintenanceCostPerHour }) => ({
        name,
        powerConsumptionW,
        purchasePrice,
        lifetimeHours,
        maintenanceCostPerHour,
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = lang === "de" ? "3dpcc-druckerprofile.json" : "3dpcc-printer-profiles.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importPrinterProfiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 1_000_000) {
      setPrinterProfilesMessage({ type: "error", text: t("settings.printerProfilesTooLarge") });
      return;
    }

    let importedProfiles: ImportedPrinterProfile[] | null;
    try {
      importedProfiles = parsePrinterProfileExport(JSON.parse(await file.text()));
    } catch {
      importedProfiles = null;
    }

    if (!importedProfiles) {
      setPrinterProfilesMessage({ type: "error", text: t("settings.printerProfilesInvalid") });
      return;
    }

    const printers = importedProfiles.map((profile) => ({ ...profile, id: randomUUID() }));
    setSettings((current) => ({ ...current, printers: [...current.printers, ...printers] }));
    setSelectedPrinterId(printers[0].id);
    setSaved(false);
    setPrinterSaved(false);
    setPrinterProfilesMessage({
      type: "success",
      text: t("settings.printerProfilesImported", { count: printers.length }),
    });
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

  async function uploadLanguagePack(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      setLanguagePackMessage({ type: "error", text: t("settings.languagePackTooLarge") });
      return;
    }

    try {
      const pack = parseLanguagePack(JSON.parse(await file.text()));
      setSettings((current) => ({
        ...current,
        customLanguagePacks: [
          ...current.customLanguagePacks.filter((existing) => existing.code !== pack.code),
          pack,
        ],
      }));
      setSaved(false);
      setLanguagePackMessage({
        type: "success",
        text: t("settings.languagePackImported", { language: pack.name }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : t("settings.languagePackInvalid");
      setLanguagePackMessage({
        type: "error",
        text: `${t("settings.languagePackInvalid")} ${detail}`,
      });
    }
  }

  function downloadLanguageTemplate() {
    const template = {
      code: "fr",
      name: "Français",
      translations: createLanguagePackTemplate(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "3dpcc-language-template.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function removeLanguagePack(code: Language) {
    setSettings((current) => ({
      ...current,
      customLanguagePacks: current.customLanguagePacks.filter((pack) => pack.code !== code),
      general: current.general.language === code
        ? { ...current.general, language: "de" }
        : current.general,
    }));
    setSaved(false);
    setLanguagePackMessage(null);
  }

  async function save() {
    setSaveError(false);
    const wasFirstRun = !settings.setupCompleted;
    const payload = { ...settings, setupCompleted: true };
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Settings save failed (${response.status}).`);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveError(true);
      return false;
    }
    setSettings(payload);
    setLocale(payload.general.language, payload.general.currency, payload.customLanguagePacks);
    setSaved(true);
    router.refresh();
    if (wasFirstRun) router.push("/");
    return true;
  }

  async function savePrinters() {
    if (await save()) setPrinterSaved(true);
  }

  const textInputClass =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-6">
      {saveError && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{t("settings.saveFailed")}</p>}
      <div role="tablist" aria-label={t("settings.title")} className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${tab.id}-settings-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-settings-panel`}
            onClick={() => setActiveTab(tab.id)}
            className={`max-w-full border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab.id
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="support-settings-panel"
        role="tabpanel"
        aria-labelledby="support-settings-tab"
        hidden={activeTab !== "support"}
      >
        <SupportExport />
      </div>

      <div
        id="database-settings-panel"
        role="tabpanel"
        aria-labelledby="database-settings-tab"
        hidden={activeTab !== "database"}
      >
        {databaseSettings}
      </div>

      <div
        id="filaments-settings-panel"
        role="tabpanel"
        aria-labelledby="filaments-settings-tab"
        hidden={activeTab !== "filaments"}
      >
        {filamentSettings}
      </div>

      <section
        id="general-settings-panel"
        role="tabpanel"
        className={`${activeTab === "general" ? "" : "hidden "}rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.general")}</h2>
        <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          {t("settings.version")}: {packageJson.version}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.language")}>
            <select
              value={settings.general.language}
              onChange={(e) => updateGeneral({ language: e.target.value as Language })}
              className={`w-full ${textInputClass}`}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
              {settings.customLanguagePacks.map((pack) => (
                <option key={pack.code} value={pack.code}>{pack.name} ({pack.code})</option>
              ))}
            </select>
          </Field>
          <Field label={t("settings.currency")}>
            <select
              value={settings.general.currency}
              onChange={(e) => updateGeneral({ currency: e.target.value as Currency })}
              className={`w-full ${textInputClass}`}
            >
              {currencies.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="font-medium text-slate-800 dark:text-slate-100">{t("settings.invoiceSender")}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.invoiceSenderHelp")}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.companyName")}>
              <input
                value={settings.general.companyName}
                onChange={(event) => updateGeneral({ companyName: event.target.value })}
                className={`w-full ${textInputClass}`}
              />
            </Field>
            <Field label={t("settings.companyAddress")}>
              <textarea
                value={settings.general.companyAddress}
                onChange={(event) => updateGeneral({ companyAddress: event.target.value })}
                rows={3}
                className={`w-full ${textInputClass}`}
              />
            </Field>
            <Field label={t("settings.companyEmail")}>
              <input
                type="email"
                value={settings.general.companyEmail}
                onChange={(event) => updateGeneral({ companyEmail: event.target.value })}
                className={`w-full ${textInputClass}`}
              />
            </Field>
            <Field label={t("settings.companyPhone")}>
              <input
                value={settings.general.companyPhone}
                onChange={(event) => updateGeneral({ companyPhone: event.target.value })}
                className={`w-full ${textInputClass}`}
              />
            </Field>
            <Field label={t("settings.companyTaxId")}>
              <input
                value={settings.general.companyTaxId}
                onChange={(event) => updateGeneral({ companyTaxId: event.target.value })}
                className={`w-full ${textInputClass}`}
              />
            </Field>
            <Field label={t("settings.companyIban")}>
              <input
                value={settings.general.companyIban}
                onChange={(event) => updateGeneral({ companyIban: event.target.value })}
                className={`w-full ${textInputClass}`}
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="font-medium text-slate-800 dark:text-slate-100">{t("settings.languagePacks")}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.languagePackHelp")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadLanguageTemplate}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t("settings.downloadLanguageTemplate")}
            </button>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
              {t("settings.uploadLanguagePack")}
              <input
                type="file"
                accept=".json,application/json"
                onChange={uploadLanguagePack}
                className="sr-only"
              />
            </label>
          </div>
          {languagePackMessage && (
            <p
              role={languagePackMessage.type === "error" ? "alert" : "status"}
              className={`mt-2 text-sm ${
                languagePackMessage.type === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-700 dark:text-green-400"
              }`}
            >
              {languagePackMessage.text}
            </p>
          )}
          {settings.customLanguagePacks.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {settings.customLanguagePacks.map((pack) => (
                <li key={pack.code} className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <span>{pack.name} ({pack.code})</span>
                  <button
                    type="button"
                    onClick={() => removeLanguagePack(pack.code)}
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    {t("settings.removeLanguagePack")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={settings.general.enable3dPreview}
            onChange={(event) => updateGeneral({ enable3dPreview: event.target.checked })}
            aria-describedby="preview-3d-description"
            className="mt-1 h-4 w-4 accent-orange-500"
          />
          <span>
            <span className="font-medium">{t("settings.enable3dPreview")}</span>
            <span id="preview-3d-description" className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              {t("settings.enable3dPreviewHelp")}
            </span>
          </span>
        </label>
        <div className="mt-4 max-w-xl">
          <label htmlFor="preview-compute-percent" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("settings.previewComputePercent")}: {settings.general.previewComputePercent}%
          </label>
          <input
            id="preview-compute-percent"
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.general.previewComputePercent}
            disabled={!settings.general.enable3dPreview}
            onChange={(event) => updateGeneral({ previewComputePercent: Number(event.target.value) })}
            aria-describedby="preview-compute-help"
            className="mt-2 block w-full accent-orange-500 disabled:opacity-50"
          />
          <p id="preview-compute-help" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("settings.previewComputeHelp")}
          </p>
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
                {new Intl.NumberFormat(getIntlLocale(lang), {
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("settings.printers")}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportPrinterProfiles}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t("settings.exportPrinterProfiles")}
            </button>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-orange-500 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
              {t("settings.importPrinterProfiles")}
              <input
                type="file"
                accept=".json,application/json"
                onChange={importPrinterProfiles}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={addPrinter}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t("settings.addPrinter")}
            </button>
          </div>
        </div>
        {printerProfilesMessage && (
          <p
            role={printerProfilesMessage.type === "error" ? "alert" : "status"}
            className={`mt-2 text-sm ${
              printerProfilesMessage.type === "error"
                ? "text-red-600 dark:text-red-400"
                : "text-green-700 dark:text-green-400"
            }`}
          >
            {printerProfilesMessage.text}
          </p>
        )}

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

      {activeTab === "queue" && <PreviewQueueSettings />}
      <button
        hidden={activeTab === "queue" || activeTab === "database" || activeTab === "filaments" || activeTab === "support"}
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
  const formatDecimal = new Intl.NumberFormat(getIntlLocale(lang), {
    useGrouping: false,
    maximumFractionDigits: 3,
  }).format(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      step={step}
      defaultValue={formatDecimal}
      onChange={(e) => onChange(parseLocalizedNumber(e.target.value, lang) || 0)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
    />
  );
}
