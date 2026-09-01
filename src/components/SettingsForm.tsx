"use client";

import { useState } from "react";
import type { AppSettings, Material, PrinterProfile } from "@/lib/types";
import { randomUUID } from "@/lib/clientId";

export function SettingsForm({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saved, setSaved] = useState(false);
  const [selectedPrinterId, setSelectedPrinterId] = useState(initialSettings.defaultPrinterId);
  const [printerSaved, setPrinterSaved] = useState(false);

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
        { id: randomUUID(), name: "Neues Material", type: "PLA", color: "#FFFFFF", pricePerKg: 20 },
      ],
    }));
    setSaved(false);
  }

  function removeMaterial(id: string) {
    setSettings((s) => ({ ...s, materials: s.materials.filter((m) => m.id !== id) }));
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
          name: "Neuer Drucker",
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

  async function save() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
  }

  async function savePrinters() {
    await save();
    setPrinterSaved(true);
  }

  const textInputClass =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Materialien &amp; Preise</h2>
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
                placeholder="Name"
              />
              <input
                value={m.type}
                onChange={(e) => updateMaterial(m.id, { type: e.target.value })}
                className={`w-24 ${textInputClass}`}
                placeholder="Typ"
              />
              <input
                type="number"
                min={0}
                step="0.1"
                value={m.pricePerKg}
                onChange={(e) => updateMaterial(m.id, { pricePerKg: parseFloat(e.target.value) || 0 })}
                className={`w-24 ${textInputClass}`}
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">€/kg</span>
              <button
                onClick={() => removeMaterial(m.id)}
                className="ml-auto text-xs font-medium text-red-500 hover:underline dark:text-red-400"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addMaterial}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          + Material hinzufügen
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Drucker</h2>
          <button
            onClick={addPrinter}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            + Drucker hinzufügen
          </button>
        </div>

        <Field label="Drucker auswählen">
          <select
            value={selectedPrinterId}
            onChange={(e) => setSelectedPrinterId(e.target.value)}
            className={`w-full ${textInputClass}`}
          >
            {settings.printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === settings.defaultPrinterId ? " (Standard)" : ""}
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
                  Als Standard-Drucker verwenden
                </label>
                <button
                  onClick={() => removePrinter(printer.id)}
                  disabled={settings.printers.length <= 1}
                  className="text-xs font-medium text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
                >
                  Entfernen
                </button>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    value={printer.name}
                    onChange={(e) => updatePrinter(printer.id, { name: e.target.value })}
                    className={`w-full ${textInputClass}`}
                  />
                </Field>
                <Field label="Leistungsaufnahme (W)">
                  <NumberInput
                    value={printer.powerConsumptionW}
                    onChange={(v) => updatePrinter(printer.id, { powerConsumptionW: v })}
                  />
                </Field>
                <Field label="Anschaffungspreis (€)">
                  <NumberInput
                    value={printer.purchasePrice}
                    onChange={(v) => updatePrinter(printer.id, { purchasePrice: v })}
                  />
                </Field>
                <Field label="Erwartete Lebensdauer (Stunden)">
                  <NumberInput
                    value={printer.lifetimeHours}
                    onChange={(v) => updatePrinter(printer.id, { lifetimeHours: v })}
                  />
                </Field>
                <Field label="Wartungskosten (€/h)">
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
                {printerSaved ? "Gespeichert ✓" : "Drucker speichern"}
              </button>
            </div>
          ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Kosten &amp; Standardwerte</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Strompreis (€/kWh)">
            <NumberInput
              step={0.01}
              value={settings.costs.electricityPricePerKwh}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, electricityPricePerKwh: v } }))}
            />
          </Field>
          <Field label="Verschleiß/Abnutzung (€/h)">
            <NumberInput
              step={0.01}
              value={settings.costs.wearAndTearPerHour}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, wearAndTearPerHour: v } }))}
            />
          </Field>
          <Field label="Stundenlohn (€/h)">
            <NumberInput
              value={settings.costs.laborRatePerHour}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, laborRatePerHour: v } }))}
            />
          </Field>
          <Field label="Standard-Arbeitszeit (Minuten)">
            <NumberInput
              value={settings.costs.defaultLaborMinutes}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, defaultLaborMinutes: v } }))}
            />
          </Field>
          <Field label="Standard-Verpackungskosten (€)">
            <NumberInput
              step={0.1}
              value={settings.costs.packagingCost}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, packagingCost: v } }))}
            />
          </Field>
          <Field label="Standard-Gewinnmarge (%)">
            <NumberInput
              value={settings.costs.marginPercent}
              onChange={(v) => setSettings((s) => ({ ...s, costs: { ...s.costs, marginPercent: v } }))}
            />
          </Field>
          <Field label="MwSt. (%)">
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
        {saved ? "Gespeichert ✓" : "Einstellungen speichern"}
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
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
    />
  );
}
