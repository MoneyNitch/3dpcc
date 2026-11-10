"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale } from "@/lib/locale";
import { customerLabel, filterCustomers, type CustomerInput } from "@/lib/customers";
import type { Customer, PrintOrder } from "@/lib/types";
import { HttpWarning } from "./HttpWarning";

const emptyCustomer: CustomerInput = {
  name: "", company: "", email: "", phone: "", billingAddress: "", shippingAddress: "", notes: "", archived: false,
};
const fields = ["name", "company", "email", "phone", "billingAddress", "shippingAddress", "notes"] as const;

function inputFromCustomer(customer: Customer): CustomerInput {
  return {
    name: customer.name, company: customer.company, email: customer.email, phone: customer.phone,
    billingAddress: customer.billingAddress, shippingAddress: customer.shippingAddress, notes: customer.notes, archived: customer.archived,
  };
}

export function CustomerManager({ initialCustomers, orders, canEdit }: {
  initialCustomers: Customer[];
  orders: Pick<PrintOrder, "id" | "customerId" | "status" | "createdAt">[];
  canEdit: boolean;
}) {
  const { t, lang } = useLocale();
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<CustomerInput>(emptyCustomer);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const cardClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800";

  useEffect(() => {
    if (!formOpen || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    element.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [formOpen]);

  function closeModal() {
    if (busy) return;
    setFormOpen(false); setEditing(null); setMessage(null);
  }

  async function persist(input: CustomerInput, customer: Customer | null): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(customer ? `/api/customers/${customer.id}` : "/api/customers", {
        method: customer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, ...(customer ? { expectedUpdatedAt: customer.updatedAt } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(t(body.error ?? "customers.error.save"));
      const saved: Customer = body.customer;
      setCustomers((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
      setMessage({ error: false, text: t("customers.saved") });
      return true;
    } catch (error) {
      console.error("Could not save customer:", error);
      setMessage({ error: true, text: error instanceof Error ? error.message : t("customers.error.save") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await persist(draft, editing)) { setFormOpen(false); setEditing(null); }
  }

  return (
    <div className="flex flex-col gap-5">
      <HttpWarning />
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("customers.snapshotNote")}</p>
      {message && !formOpen && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-green-700 dark:text-green-400"}>{message.text}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm">{t("customers.search")}
          <input className={inputClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />{t("customers.includeArchived")}
        </label>
        {canEdit && <button type="button" disabled={busy} onClick={() => { setDraft(emptyCustomer); setEditing(null); setMessage(null); setFormOpen(true); }}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("customers.create")}</button>}
      </div>
      <dialog ref={dialog} aria-labelledby={dialogTitleId} aria-modal="true"
        onCancel={(event) => { event.preventDefault(); closeModal(); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeModal(); } }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={dialogTitleId} className="min-w-0 break-words text-lg font-semibold">{t(editing ? "customers.edit" : "customers.create")}</h2>
          <button type="button" aria-label={t("customers.cancel")} disabled={busy} onClick={closeModal}
            className="shrink-0 rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700">×</button>
        </div>
        {message && <p role={message.error ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${message.error ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"}`}>{message.text}</p>}
      {formOpen && <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
          {fields.map((field) => <label key={field} className={`text-sm ${["billingAddress", "shippingAddress", "notes"].includes(field) ? "sm:col-span-2" : ""}`}>
            {t(`customers.${field}`)}
            {["billingAddress", "shippingAddress", "notes"].includes(field) ? (
              <textarea className={inputClass} rows={3} maxLength={field === "notes" ? 5000 : 2000} value={draft[field]}
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
            ) : (
              <input className={inputClass} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                required={field === "name"} maxLength={field === "email" ? 254 : field === "phone" ? 100 : 200} value={draft[field]}
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
            )}
          </label>)}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white">{t("customers.save")}</button>
            <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">{t("customers.cancel")}</button>
          </div>
        </fieldset>
      </form>}
      </dialog>
      <div className="grid gap-4 md:grid-cols-2">
        {filterCustomers(customers, search, includeArchived).map((customer) => {
          const linkedOrders = orders.filter((order) => order.customerId === customer.id);
          return <article key={customer.id} className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="break-words text-lg font-semibold">{customerLabel(customer)}</h2>
              {customer.archived && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">{t("customers.archived")}</span>}
            </div>
            <dl className="mt-3 space-y-2 break-words text-sm">
              {fields.filter((field) => !["name", "company"].includes(field) && customer[field]).map((field) => (
                <div key={field}><dt className="text-xs text-slate-500 dark:text-slate-400">{t(`customers.${field}`)}</dt>
                  <dd className="whitespace-pre-wrap">{customer[field]}</dd></div>
              ))}
            </dl>
            <details className="mt-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
              <summary className="cursor-pointer font-medium">{t("customers.orders")} ({linkedOrders.length})</summary>
              <ul className="mt-2 space-y-2">{linkedOrders.map((order) => <li key={order.id}>
                <Link href={`/orders/${order.id}`} className="text-orange-700 hover:underline dark:text-orange-300">
                  {new Date(order.createdAt).toLocaleDateString(lang)} · {t(`orders.status.${order.status}`)} · {order.id.slice(0, 8)}
                </Link>
              </li>)}</ul>
            </details>
            {canEdit && <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => { setEditing(customer); setDraft(inputFromCustomer(customer)); setMessage(null); setFormOpen(true); }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600">{t("customers.edit")}</button>
              <button type="button" disabled={busy} onClick={() => {
                if (window.confirm(t(customer.archived ? "customers.confirmRestore" : "customers.confirmArchive"))) {
                  void persist({ ...inputFromCustomer(customer), archived: !customer.archived }, customer);
                }
              }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600">{t(customer.archived ? "customers.restore" : "customers.archive")}</button>
            </div>}
          </article>;
        })}
      </div>
      {filterCustomers(customers, search, includeArchived).length === 0 && <p className="text-sm text-slate-500">{t("customers.empty")}</p>}
    </div>
  );
}
