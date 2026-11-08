"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { getIntlLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/locale";
import {
  calculateOrderSnapshot, orderCalculationMatchesItems,
  type OrderCalculationInputs, type OrderCalculationSnapshot,
} from "@/lib/orderCalculation";
import type { OrderPriority, OrderStatus, PrintOrder } from "@/lib/types";
import { AccessoryStockAction } from "./AccessoryStockAction";

const statuses: OrderStatus[] = ["open", "in_progress", "ready", "completed", "cancelled"];
const priorities: OrderPriority[] = ["low", "normal", "high"];
const inputFields: { key: keyof OrderCalculationInputs; label: string; max: number }[] = [
  { key: "laborMinutes", label: "cost.laborMinutes", max: 1_000_000_000 },
  { key: "packagingCost", label: "cost.packaging", max: 1_000_000_000 },
  { key: "shippingCost", label: "orders.shipping", max: 1_000_000_000 },
  { key: "marginPercent", label: "orders.marginPercent", max: 100 },
  { key: "discountPercent", label: "orders.discountPercent", max: 100 },
  { key: "vatPercent", label: "orders.taxPercent", max: 100 },
];
const itemFields = [
  { key: "materialCost", label: "cost.material" },
  { key: "extraCost", label: "orders.additionalCosts" },
  { key: "energyCost", label: "cost.electricity" },
  { key: "machineCost", label: "cost.machine" },
] as const;
const totalFields = [
  { key: "materialTotal", label: "cost.material" },
  { key: "extraCostsTotal", label: "orders.additionalCosts" },
  { key: "energyCost", label: "cost.electricity" },
  { key: "machineCost", label: "cost.machine" },
  { key: "laborCost", label: "cost.labor" },
  { key: "packagingCost", label: "cost.packaging" },
  { key: "shippingCost", label: "orders.shipping" },
  { key: "subtotal", label: "cost.subtotal" },
  { key: "marginAmount", label: "cost.margin" },
  { key: "quantityDiscountAmount", label: "orders.discountTotal" },
  { key: "vatAmount", label: "cost.tax" },
] as const;

function DecimalInput({ value, max, className, onChange }: {
  value: number;
  max: number;
  className: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={0} max={max} step="0.01" required className={className}
      value={draft ?? value.toFixed(2)}
      onFocus={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = event.target.valueAsNumber;
        if (Number.isFinite(next)) onChange(next);
      }} />
  );
}

