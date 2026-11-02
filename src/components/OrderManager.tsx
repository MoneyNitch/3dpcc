"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useLocale } from "@/lib/locale";
import { getIntlLocale } from "@/lib/i18n";
import type { OrderStatus, PrintOrder } from "@/lib/types";
import type { OrderInput } from "@/lib/orders";

type PrintOption = { id: string; name: string };
type Draft = OrderInput;

const emptyDraft: Draft = {
  customerName: "",
  status: "open",
  dueDate: null,
  notes: "",
  items: [],
};

export function OrderManager({
  initialOrders,
  prints,
  canEdit,
}: {
  initialOrders: PrintOrder[];
  prints: PrintOption[];
  canEdit: boolean;
}) {
  const { t, lang } = useLocale();
  const [orders, setOrders] = useState(initialOrders);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const printNames = new Map(prints.map((print) => [print.id, print.name]));
  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const statusOptions: OrderStatus[] = ["open", "in_progress", "ready", "completed", "cancelled"];

  function startNewOrder() {
    setEditingId(null);
    setDraft(emptyDraft);
    setFormOpen(true);
    setMessage(null);
  }

  function editOrder(order: PrintOrder) {
    setEditingId(order.id);
    setDraft({
      customerName: order.customerName,
      status: order.status,
      dueDate: order.dueDate,
      notes: order.notes,
      items: order.items.map((item) => ({ ...item })),
    });
    setFormOpen(true);
    setMessage(null);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(editingId ? `/api/orders/${editingId}` : "/api/orders", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, dueDate: draft.dueDate || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("orders.saveFailed"));
      const saved = body.order as PrintOrder;
      setOrders((current) => editingId
        ? current.map((order) => order.id === saved.id ? saved : order)
        : [saved, ...current]);
      closeForm();
      setMessage({ type: "success", text: t("orders.saved") });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : t("orders.saveFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeOrder(id: string) {
    if (!window.confirm(t("orders.confirmDelete"))) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("orders.deleteFailed"));
      setOrders((current) => current.filter((order) => order.id !== id));
      setMessage({ type: "success", text: t("orders.deleted") });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : t("orders.deleteFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  function addItem() {
    const alreadySelected = new Set(draft.items.map((item) => item.printId));
    const next = prints.find((print) => !alreadySelected.has(print.id));
    if (!next) return;
    setDraft((current) => ({ ...current, items: [...current.items, { printId: next.id, quantity: 1 }] }));
  }

  function updateItem(index: number, patch: Partial<Draft["items"][number]>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  }

  function removeItem(index: number) {
    setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  return (
    <div className="flex flex-col gap-5">
      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className={`text-sm ${
          message.type === "error" ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"
        }`}>{message.text}</p>
      )}

      {canEdit && !formOpen && (
        <button type="button" onClick={startNewOrder}
          className="self-start rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          {t("orders.create")}
        </button>
      )}

      {formOpen && (
        <form onSubmit={(event) => void saveOrder(event)}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-lg font-semibold">{t(editingId ? "orders.edit" : "orders.create")}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.customer")}
              <input className={inputClass} value={draft.customerName} required maxLength={200}
                onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} />
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.status")}
              <select className={inputClass} value={draft.status}
                onChange={(event) => {
                  const status = statusOptions.find((option) => option === event.target.value);
                  if (status) setDraft((current) => ({ ...current, status }));
                }}>
                {statusOptions.map((status) => <option key={status} value={status}>{t(`orders.status.${status}`)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.dueDate")}
              <input className={inputClass} type="date" value={draft.dueDate ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value || null }))} />
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
              {t("orders.notes")}
              <textarea className={inputClass} rows={3} maxLength={5000} value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{t("orders.prints")}</h3>
              <button type="button" onClick={addItem} disabled={draft.items.length >= prints.length || prints.length === 0}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600">
                {t("orders.addPrint")}
              </button>
            </div>
            {draft.items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("orders.noPrintsSelected")}</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {draft.items.map((item, index) => {
                  const selectedIds = new Set(draft.items.filter((_, itemIndex) => itemIndex !== index).map((entry) => entry.printId));
                  return (
                    <div key={`${item.printId}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <select className={inputClass} value={item.printId} required
                        aria-label={`${t("orders.prints")} ${index + 1}`}
                        onChange={(event) => updateItem(index, { printId: event.target.value })}>
                        {prints.filter((print) => !selectedIds.has(print.id)).map((print) =>
                          <option key={print.id} value={print.id}>{print.name}</option>)}
                      </select>
                      <input className={inputClass} type="number" min={1} max={1_000_000} required
                        aria-label={t("orders.quantity")} value={item.quantity}
                        onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                      <button type="button" onClick={() => removeItem(index)}
                        className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300">
                        {t("orders.removePrint")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={busy || draft.items.length === 0}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
              {busy ? t("orders.saving") : t("orders.save")}
            </button>
            <button type="button" onClick={closeForm} disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">
              {t("orders.cancel")}
            </button>
          </div>
        </form>
      )}

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t("orders.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{order.customerName}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t("orders.status")}: {t(`orders.status.${order.status}`)}
                    {order.dueDate ? ` · ${t("orders.dueDate")}: ${new Intl.DateTimeFormat(getIntlLocale(lang)).format(new Date(`${order.dueDate}T00:00:00`))}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => editOrder(order)} disabled={busy}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600">{t("orders.edit")}</button>
                    <button type="button" onClick={() => void removeOrder(order.id)} disabled={busy}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 dark:border-red-800 dark:text-red-300">{t("orders.delete")}</button>
                  </div>
                )}
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.printId} className="flex flex-wrap justify-between gap-2">
                    {printNames.has(item.printId) ? (
                      <Link className="text-orange-700 hover:underline dark:text-orange-400" href={`/prints/${item.printId}`}>
                        {printNames.get(item.printId)}
                      </Link>
                    ) : <span className="text-slate-500">{t("orders.missingPrint")}</span>}
                    <span className="text-slate-500 dark:text-slate-400">{item.quantity} ×</span>
                  </li>
                ))}
              </ul>
              {order.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{order.notes}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
