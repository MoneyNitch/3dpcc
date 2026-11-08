"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatDocumentNumber } from "@/lib/invoice";
import { localDateKey } from "@/lib/orderFilters";
import { useLocale } from "@/lib/locale";
import type { DocumentNumberingSettings, InvoiceTemplate, PrintOrder } from "@/lib/types";

export function OrderInvoiceExport({ order, templates, numbering, disabled }: {
  order: PrintOrder;
  templates: InvoiceTemplate[];
  numbering: DocumentNumberingSettings;
  disabled: boolean;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [number, setNumber] = useState(() => formatDocumentNumber(numbering));
  const [automaticNumber, setAutomaticNumber] = useState(true);
  const [date, setDate] = useState(() => localDateKey(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerAddress, setCustomerAddress] = useState(() => [
    order.customerSnapshot?.company, order.customerSnapshot?.name ?? order.customerName,
    order.customerSnapshot?.billingAddress,
  ].filter(Boolean).join("\n"));
  const [showDiscount, setShowDiscount] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [document, setDocument] = useState<{ key: string; html: string; number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [print, setPrint] = useState<{ html: string; count: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const details = {
    expectedUpdatedAt: order.updatedAt, templateId, number, automaticNumber, date, dueDate,
    customerName, customerAddress, showQuantityDiscount: showDiscount,
  };
  const key = JSON.stringify(details);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const buttonClass = "rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-600";

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = window.document.body.style.overflow;
    element.showModal();
    window.document.body.style.overflow = "hidden";
    return () => { element.close(); window.document.body.style.overflow = previousOverflow; };
  }, [open]);

  function close() {
    if (!busy) setOpen(false);
  }

  async function generate(action: "preview" | "download" | "print") {
    setBusy(true); setError(null);
    try {
      let generated = document?.key === key && action !== "preview" ? document : null;
      if (!generated) {
        const response = await fetch(`/api/orders/${order.id}/invoice`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...details, preview: action === "preview" }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(t(body.error ?? "orders.invoice.failed"));
        generated = { key, html: body.html, number: body.number };
        if (action !== "preview") setDocument(generated);
      }
      setPreview(generated.html);
      if (action === "download") {
        const url = URL.createObjectURL(new Blob([generated.html], { type: "text/html;charset=utf-8" }));
        const link = window.document.createElement("a");
        link.href = url; link.download = `${generated.number.replace(/[^a-z0-9_-]/gi, "_")}.html`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (action === "print") {
        setPrint((current) => ({ html: generated.html, count: (current?.count ?? 0) + 1 }));
      }
    } catch (error) {
      console.error("Could not export order invoice:", error);
      setError(error instanceof Error ? error.message : t("orders.invoice.failed"));
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" disabled={disabled || !templates.length} onClick={() => { setError(null); setOpen(true); }}
      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("orders.invoice.create")}</button>
    <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">{t("orders.invoice.create")}</h2>
        <button type="button" className={buttonClass} disabled={busy} onClick={close} aria-label={t("modal.close")}>×</button>
      </div>
      <p className="mt-3 text-sm text-slate-500">{t("orders.invoice.help")}</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {open && <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void generate("preview"); }}
        onChange={() => { setPreview(null); setError(null); }}>
        <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-sm">{t("invoice.template")}<select className={inputClass} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select></label>
          <label className="text-sm">{t("invoice.number")}<input required maxLength={100} className={inputClass} value={number}
            onChange={(event) => { setNumber(event.target.value); setAutomaticNumber(false); }} /></label>
          <label className="text-sm">{t("customers.name")}<input required maxLength={500} className={inputClass} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
          <label className="text-sm">{t("invoice.customer")}<textarea rows={4} maxLength={5000} className={inputClass} value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} /></label>
          <label className="text-sm">{t("invoice.date")}<input required type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="text-sm">{t("invoice.dueDate")}<input type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={showDiscount} onChange={(event) => setShowDiscount(event.target.checked)} />{t("invoice.showQuantityDiscount")}</label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className={buttonClass} disabled={disabled || !templateId}>{t(busy ? "invoice.loading" : "invoice.preview")}</button>
            <button type="button" className={buttonClass} disabled={disabled || !templateId} onClick={(event) => { if (event.currentTarget.form?.reportValidity()) void generate("download"); }}>{t("invoice.download")}</button>
            <button type="button" className={buttonClass} disabled={disabled || !templateId} onClick={(event) => { if (event.currentTarget.form?.reportValidity()) void generate("print"); }}>{t("invoice.generate")}</button>
          </div>
        </fieldset>
      </form>}
      {preview && <iframe title={t("invoice.preview")} srcDoc={preview} sandbox="allow-scripts" className="mt-4 h-[60vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-600" />}
    </dialog>
    {print && <iframe key={print.count} title={t("invoice.generate")} srcDoc={print.html} className="fixed bottom-0 left-0 h-px w-px border-0 opacity-0" onLoad={(event) => {
      try {
        const target = event.currentTarget.contentWindow;
        if (!target) throw new Error(t("orders.invoice.failed"));
        target.focus(); target.print();
      } catch (error) {
        console.error("Could not print order invoice:", error);
        setError(t("orders.invoice.failed"));
      }
    }} />}
  </>;
}
