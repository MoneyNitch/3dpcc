"use client";

import { useMemo, useState } from "react";
import { randomUUID } from "@/lib/clientId";
import {
  DEFAULT_TAX_LABEL,
  INVOICE_COST_LINES,
  INVOICE_VARIABLES,
  renderInvoiceHtml,
  sampleInvoiceResult,
  sampleInvoiceValues,
} from "@/lib/invoice";
import { useLocale } from "@/lib/locale";
import type {
  AppSettings,
  InvoiceBlock,
  InvoiceBlockType,
  InvoiceCostLine,
  InvoiceTemplate,
} from "@/lib/types";
import { Modal } from "./Modal";

const NEW_BLOCK = "application/x-invoice-new-block";
const MOVE_BLOCK = "application/x-invoice-move-block";
const VARIABLE = "application/x-invoice-variable";

type PaletteItem = { type: InvoiceBlockType; labelKey: Parameters<ReturnType<typeof useLocale>["t"]>[0]; content?: string };

const palette: PaletteItem[] = [
  { type: "text", labelKey: "invoice.blockText", content: "Neuer Text" },
  { type: "variables", labelKey: "invoice.blockVariables", content: "{{customerName}}\n{{customerAddress}}" },
  { type: "lineItems", labelKey: "invoice.blockLineItems" },
  { type: "totals", labelKey: "invoice.blockTotals" },
  { type: "spacer", labelKey: "invoice.blockSpacer" },
];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export function InvoiceTemplateBuilder({ initialSettings }: { initialSettings: AppSettings }) {
  const { t } = useLocale();
  const [settings, setSettings] = useState(initialSettings);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialSettings.invoiceTemplates[0]?.id ?? ""
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  const template =
    settings.invoiceTemplates.find((item) => item.id === selectedTemplateId) ??
    settings.invoiceTemplates[0];

  const previewHtml = useMemo(() => {
    if (!template) return "";
    return renderInvoiceHtml({
      template,
      values: { ...sampleInvoiceValues(), ...template.customValues },
      result: sampleInvoiceResult,
      money: (value) => `${value.toFixed(2).replace(".", ",")} €`,
      paper: false,
    });
  }, [template]);

  function updateTemplate(patch: Partial<InvoiceTemplate>) {
    if (!template) return;
    setSettings((current) => ({
      ...current,
      invoiceTemplates: current.invoiceTemplates.map((item) =>
        item.id === template.id ? { ...item, ...patch } : item
      ),
    }));
    setSaved(false);
  }

  function addTemplate() {
    const id = randomUUID();
    setSettings((current) => ({
      ...current,
      invoiceTemplates: [
        ...current.invoiceTemplates,
        {
          id,
          name: `${t("invoice.template")} ${current.invoiceTemplates.length + 1}`,
          logoUrl: "",
          header: "{{companyName}}\n{{companyAddress}}",
          footer: "{{paymentTerms}}",
          customValues: {},
          blocks: [
            { id: randomUUID(), type: "variables", content: "{{customerName}}\n{{customerAddress}}" },
            { id: randomUUID(), type: "text", content: "Rechnung {{invoiceNumber}} vom {{invoiceDate}}" },
            { id: randomUUID(), type: "lineItems" },
            { id: randomUUID(), type: "totals" },
          ],
        },
      ],
    }));
    setSelectedTemplateId(id);
    setSaved(false);
  }

  function removeTemplate() {
    if (!template || settings.invoiceTemplates.length <= 1) return;
    const remaining = settings.invoiceTemplates.filter((item) => item.id !== template.id);
    setSettings((current) => ({ ...current, invoiceTemplates: remaining }));
    setSelectedTemplateId(remaining[0].id);
    setSaved(false);
  }

  function addBlock(type: InvoiceBlockType, beforeId?: string) {
    if (!template) return;
    const definition = palette.find((item) => item.type === type);
    if (!definition) return;
    const block: InvoiceBlock = { id: randomUUID(), type, content: definition.content };
    const blocks = [...template.blocks];
    const index = beforeId ? blocks.findIndex((item) => item.id === beforeId) : -1;
    if (index >= 0) blocks.splice(index, 0, block);
    else blocks.push(block);
    updateTemplate({ blocks });
    setSelectedBlockId(block.id);
  }

  function updateBlock(id: string, patch: Partial<InvoiceBlock>) {
    if (!template) return;
    updateTemplate({
      blocks: template.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    });
  }

  function removeBlock(id: string) {
    if (!template) return;
    updateTemplate({ blocks: template.blocks.filter((block) => block.id !== id) });
  }

  function moveBlock(sourceId: string, beforeId?: string) {
    if (!template || sourceId === beforeId) return;
    const blocks = [...template.blocks];
    const from = blocks.findIndex((block) => block.id === sourceId);
    if (from < 0) return;
    const [moved] = blocks.splice(from, 1);
    const to = beforeId ? blocks.findIndex((block) => block.id === beforeId) : -1;
    if (to >= 0) blocks.splice(to, 0, moved);
    else blocks.push(moved);
    updateTemplate({ blocks });
  }

  function insertVariable(variable: string, blockId?: string) {
    if (!template) return;
    const targetId = blockId ?? selectedBlockId;
    const target = template.blocks.find((block) => block.id === targetId);
    if (!target || (target.type !== "text" && target.type !== "variables")) return;
    updateBlock(target.id, { content: `${target.content ?? ""}${variable}` });
  }

  function handleCanvasDrop(event: React.DragEvent, beforeId?: string) {
    event.preventDefault();
    setDropTargetId(null);
    const newType = event.dataTransfer.getData(NEW_BLOCK) as InvoiceBlockType;
    if (newType) {
      addBlock(newType, beforeId);
      return;
    }
    const moveId = event.dataTransfer.getData(MOVE_BLOCK);
    if (moveId) moveBlock(moveId, beforeId);
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
    <div className="grid gap-5 xl:grid-cols-[210px_minmax(0,1fr)_290px]">
      <aside className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t("invoice.blocks")}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("invoice.dragHint")}</p>
          <div className="mt-3 grid gap-2">
            {palette.map((item) => (
              <button
                key={item.type}
                type="button"
                draggable
                onDragStart={(event) => event.dataTransfer.setData(NEW_BLOCK, item.type)}
                onClick={() => addBlock(item.type)}
                className="cursor-grab rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 hover:border-orange-400 hover:bg-orange-50 dark:border-slate-600 dark:text-slate-200 dark:hover:border-orange-500 dark:hover:bg-orange-950/30"
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t("invoice.variables")}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("invoice.variablesHint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {[...INVOICE_VARIABLES, ...Object.keys(template.customValues ?? {})]
              .filter((name, index, all) => all.indexOf(name) === index)
              .map((name) => (
                <button
                  key={name}
                  type="button"
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData(VARIABLE, `{{${name}}}`)}
                  onClick={() => insertVariable(`{{${name}}}`)}
                  className="cursor-grab rounded border border-slate-200 bg-slate-50 px-1.5 py-1 font-mono text-[11px] text-slate-600 hover:border-orange-400 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  {`{{${name}}}`}
                </button>
              ))}
          </div>
        </div>
      </aside>

      <main
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleCanvasDrop(event)}
        className="min-h-[600px] rounded-xl border border-slate-300 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5 dark:border-slate-700">
          <div className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
            {template.header || t("invoice.header")}
          </div>
          {template.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={template.logoUrl} alt="Logo" className="max-h-20 max-w-40 object-contain" />
          ) : (
            <div className="flex h-16 w-28 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600">
              {t("invoice.logo")}
            </div>
          )}
        </div>

        <h2 className="mt-6 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t("invoice.documentTitle")}
        </h2>

        <div className="mt-4 flex flex-col gap-2">
          {template.blocks.map((block) => (
            <div
              key={block.id}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTargetId(block.id);
              }}
              onDragLeave={() => setDropTargetId((current) => (current === block.id ? null : current))}
              onDrop={(event) => {
                event.stopPropagation();
                handleCanvasDrop(event, block.id);
              }}
              className={dropTargetId === block.id ? "border-t-2 border-orange-500 pt-1" : "pt-1"}
            >
              <BlockEditor
                block={block}
                selected={selectedBlockId === block.id}
                onSelect={() => setSelectedBlockId(block.id)}
                onUpdate={(patch) => updateBlock(block.id, patch)}
                onRemove={() => removeBlock(block.id)}
                onVariableDrop={(variable) => insertVariable(variable, block.id)}
              />
            </div>
          ))}

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleCanvasDrop(event)}
            className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500"
          >
            {t("invoice.dropHere")}
          </div>
        </div>

        <div className="mt-8 whitespace-pre-line border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {template.footer || t("invoice.footer")}
        </div>
      </main>

      <aside className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t("invoice.template")}
          </h2>
          <button
            type="button"
            onClick={addTemplate}
            className="text-sm font-medium text-orange-600 hover:underline dark:text-orange-400"
          >
            {t("invoice.addTemplate")}
          </button>
        </div>

        <select
          value={template.id}
          onChange={(event) => setSelectedTemplateId(event.target.value)}
          className={inputClass}
        >
          {settings.invoiceTemplates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <Field label={t("invoice.templateName")}>
          <input
            value={template.name}
            onChange={(event) => updateTemplate({ name: event.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label={t("invoice.logoUrl")}>
          <input
            value={template.logoUrl}
            onChange={(event) => updateTemplate({ logoUrl: event.target.value })}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>

        <Field label={t("invoice.header")}>
          <textarea
            rows={4}
            value={template.header}
            onChange={(event) => updateTemplate({ header: event.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label={t("invoice.footer")}>
          <textarea
            rows={4}
            value={template.footer}
            onChange={(event) => updateTemplate({ footer: event.target.value })}
            className={inputClass}
          />
        </Field>

        <CustomValues
          values={template.customValues ?? {}}
          onChange={(customValues) => updateTemplate({ customValues })}
        />

        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="mt-2 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
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
        <button
          type="button"
          onClick={removeTemplate}
          disabled={settings.invoiceTemplates.length <= 1}
          className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
        >
          {t("invoice.deleteTemplate")}
        </button>
      </aside>

      {showPreview && (
        <Modal title={t("invoice.preview")} onClose={() => setShowPreview(false)}>
          <iframe
            title={t("invoice.preview")}
            srcDoc={previewHtml}
            className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
          />
        </Modal>
      )}
    </div>
  );
}

function BlockEditor({
  block,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onVariableDrop,
}: {
  block: InvoiceBlock;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<InvoiceBlock>) => void;
  onRemove: () => void;
  onVariableDrop: (variable: string) => void;
}) {
  const { t } = useLocale();
  const editable = block.type === "text" || block.type === "variables";
  const labelKey: Record<InvoiceBlockType, Parameters<typeof t>[0]> = {
    text: "invoice.blockText",
    variables: "invoice.blockVariables",
    lineItems: "invoice.blockLineItems",
    totals: "invoice.blockTotals",
    spacer: "invoice.blockSpacer",
  };

  return (
    <div
      draggable
      onDragStart={(event) => event.dataTransfer.setData(MOVE_BLOCK, block.id)}
      onClick={onSelect}
      className={`group rounded-lg border p-3 ${
        selected
          ? "border-orange-400 bg-orange-50/40 dark:border-orange-500 dark:bg-orange-950/20"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
        <span className="cursor-grab">⠿ {t(labelKey[block.type])}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-500 opacity-0 group-hover:opacity-100 dark:text-red-400"
        >
          {t("invoice.deleteBlock")}
        </button>
      </div>

      {editable && (
        <textarea
          rows={block.type === "variables" ? 3 : 4}
          value={block.content ?? ""}
          onChange={(event) => onUpdate({ content: event.target.value })}
          onDrop={(event) => {
            const variable = event.dataTransfer.getData(VARIABLE);
            if (!variable) return;
            event.preventDefault();
            onVariableDrop(variable);
          }}
          className={`${inputClass} resize-y font-mono`}
        />
      )}

      {block.type === "spacer" && (
        <div className="h-8 rounded border border-dashed border-slate-200 dark:border-slate-700" />
      )}

      {block.type === "lineItems" && <LineItemOptions block={block} onUpdate={onUpdate} />}

      {block.type === "totals" && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          {t("invoice.taxLabel")}
          <input
            value={block.lineLabels?.tax ?? DEFAULT_TAX_LABEL}
            onChange={(event) =>
              onUpdate({ lineLabels: { ...block.lineLabels, tax: event.target.value } })
            }
            className={`mt-1 ${inputClass}`}
          />
        </label>
      )}
    </div>
  );
}

function LineItemOptions({
  block,
  onUpdate,
}: {
  block: InvoiceBlock;
  onUpdate: (patch: Partial<InvoiceBlock>) => void;
}) {
  const { t } = useLocale();
  const hidden = block.hiddenLines ?? [];
  const distributions: Partial<Record<InvoiceCostLine, InvoiceCostLine[]>> = {
    ...(block.distributeMargin
      ? { margin: block.marginTargets ?? INVOICE_COST_LINES.map((line) => line.id) }
      : {}),
    ...block.distributionTargets,
  };

  function toggleVisible(line: InvoiceCostLine) {
    onUpdate({
      hiddenLines: hidden.includes(line) ? hidden.filter((item) => item !== line) : [...hidden, line],
    });
  }

  function toggleDistribution(source: InvoiceCostLine) {
    const next = { ...distributions };
    if (next[source]) {
      delete next[source];
      onUpdate({
        distributionTargets: next,
        distributeMargin: source === "margin" ? false : block.distributeMargin,
        hiddenLines: hidden.filter((line) => line !== source),
      });
      return;
    }
    next[source] = INVOICE_COST_LINES.filter((line) => line.id !== source).map((line) => line.id);
    onUpdate({
      distributionTargets: next,
      hiddenLines: Array.from(new Set<InvoiceCostLine>([...hidden, source])),
    });
  }

  function toggleTarget(source: InvoiceCostLine, target: InvoiceCostLine) {
    const targets = distributions[source] ?? [];
    if (targets.includes(target) && targets.length === 1) return;
    onUpdate({
      distributionTargets: {
        ...distributions,
        [source]: targets.includes(target)
          ? targets.filter((line) => line !== target)
          : [...targets, target],
      },
    });
  }

  return (
    <div className="space-y-3 text-xs">
      {INVOICE_COST_LINES.map((line) => (
        <div key={line.id} className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-700">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
            <input
              type="checkbox"
              checked={!hidden.includes(line.id)}
              onChange={() => toggleVisible(line.id)}
              aria-label={line.label}
            />
            <input
              value={block.lineLabels?.[line.id] ?? line.label}
              onChange={(event) =>
                onUpdate({ lineLabels: { ...block.lineLabels, [line.id]: event.target.value } })
              }
              className={inputClass}
            />
          </div>
          <label className="mt-1.5 flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!!distributions[line.id]}
              onChange={() => toggleDistribution(line.id)}
            />
            {t("invoice.distribute")}
          </label>
          {distributions[line.id] && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 pl-5">
              {INVOICE_COST_LINES.filter((target) => target.id !== line.id).map((target) => (
                <label
                  key={target.id}
                  className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={distributions[line.id]?.includes(target.id) ?? false}
                    onChange={() => toggleTarget(line.id, target.id)}
                  />
                  {block.lineLabels?.[target.id] ?? target.label}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CustomValues({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("");

  function addValue() {
    const key = name.trim().replace(/\W/g, "");
    if (!key) return;
    onChange({ ...values, [key]: "" });
    setName("");
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {t("invoice.customValues")}
      </h3>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        {t("invoice.customValuesHint")}
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="flex items-center gap-1.5">
            <code className="w-28 shrink-0 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {`{{${key}}}`}
            </code>
            <input
              value={value}
              onChange={(event) => onChange({ ...values, [key]: event.target.value })}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...values };
                delete next[key];
                onChange(next);
              }}
              className="text-xs text-red-500 hover:underline dark:text-red-400"
              aria-label={`${t("invoice.deleteBlock")}: ${key}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && addValue()}
          placeholder={t("invoice.customValueName")}
          className={inputClass}
        />
        <button
          type="button"
          onClick={addValue}
          className="shrink-0 rounded-lg border border-slate-300 px-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
