"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useLocale } from "@/lib/locale";
import { getIntlLocale } from "@/lib/i18n";
import type { OrderPriority, OrderStatus, PrintOrder } from "@/lib/types";
import type { OrderInput } from "@/lib/orders";
import {
  defaultOrderFilters, dueFilters, filterOrders, isOrderOverdue, localDateKey, type OrderFilters,
} from "@/lib/orderFilters";

type PrintOption = { id: string; name: string };
type Draft = OrderInput;
const sortFields = ["priority", "dueDate", "customer", "status", "createdAt"] as const;
const sortDirections = ["asc", "desc"] as const;

function subscribeToDateChange(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

const emptyDraft: Draft = {
  customerName: "",
  status: "open",
  priority: "normal",
  dueDate: null,
  notes: "",
  items: [],
};

function draftFromOrder(order: PrintOrder): Draft {
  return {
    customerName: order.customerName,
    status: order.status,
    priority: order.priority ?? "normal",
    dueDate: order.dueDate,
    notes: order.notes,
    items: order.items.map((item) => ({ ...item })),
  };
}

export function OrderManager({
  initialOrders,
  prints,
  canEdit,
  initialEditingOrderId,
  initialToday,
}: {
  initialOrders: PrintOrder[];
  prints: PrintOption[];
  canEdit: boolean;
  initialEditingOrderId?: string;
  initialToday: string;
}) {
  const { t, lang } = useLocale();
  const initialEditingOrder = canEdit ? initialOrders.find((order) => order.id === initialEditingOrderId) : undefined;
  const [orders, setOrders] = useState(initialOrders);
  const [draft, setDraft] = useState<Draft>(() => initialEditingOrder ? draftFromOrder(initialEditingOrder) : emptyDraft);
  const [gcodeFile, setGcodeFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(initialEditingOrder?.id ?? null);
  const [formOpen, setFormOpen] = useState(Boolean(initialEditingOrder));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const printNames = new Map(prints.map((print) => [print.id, print.name]));
  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const sortSelectClass =
    "mt-1 min-w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const statusOptions: OrderStatus[] = ["open", "in_progress", "ready", "completed", "cancelled"];
  const priorityOptions: OrderPriority[] = ["low", "normal", "high"];
  const [sortField, setSortField] = useState<(typeof sortFields)[number]>("priority");
  const [sortDirection, setSortDirection] = useState<(typeof sortDirections)[number]>("desc");
  const [filters, setFilters] = useState<OrderFilters>(defaultOrderFilters);
  const today = useSyncExternalStore(subscribeToDateChange,
    () => localDateKey(new Date()), () => initialToday);
  const priorityRank: Record<OrderPriority, number> = { low: 0, normal: 1, high: 2 };
  const sortedOrders = filterOrders(orders, filters, today).sort((left, right) => {
    let comparison = 0;
    switch (sortField) {
      case "priority":
        comparison = priorityRank[left.priority ?? "normal"] - priorityRank[right.priority ?? "normal"];
        break;
      case "dueDate":
        if (!left.dueDate || !right.dueDate) {
          if (!left.dueDate && !right.dueDate) return 0;
          return left.dueDate ? -1 : 1;
        }
        comparison = left.dueDate.localeCompare(right.dueDate);
        break;
      case "customer":
        comparison = left.customerName.localeCompare(right.customerName, lang);
        break;
      case "status":
        comparison = statusOptions.indexOf(left.status) - statusOptions.indexOf(right.status);
        break;
      case "createdAt":
        comparison = left.createdAt.localeCompare(right.createdAt);
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  function startNewOrder() {
    setEditingId(null);
    setDraft(emptyDraft);
    setGcodeFile(null);
    setFormOpen(true);
    setMessage(null);
  }

  function editOrder(order: PrintOrder) {
    setEditingId(order.id);
    setDraft(draftFromOrder(order));
    setGcodeFile(null);
    setFormOpen(true);
    setMessage(null);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setGcodeFile(null);
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
      let saved = body.order as PrintOrder;
      let uploadFailed = false;
      if (gcodeFile) {
        try {
          const uploadResponse = await fetch(`/api/orders/${saved.id}/gcode`, {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-File-Name": encodeURIComponent(gcodeFile.name),
            },
            body: gcodeFile,
          });
          const uploadBody = await uploadResponse.json();
          if (!uploadResponse.ok) {
            uploadFailed = true;
          } else {
            saved = uploadBody.order as PrintOrder;
          }
        } catch {
          uploadFailed = true;
        }
      }
      setOrders((current) => editingId
        ? current.map((order) => order.id === saved.id ? saved : order)
        : [saved, ...current]);
      closeForm();
      setMessage(uploadFailed
        ? { type: "error", text: t("orders.savedGcodeFailed") }
        : { type: "success", text: t("orders.saved") });
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

  async function removeOrderGcode(order: PrintOrder) {
    if (!window.confirm(t("orders.confirmRemoveGcode"))) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/gcode`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("orders.removeGcodeFailed"));
      const updated = body.order as PrintOrder;
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage({ type: "success", text: t("orders.gcodeRemoved") });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : t("orders.removeGcodeFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function updateOrder(order: PrintOrder, patch: { status?: OrderStatus; priority?: OrderPriority }) {
    const isPriorityUpdate = patch.priority !== undefined;
    const successMessage = isPriorityUpdate ? "orders.priorityUpdated" : "orders.statusUpdated";
    const failureMessage = isPriorityUpdate ? "orders.priorityUpdateFailed" : "orders.statusUpdateFailed";
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t(failureMessage));
      const updated = body.order as PrintOrder;
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage({ type: "success", text: t(successMessage) });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : t(failureMessage),
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
              {t("orders.priority")}
              <select className={inputClass} value={draft.priority}
                onChange={(event) => {
                  const priority = priorityOptions.find((option) => option === event.target.value);
                  if (priority) setDraft((current) => ({ ...current, priority }));
                }}>
                {priorityOptions.map((priority) => <option key={priority} value={priority}>{t(`orders.priority.${priority}`)}</option>)}
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
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
              {t("orders.gcodeFile")}
              <input
                className={inputClass}
                type="file"
                accept=".gcode,.gco,.gc"
                onChange={(event) => setGcodeFile(event.target.files?.[0] ?? null)}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                {t("orders.gcodeOptional")}
                {gcodeFile ? ` ${gcodeFile.name} (${(gcodeFile.size / (1024 * 1024)).toFixed(1)} MB)` : ""}
              </span>
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
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-40 flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.customerSearch")}
              <input type="search" className={inputClass} value={filters.customer}
                onChange={(event) => setFilters((current) => ({ ...current, customer: event.target.value }))} />
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.statusFilter")}
              <select className={sortSelectClass} value={filters.status}
                onChange={(event) => {
                  const status = (["not_completed", "all", ...statusOptions] as const)
                    .find((option) => option === event.target.value);
                  if (status) setFilters((current) => ({ ...current, status }));
                }}>
                <option value="not_completed">{t("orders.notCompleted")}</option>
                <option value="all">{t("orders.filterAll")}</option>
                {statusOptions.map((status) => <option key={status} value={status}>{t(`orders.status.${status}`)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.priorityFilter")}
              <select className={sortSelectClass} value={filters.priority}
                onChange={(event) => {
                  const priority = (["all", ...priorityOptions] as const).find((option) => option === event.target.value);
                  if (priority) setFilters((current) => ({ ...current, priority }));
                }}>
                <option value="all">{t("orders.filterAll")}</option>
                {priorityOptions.map((priority) => <option key={priority} value={priority}>{t(`orders.priority.${priority}`)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.dueFilter")}
              <select className={sortSelectClass} value={filters.due}
                onChange={(event) => {
                  const due = dueFilters.find((option) => option === event.target.value);
                  if (due) setFilters((current) => ({ ...current, due }));
                }}>
                {dueFilters.map((due) => <option key={due} value={due}>{t(`orders.due.${due}`)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.sortBy")}
              <select className={sortSelectClass} value={sortField}
                onChange={(event) => {
                  const field = sortFields.find((option) => option === event.target.value);
                  if (field) setSortField(field);
                }}>
                <option value="priority">{t("orders.priority")}</option>
                <option value="dueDate">{t("orders.dueDate")}</option>
                <option value="customer">{t("orders.customer")}</option>
                <option value="status">{t("orders.status")}</option>
                <option value="createdAt">{t("orders.createdAt")}</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("orders.sortDirection")}
              <select className={sortSelectClass} value={sortDirection}
                onChange={(event) => {
                  const direction = sortDirections.find((option) => option === event.target.value);
                  if (direction) setSortDirection(direction);
                }}>
                <option value="asc">{t("orders.sortAscending")}</option>
                <option value="desc">{t("orders.sortDescending")}</option>
              </select>
            </label>
            <button type="button" onClick={() => setFilters(defaultOrderFilters)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
              {t("orders.resetFilters")}
            </button>
          </div>
          <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
            {t("orders.filteredCount", { count: sortedOrders.length, total: orders.length })}
          </p>
          {sortedOrders.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t("orders.noMatches")}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {sortedOrders.map((order) => (
              <article key={order.id} className={`rounded-xl border p-5 shadow-sm ${
                isOrderOverdue(order, today)
                  ? "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      <Link href={`/orders/${order.id}`} className="hover:text-orange-600 hover:underline dark:hover:text-orange-400">{order.customerName}</Link>
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <span>{t("orders.status")}:</span>
                      {canEdit ? (
                        <select
                          aria-label={`${t("orders.status")} ${order.customerName}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          value={order.status}
                          disabled={busy}
                          onChange={(event) => {
                            const status = statusOptions.find((option) => option === event.target.value);
                            if (status && status !== order.status) void updateOrder(order, { status });
                          }}
                        >
                          {statusOptions.map((status) => <option key={status} value={status}>{t(`orders.status.${status}`)}</option>)}
                        </select>
                      ) : t(`orders.status.${order.status}`)}
                      <span>{t("orders.priority")}:</span>
                      {canEdit ? (
                        <select
                          aria-label={`${t("orders.priority")} ${order.customerName}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          value={order.priority ?? "normal"}
                          disabled={busy}
                          onChange={(event) => {
                            const priority = priorityOptions.find((option) => option === event.target.value);
                            if (priority && priority !== (order.priority ?? "normal")) void updateOrder(order, { priority });
                          }}
                        >
                          {priorityOptions.map((priority) => <option key={priority} value={priority}>{t(`orders.priority.${priority}`)}</option>)}
                        </select>
                      ) : t(`orders.priority.${order.priority ?? "normal"}`)}
                      {order.dueDate && (
                        <span>
                          {t("orders.dueDate")}: {new Intl.DateTimeFormat(getIntlLocale(lang)).format(new Date(`${order.dueDate}T00:00:00`))}
                        </span>
                      )}
                      {isOrderOverdue(order, today) && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-100">
                          {t("orders.overdue")}
                        </span>
                      )}
                    </div>
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
                {order.gcodeAttachment && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <a
                      className="text-orange-700 hover:underline dark:text-orange-400"
                      href={`/api/orders/${order.id}/gcode`}
                    >
                      {t("orders.downloadGcode")}: {order.gcodeAttachment.fileName}
                    </a>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {(order.gcodeAttachment.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => void removeOrderGcode(order)} disabled={busy}
                        className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300">
                        {t("orders.removeGcode")}
                      </button>
                    )}
                  </div>
                )}
                <Link href={`/orders/${order.id}`}
                  className="mt-4 inline-block rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/30">
                  {t("orders.openDetails")}
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
