"use client";

import { useState } from "react";
import { calculateAllPlatesCost, calculateCost } from "@/lib/costCalculator";
import { useCostInputs } from "@/lib/costInputsContext";
import { formatDuration } from "@/lib/format";
import { allocateInvoiceAmounts, formatDocumentNumber, renderInvoiceHtml } from "@/lib/invoice";
import { getIntlLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/locale";
import type { AppSettings, ParsedPrint } from "@/lib/types";
import { Modal } from "./Modal";
import { usePlateSelection } from "@/lib/plateSelectionContext";

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
  const { plates, plate: selectedPlate, allSelected } = usePlateSelection();
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
  const [showQuantityDiscount, setShowQuantityDiscount] = useState(true);

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

    const quantity = inputs.quantity || 1;
    const includeAllPlates = allSelected && plates.length > 1;
    const documentPlates = includeAllPlates ? plates : [selectedPlate ?? print.plate];
    const result = includeAllPlates
      ? calculateAllPlatesCost(documentPlates, settings, inputs)
      : calculateCost(documentPlates[0], settings, inputs);
    const positionItems = plates.length > 1
      ? (() => {
          if (!includeAllPlates) {
            return [{
              name: selectedPlate.plateName ?? t("print.plateNumber", {
                number: selectedPlate.plateIndex ?? plates.indexOf(selectedPlate) + 1,
              }),
              quantity,
              unitPrice: result.totalPrice / quantity,
              amount: result.totalPrice,
            }];
          }

          const perPlateInputs = {
            ...inputs,
            energyKwhOverride: null,
            laborMinutes: 0,
            packagingCost: 0,
            extraCosts: [],
            quantity: 1,
          };
          const plateBaseCosts = documentPlates.map((item) =>
            calculateCost(item, settings, perPlateInputs).subtotal
          );
          const allocatedAmounts = allocateInvoiceAmounts(result.totalPrice, plateBaseCosts);
          return documentPlates.map((item, index) => ({
            name: item.plateName ?? t("print.plateNumber", {
              number: item.plateIndex ?? index + 1,
            }),
            quantity,
            unitPrice: allocatedAmounts[index] / quantity,
            amount: allocatedAmounts[index],
          }));
        })()
      : undefined;
    const documentWeight = documentPlates.reduce((sum, item) => sum + item.totalWeightGrams, 0);
    const documentTime = documentPlates.reduce((sum, item) => sum + item.totalPrintTimeSeconds, 0);
    const locale = getIntlLocale(lang);
    const asDate = (value: string) => (value ? new Date(value).toLocaleDateString(locale) : "");

    const values: Record<string, string> = {
      ...template.customValues,
      companyName: settings.general.companyName || template.customValues?.companyName || "",
      companyAddress: settings.general.companyAddress || template.customValues?.companyAddress || "",
      companyEmail: settings.general.companyEmail || template.customValues?.companyEmail || "",
      companyPhone: settings.general.companyPhone || template.customValues?.companyPhone || "",
      companyTaxId: settings.general.companyTaxId || template.customValues?.companyTaxId || "",
      companyIban: settings.general.companyIban || template.customValues?.companyIban || "",
      customerName: customer.split("\n")[0] ?? "",
      customerAddress: customer,
      invoiceNumber: number,
      invoiceDate: asDate(date),
      dueDate: asDate(dueDate),
      printName: includeAllPlates
        ? print.displayName ?? print.fileName
        : `${print.displayName ?? print.fileName} — ${documentPlates[0].plateName ?? t("print.plateNumber", {
            number: documentPlates[0].plateIndex ?? 1,
          })}`,
      printWeight: `${documentWeight.toFixed(1)} g`,
      printTime: formatDuration(documentTime),
      quantity: String(quantity),
      subtotal: money(result.subtotal),
      margin: money(result.marginAmount),
      tax: money(result.vatAmount),
      vatPercent: String(inputs.vatPercent),
      total: money(result.totalPrice),
      paymentTerms: template.customValues?.paymentTerms ?? "",
    };

    return renderInvoiceHtml({
      template,
      values,
      result,
      money,
      title: `${t(`${prefix}.documentTitle`)} ${number}`,
      autoPrint,
      positionItems,
      showQuantityDiscount,
      quantityDiscountLabel: t("cost.quantityDiscount"),
      positionLabels: {
        item: t("invoice.positionItem"),
        quantity: t("invoice.positionQuantity"),
        unitPrice: t("invoice.positionUnitPrice"),
        total: t("invoice.positionTotal"),
      },
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

            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showQuantityDiscount}
                onChange={(event) => setShowQuantityDiscount(event.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              {t("invoice.showQuantityDiscount")}
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
