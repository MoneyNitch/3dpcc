"use client";

import { useEffect, useState } from "react";
import { randomUUID } from "@/lib/clientId";
import { renderInvoiceHtml, sampleInvoiceResult, sampleInvoiceValues } from "@/lib/invoice";
import { useLocale } from "@/lib/locale";
import type { AppSettings, InvoiceTemplate } from "@/lib/types";
import { InvoiceDesigner } from "./InvoiceDesigner";
import { Modal } from "./Modal";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

function newTemplate(index: number, introText: string): InvoiceTemplate {
  return {
    id: randomUUID(),
    name: `Vorlage ${index}`,
    paperFormat: "A4",
    orientation: "portrait",
    elements: [
      { id: randomUUID(), type: "text", x: 20, y: 15, width: 100, height: 25, content: "{{companyName}}\n{{companyAddress}}", fontSize: 11, align: "left" },
      { id: randomUUID(), type: "variables", x: 20, y: 50, width: 90, height: 25, content: "{{customerName}}\n{{customerAddress}}", fontSize: 11, align: "left" },
      { id: randomUUID(), type: "variables", x: 130, y: 50, width: 60, height: 25, content: `${introText} {{invoiceNumber}}\n{{invoiceDate}}`, fontSize: 11, align: "left" },
      { id: randomUUID(), type: "lineItems", x: 20, y: 90, width: 170, height: 100 },
      { id: randomUUID(), type: "totals", x: 110, y: 195, width: 80, height: 45 },
      { id: randomUUID(), type: "text", x: 20, y: 270, width: 170, height: 15, content: "Vielen Dank für Ihren Auftrag.", fontSize: 9, align: "left" },
    ],
  };
}

/** Template list + free-form designer, shared by the invoices and quotes pages. */
export function InvoiceTemplateBuilder({
  initialSettings,
  templatesKey = "invoiceTemplates",
  documentTitle,
}: {
  initialSettings: AppSettings;
  /** Which settings collection this builder edits. */
  templatesKey?: "invoiceTemplates" | "quoteTemplates";
  /** Word used inside the default template's intro text, e.g. "Rechnung" or "Angebot". */
  documentTitle?: string;
}) {
  const { t } = useLocale();
  const [settings, setSettings] = useState(initialSettings);
  const templates = settings[templatesKey];
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [saved, setSaved] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const template = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];

  useEffect(() => {
    if (!previewOpen || !template) return;
    let cancelled = false;
    renderInvoiceHtml({
      template,
      values: { ...sampleInvoiceValues(), ...template.customValues },
      result: sampleInvoiceResult,
      money: (value) => `${value.toFixed(2).replace(".", ",")} €`,
    }).then((html) => {
      if (!cancelled) setPreviewHtml(html);
    });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, template]);

  function updateTemplate(patch: Partial<InvoiceTemplate>) {
    if (!template) return;
    setSettings((current) => ({
      ...current,
      [templatesKey]: current[templatesKey].map((item) =>
        item.id === template.id ? { ...item, ...patch } : item
      ),
    }));
    setSaved(false);
  }

  function addTemplate() {
    const created = newTemplate(templates.length + 1, documentTitle ?? "Rechnung");
    setSettings((current) => ({
      ...current,
      [templatesKey]: [...current[templatesKey], created],
    }));
    setSelectedTemplateId(created.id);
    setSaved(false);
  }

  function removeTemplate() {
    if (!template || templates.length <= 1) return;
    const remaining = templates.filter((item) => item.id !== template.id);
    setSettings((current) => ({ ...current, [templatesKey]: remaining }));
    setSelectedTemplateId(remaining[0].id);
    setSaved(false);
  }

  async function save() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, setupCompleted: true }),
    });
    setSaved(true);
  }

  if (!template) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <select
          value={template.id}
          onChange={(event) => setSelectedTemplateId(event.target.value)}
          className={`max-w-xs ${inputClass}`}
        >
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          value={template.name}
          onChange={(event) => updateTemplate({ name: event.target.value })}
          className={`max-w-xs ${inputClass}`}
        />
        <button
          type="button"
          onClick={addTemplate}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {t("invoice.addTemplate")}
        </button>
        <button
          type="button"
          onClick={removeTemplate}
          disabled={templates.length <= 1}
          className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
        >
          {t("invoice.deleteTemplate")}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
          >
            {t("invoice.preview")}
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            {saved ? t("settings.saved") : t("settings.save")}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <InvoiceDesigner template={template} onChange={updateTemplate} />
      </div>

      {previewOpen && (
        <Modal title={t("invoice.preview")} onClose={() => setPreviewOpen(false)} wide>
          {previewHtml === null ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{t("invoice.loading")}</p>
          ) : (
            <iframe
              title={t("invoice.preview")}
              srcDoc={previewHtml}
              className="h-[85vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
            />
          )}
        </Modal>
      )}
    </div>
  );
}
