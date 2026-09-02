"use client";

import { useState } from "react";
import { useCostInputs } from "@/lib/costInputsContext";
import { randomUUID } from "@/lib/clientId";
import { useLocale } from "@/lib/locale";
import { currencySymbol } from "@/lib/i18n";
import type { AccessoryMaterial } from "@/lib/types";
import { Modal } from "./Modal";

export function ExtraCostsCard({ accessoryMaterials }: { accessoryMaterials: AccessoryMaterial[] }) {
  const { inputs, update, save, saved } = useCostInputs();
  const { t, money, currency, lang } = useLocale();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [quantity, setQuantity] = useState("1");

  function selectAccessory(id: string) {
    const item = accessoryMaterials.find((accessory) => accessory.id === id);
    if (!item) return;
    setName(item.name);
    setCost(
      new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", {
        maximumFractionDigits: 4,
      }).format(item.pricePerPack / Math.max(1, item.unitsPerPack))
    );
  }

  function addItem() {
    const parsedCost = parseFloat(lang === "de" ? cost.replace(",", ".") : cost);
    const parsedQuantity = parseInt(quantity, 10);
    if (!name.trim() || !Number.isFinite(parsedCost)) return;
    update("extraCosts", [
      ...inputs.extraCosts,
      {
        id: randomUUID(),
        name: name.trim(),
        cost: parsedCost,
        quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
      },
    ]);
    setName("");
    setCost("");
    setQuantity("1");
    setIsModalOpen(false);
  }

  function updateQuantity(id: string, newQuantity: number) {
    update(
      "extraCosts",
      inputs.extraCosts.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, newQuantity) } : item
      )
    );
  }

  function removeItem(id: string) {
    update(
      "extraCosts",
      inputs.extraCosts.filter((item) => item.id !== id)
    );
  }

  const total = inputs.extraCosts.reduce((s, item) => s + item.cost * (item.quantity ?? 1), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {t("extra.title")}
        </h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {t("extra.add")}
        </button>
      </div>

      {inputs.extraCosts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          {t("extra.empty")}
        </p>
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {inputs.extraCosts.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{item.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{money(item.cost)} ×</span>
              <input
                type="number"
                min={1}
                value={item.quantity ?? 1}
                onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10) || 1)}
                aria-label={`${t("extra.quantity")}: ${item.name}`}
                className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="w-20 text-right font-medium text-slate-800 dark:text-slate-100">
                {money(item.cost * (item.quantity ?? 1))}
              </span>
              <button
                onClick={() => removeItem(item.id)}
                aria-label={`${t("extra.remove")}: ${item.name}`}
                className="text-xs font-medium text-red-500 hover:underline dark:text-red-400"
              >
                {t("extra.remove")}
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <span>{t("extra.total")}</span>
            <span>{money(total)}</span>
          </div>
        </div>
      )}

      <button
        onClick={save}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        {saved ? t("extra.saved") : t("extra.save")}
      </button>

      {isModalOpen && (
        <Modal title={t("extra.modalTitle")} onClose={() => setIsModalOpen(false)}>
          <div className="flex flex-col gap-3">
            {accessoryMaterials.length > 0 && (
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {t("extra.selectAccessory")}
                <select
                  defaultValue=""
                  onChange={(e) => selectAccessory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">{t("extra.manualEntry")}</option>
                  {accessoryMaterials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({money(item.pricePerPack / Math.max(1, item.unitsPerPack))}/{t("extra.unit")})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("extra.name")}
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("extra.namePlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {t("extra.costPerUnit")} ({currencySymbol(currency)})
                <input
                  type="text"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {t("extra.quantity")}
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
            <button
              onClick={addItem}
              className="mt-2 self-end rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              {t("extra.addAction")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
