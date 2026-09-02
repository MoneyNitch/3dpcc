"use client";

import { useState } from "react";
import { calculateCost } from "@/lib/costCalculator";
import { useCostInputs } from "@/lib/costInputsContext";
import { useLocale } from "@/lib/locale";
import type { AppSettings, ParsedPrint } from "@/lib/types";
import { Modal } from "./Modal";

export function InvoiceExport({ print, settings }: { print: ParsedPrint; settings: AppSettings }) {
  const { inputs } = useCostInputs();
  const { t, money } = useLocale();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");

  function download() {
    const result = calculateCost(print.plate, settings, inputs);
    const name = print.displayName ?? print.fileName;
    const html = `<html><body><h1>Invoice</h1><p><strong>Print:</strong> ${escapeHtml(name)}</p><p><strong>Customer:</strong> ${escapeHtml(customer)}</p><p><strong>Total:</strong> ${money(result.totalPrice)}</p></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${print.id}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-3 w-full border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600">{t("invoice.export")}</button>
    {open && <Modal title={t("invoice.export")} onClose={() => setOpen(false)}><div className="flex flex-col gap-3"><label className="text-sm">{t("invoice.customer")}<textarea rows={4} value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder={t("invoice.customerPlaceholder")} className="mt-1 w-full border px-3 py-2 dark:bg-slate-900" /></label><button type="button" onClick={download} className="bg-orange-500 px-4 py-2 font-medium text-white">{t("invoice.download")}</button></div></Modal>}
  </>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
