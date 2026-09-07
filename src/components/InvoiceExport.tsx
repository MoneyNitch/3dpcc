"use client";

import { useState } from "react";
import { calculateCost } from "@/lib/costCalculator";
import { useCostInputs } from "@/lib/costInputsContext";
import { formatDuration } from "@/lib/format";
import { formatDocumentNumber, renderInvoiceHtml } from "@/lib/invoice";
import { useLocale } from "@/lib/locale";
import type { AppSettings, ParsedPrint } from "@/lib/types";
import { Modal } from "./Modal";

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

/** Renders the export dialog for either invoices or quotes, since both share the same designer/template shape. */
export function InvoiceExport({
  print,
  settings,
  kind = "invoice",
}: {
  print: ParsedPrint;
  settings: AppSettings;
  kind?: "invoice" | "quote";
}) {
  const { inputs } = useCostInputs();
  const { t, money, lang } = useLocale();
  const templates = kind === "quote" ? settings.quoteTemplates : settings.invoiceTemplates;
  const prefix = kind === "quote" ? "quote" : "invoice";
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [number, setNumber] = useState(() => formatDocumentNumber(settings.numbering[kind]));
  const [numberTouched, setNumberTouched] = useState(false);
  const [customer, setCustomer] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");

  // Advances the shared counter in Settings so the next document suggests the following number.
  async function bumpNumberingCounter() {
    const res = await fetch("/api/settings");
    const body = await res.json();
    const latest = body.settings as AppSettings;
    const current = latest.numbering[kind];
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...latest,
        numbering: { ...latest.numbering, [kind]: { ...current, nextNumber: current.nextNumber + 1 } },
      }),
    });
  }

  async function buildDocument(autoPrint = false): Promise<string | null> {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return null;

    const result = calculateCost(print.plate, settings, inputs);
    const locale = lang === "en" ? "en-US" : "de-DE";
    const asDate = (value: string) => (value ? new Date(value).toLocaleDateString(locale) : "");

    const values: Record<string, string> = {
      ...template.customValues,
      customerName: customer.split("\n")[0] ?? "",
      customerAddress: customer,
      invoiceNumber: number,
      invoiceDate: asDate(date),
      dueDate: asDate(dueDate),
      printName: print.displayName ?? print.fileName,
      printWeight: `${print.plate.totalWeightGrams.toFixed(1)} g`,
      printTime: formatDuration(print.plate.totalPrintTimeSeconds),
      quantity: String(inputs.quantity),
      subtotal: money(result.subtotal),
      margin: money(result.marginAmount),
      tax: money(result.vatAmount),
      vatPercent: String(inputs.vatPercent),
      total: money(result.totalPrice),
    };

    return renderInvoiceHtml({
      template,
      values,
      result,
      money,
      title: `${t(`${prefix}.documentTitle`)} ${number}`,
      autoPrint,
    });
  }

  async function openPrintView() {
    const html = await buildDocument(true);
    if (!html) return;
    if (!numberTouched) await bumpNumberingCounter();
    // window.open with noopener returns null, so the document is served from a blob URL instead.
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const popup = window.open(url, "_blank");
    if (!popup) {
      URL.revokeObjectURL(url);
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setOpen(false);
  }

  async function download() {
    const html = await buildDocument();
    if (!html) return;
    if (!numberTouched) await bumpNumberingCounter();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${number.replace(/[^a-z0-9_-]/gi, "_") || t(`${prefix}.documentTitle`)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
      >
        {t(`${prefix}.export`)}
      </button>

      {open && (
        <Modal title={t(`${prefix}.export`)} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("invoice.template")}
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className={fieldClass}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t(`${prefix}.number`)}
              <input
                value={number}
                onChange={(event) => {
                  setNumber(event.target.value);
                  setNumberTouched(true);
                }}
                className={fieldClass}
              />
            </label>

            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("invoice.customer")}
              <textarea
                rows={4}
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder={t("invoice.customerPlaceholder")}
                className={fieldClass}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {t(`${prefix}.date`)}
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {t(`${prefix}.dueDate`)}
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={download}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("invoice.download")}
              </button>
              <button
                type="button"
                onClick={openPrintView}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                {t("invoice.generate")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
