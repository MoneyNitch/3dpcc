"use client";

import { useState } from "react";
import { useCostInputs } from "@/lib/costInputsContext";
import { randomUUID } from "@/lib/clientId";
import { formatEuro } from "@/lib/format";
import { Modal } from "./Modal";

export function ExtraCostsCard() {
  const { inputs, update, save, saved } = useCostInputs();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [quantity, setQuantity] = useState("1");

  function addItem() {
    const parsedCost = parseFloat(cost.replace(",", "."));
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
          Zusätzliche Materialkosten
        </h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          + Hinzufügen
        </button>
      </div>

      {inputs.extraCosts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          Noch keine zusätzlichen Kosten erfasst, z. B. Schrauben, Muttern oder Kleber.
        </p>
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {inputs.extraCosts.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{item.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{formatEuro(item.cost)} ×</span>
              <input
                type="number"
                min={1}
                value={item.quantity ?? 1}
                onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10) || 1)}
                aria-label={`Stückzahl für ${item.name}`}
                className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="w-20 text-right font-medium text-slate-800 dark:text-slate-100">
                {formatEuro(item.cost * (item.quantity ?? 1))}
              </span>
              <button
                onClick={() => removeItem(item.id)}
                aria-label={`${item.name} entfernen`}
                className="text-xs font-medium text-red-500 hover:underline dark:text-red-400"
              >
                Entfernen
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <span>Gesamt</span>
            <span>{formatEuro(total)}</span>
          </div>
        </div>
      )}

      <button
        onClick={save}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        {saved ? "Gespeichert ✓" : "Speichern"}
      </button>

      {isModalOpen && (
        <Modal title="Zusätzliche Kosten hinzufügen" onClose={() => setIsModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Bezeichnung
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Schrauben, Muttern, Kleber"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Kosten pro Stück (€)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Stückzahl
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
              Hinzufügen
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