export function OrderDetail({ initialOrder, initialSnapshot, canEdit, hasAccessoryStockItems }: {
  initialOrder: PrintOrder;
  initialSnapshot: OrderCalculationSnapshot;
  canEdit: boolean;
  hasAccessoryStockItems: boolean;
}) {
  const { t, lang } = useLocale();
  const [order, setOrder] = useState(initialOrder);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const result = calculateOrderSnapshot(snapshot);
  const outdated = !orderCalculationMatchesItems(order, snapshot);
  const money = (value: number) => new Intl.NumberFormat(getIntlLocale(lang), {
    style: "currency", currency: snapshot.currency,
  }).format(value);
  const date = (value: string) => new Date(value).toLocaleString(getIntlLocale(lang));
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const cardClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800";

  async function changeOrder(patch: { status?: OrderStatus; priority?: OrderPriority }) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("orders.saveFailed"));
      setOrder(body.order);
      setMessage({ error: false, text: t("orders.saved") });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : t("orders.saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function saveCalculation(refresh: boolean) {
    if (refresh && !window.confirm(t("orders.confirmRefresh"))) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/calculate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: order.updatedAt, currency: snapshot.currency, inputs: snapshot.inputs, refresh,
          itemCosts: snapshot.items.map(({ printId, materialCost, extraCost, energyCost, machineCost }) => ({
            printId, materialCost, extraCost, energyCost, machineCost,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("orders.calculationFailed"));
      const updated: PrintOrder = body.order;
      if (!updated.calculation) throw new Error(t("orders.calculationFailed"));
      setOrder(updated);
      setSnapshot(updated.calculation);
      setDirty(false);
      setMessage({ error: false, text: t("orders.calculationSaved") });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : t("orders.calculationFailed") });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCalculation(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/orders" className="self-start text-sm text-orange-700 hover:underline dark:text-orange-400">{t("orders.back")}</Link>
      <header className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{order.customerName}</h1>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{t("orders.orderId")}: {order.id}</p>
          </div>
          {canEdit && <Link href={`/orders?edit=${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">{t("orders.edit")}</Link>}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">{t("orders.status")}
            <select className={inputClass} value={order.status} disabled={!canEdit || busy}
              onChange={(event) => {
                const status = statuses.find((value) => value === event.target.value);
                if (status) void changeOrder({ status });
              }}>
              {statuses.map((status) => <option key={status} value={status}>{t(`orders.status.${status}`)}</option>)}
            </select>
          </label>
          <label className="text-sm">{t("orders.priority")}
            <select className={inputClass} value={order.priority ?? "normal"} disabled={!canEdit || busy}
              onChange={(event) => {
                const priority = priorities.find((value) => value === event.target.value);
                if (priority) void changeOrder({ priority });
              }}>
              {priorities.map((priority) => <option key={priority} value={priority}>{t(`orders.priority.${priority}`)}</option>)}
            </select>
          </label>
          <div className="text-sm"><p>{t("orders.createdAt")}</p><p className="mt-2 text-slate-500 dark:text-slate-400">{date(order.createdAt)}</p></div>
          <div className="text-sm"><p>{t("orders.dueDate")}</p><p className="mt-2 text-slate-500 dark:text-slate-400">
            {order.dueDate ? new Intl.DateTimeFormat(getIntlLocale(lang)).format(new Date(`${order.dueDate}T00:00:00`)) : t("orders.noDueDate")}
          </p></div>
        </div>
        {order.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{order.notes}</p>}
        {order.gcodeAttachment && <a href={`/api/orders/${order.id}/gcode`}
          className="mt-4 inline-block break-all text-sm text-orange-700 hover:underline dark:text-orange-400">
          {t("orders.downloadGcode")}: {order.gcodeAttachment.fileName}
        </a>}
      </header>

      <section className={cardClass} aria-labelledby="order-history-heading">
        <h2 id="order-history-heading" className="text-lg font-semibold">{t("orders.history.title")}</h2>
        <ol className="mt-4 flex flex-col gap-3">
          {(order.history ?? [
            { type: "created" as const, at: order.createdAt },
            { type: "updated" as const, at: order.updatedAt },
            ...(order.status === "completed" ? [{ type: "completed" as const, at: order.updatedAt }] : []),
          ]).map((entry, index) => (
            <li key={`${entry.type}:${entry.at}:${index}`} className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{t(`orders.history.${entry.type}`)}</span>
              <time dateTime={entry.at} className="text-slate-500 dark:text-slate-400">{date(entry.at)}</time>
            </li>
          ))}
        </ol>
      </section>

      {message && <p role={message.error ? "alert" : "status"}
        className={`text-sm ${message.error ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{message.text}</p>}
      {hasAccessoryStockItems && (
        <AccessoryStockAction source="order" sourceId={order.id} canBook={canEdit} />
      )}
      <form onSubmit={submit} className={cardClass}>
        <h2 className="text-lg font-semibold">{t("orders.calculationTitle")}</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("orders.independentNote")}</p>
        <p className="mt-2 text-sm font-medium">
          {!order.calculation ? t("orders.unsavedCalculation") : dirty ? t("orders.unsavedChanges") :
            t("orders.savedCalculationAt", { date: date(order.calculation.savedAt) })}
        </p>
        {outdated && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{t("orders.outdatedCalculation")}</p>}
        <fieldset disabled={!canEdit || busy} className="mt-5 flex min-w-0 flex-col gap-4">
          <legend className="text-sm font-medium">{t("orders.unitCosts")}</legend>
          {snapshot.items.map((item, index) => (
            <div key={item.printId} className="min-w-0 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                <Link href={`/prints/${item.printId}`} className="break-all text-orange-700 hover:underline dark:text-orange-400">{item.printName}</Link>
                <span>{item.quantity} × · {money(result.items[index].totalPrice)} ({t("orders.positionBaseCost")})</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {itemFields.map(({ key, label }) => (
                  <label key={key} className="text-sm">{t(label)} ({snapshot.currency})
                    <DecimalInput max={1_000_000_000} className={inputClass} value={item[key]}
                      onChange={(value) => {
                        setSnapshot((current) => ({ ...current, items: current.items.map((entry, itemIndex) =>
                          itemIndex === index ? { ...entry, [key]: value } : entry) }));
                        setDirty(true);
                      }} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inputFields.map(({ key, label, max }) => (
              <label key={key} className="text-sm">{t(label)}
                <DecimalInput max={max} className={inputClass} value={snapshot.inputs[key]}
                  onChange={(value) => {
                    setSnapshot((current) => ({ ...current, inputs: { ...current.inputs, [key]: value } }));
                    setDirty(true);
                  }} />
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t("orders.laborRate", { rate: money(snapshot.laborRatePerHour) })} · {snapshot.currency}
        </p>
        <dl className="mt-5 flex flex-col gap-2 text-sm">
          {totalFields.map(({ key, label }) => <div key={key} className="flex justify-between gap-3">
            <dt>{t(label)}</dt><dd>{key === "quantityDiscountAmount" ? "−" : ""}{money(result.totals[key])}</dd>
          </div>)}
          <div className="flex justify-between gap-3 border-t border-slate-300 pt-3 text-lg font-bold dark:border-slate-600">
            <dt>{t("cost.totalPrice")}</dt><dd>{money(result.totals.totalPrice)}</dd>
          </div>
        </dl>
        {canEdit && <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" disabled={busy || outdated}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {busy ? t("orders.saving") : t("cost.save")}
          </button>
          <button type="button" disabled={busy} onClick={() => void saveCalculation(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-600">
            {t("orders.refreshCalculation")}
          </button>
        </div>}
      </form>
    </div>
  );
}
