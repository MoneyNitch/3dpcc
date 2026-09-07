"use client";

import { useEffect, useRef, useState } from "react";
import { randomUUID } from "@/lib/clientId";
import {
  buildInvoiceLines,
  fillVariables,
  INVOICE_COST_LINES,
  INVOICE_VARIABLES,
  PAPER_SIZES_MM,
  pageSizeMm,
  sampleInvoiceResult,
  sampleInvoiceValues,
} from "@/lib/invoice";
import { useLocale } from "@/lib/locale";
import type {
  InvoiceCostLine,
  InvoiceElement,
  InvoiceElementType,
  InvoiceTemplate,
  PaperFormat,
  PaperOrientation,
} from "@/lib/types";
import { QrCodePreview } from "./QrCodePreview";

/** Pixels per millimeter used to render the paper sheet on screen. */
const SCALE = 2.9;
const MIN_SIZE_MM = 8;

type DragMode = "move" | "resize";
interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

const NEW_ELEMENT_DEFAULTS: Record<InvoiceElementType, { width: number; height: number }> = {
  text: { width: 80, height: 20 },
  variables: { width: 80, height: 20 },
  image: { width: 40, height: 25 },
  qrcode: { width: 20, height: 20 },
  lineItems: { width: 170, height: 90 },
  totals: { width: 80, height: 45 },
};

export function InvoiceDesigner({
  template,
  onChange,
}: {
  template: InvoiceTemplate;
  onChange: (patch: Partial<InvoiceTemplate>) => void;
}) {
  const { t, money } = useLocale();
  const [loadedTemplateId, setLoadedTemplateId] = useState(template.id);
  const [elements, setElements] = useState<InvoiceElement[]>(template.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  // Reset the local canvas state when a different template is selected (React's
  // recommended pattern for adjusting state on prop change, instead of an effect).
  if (template.id !== loadedTemplateId) {
    setLoadedTemplateId(template.id);
    setElements(template.elements);
    setSelectedId(null);
  }

  const size = pageSizeMm(template.paperFormat, template.orientation);
  const pageWidthPx = size.width * SCALE;
  const pageHeightPx = size.height * SCALE;
  const selected = elements.find((element) => element.id === selectedId) ?? null;

  function commit(nextElements: InvoiceElement[]) {
    setElements(nextElements);
    onChange({ elements: nextElements });
  }

  function updateElement(id: string, patch: Partial<InvoiceElement>) {
    commit(elements.map((element) => (element.id === id ? { ...element, ...patch } : element)));
  }

  function addElement(type: InvoiceElementType) {
    const defaults = NEW_ELEMENT_DEFAULTS[type];
    const id = randomUUID();
    const offset = (elements.length % 5) * 6;
    const element: InvoiceElement = {
      id,
      type,
      x: Math.min(15 + offset, size.width - defaults.width),
      y: Math.min(15 + offset, size.height - defaults.height),
      width: defaults.width,
      height: defaults.height,
      content: type === "text" || type === "variables" ? t("invoice.newFieldText") : type === "qrcode" ? "{{invoiceNumber}}" : undefined,
      fontSize: 11,
      align: "left",
    };
    commit([...elements, element]);
    setSelectedId(id);
  }

  function removeElement(id: string) {
    commit(elements.filter((element) => element.id !== id));
    setSelectedId(null);
  }

  function startDrag(event: React.MouseEvent, element: InvoiceElement, mode: DragMode) {
    if (previewMode) return;
    event.stopPropagation();
    setSelectedId(element.id);
    dragRef.current = {
      id: element.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
      startW: element.width,
      startH: element.height,
    };
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
  }

  function handleDragMove(event: MouseEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaXMm = (event.clientX - drag.startClientX) / SCALE;
    const deltaYMm = (event.clientY - drag.startClientY) / SCALE;
    setElements((current) =>
      current.map((element) => {
        if (element.id !== drag.id) return element;
        if (drag.mode === "move") {
          const x = clamp(drag.startX + deltaXMm, 0, size.width - element.width);
          const y = clamp(drag.startY + deltaYMm, 0, size.height - element.height);
          return { ...element, x, y };
        }
        // QR codes must stay square, otherwise the code would be squeezed inside its box.
        if (element.type === "qrcode") {
          const delta = Math.abs(deltaXMm) > Math.abs(deltaYMm) ? deltaXMm : deltaYMm;
          const edge = clamp(drag.startW + delta, MIN_SIZE_MM, Math.min(size.width - element.x, size.height - element.y));
          return { ...element, width: edge, height: edge };
        }
        const width = clamp(drag.startW + deltaXMm, MIN_SIZE_MM, size.width - element.x);
        const height = clamp(drag.startH + deltaYMm, MIN_SIZE_MM, size.height - element.y);
        return { ...element, width, height };
      })
    );
  }

  function handleDragEnd() {
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    dragRef.current = null;
    onChange({ elements: elementsRef.current });
  }

  function handleImageUpload(id: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateElement(id, { content: reader.result });
    };
    reader.readAsDataURL(file);
  }

  // Inserts into the selected text/variables field when possible, otherwise copies to the clipboard.
  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (selected && (selected.type === "text" || selected.type === "variables")) {
      updateElement(selected.id, { content: `${selected.content ?? ""}${token}` });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(token).then(() => {
        setCopiedVariable(name);
        window.setTimeout(() => setCopiedVariable((current) => (current === name ? null : current)), 1500);
      });
    }
  }

  const previewValues = previewMode ? sampleInvoiceValues() : {};

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarButton onClick={() => addElement("text")}>{t("invoice.addText")}</ToolbarButton>
        <ToolbarButton onClick={() => addElement("image")}>{t("invoice.addImage")}</ToolbarButton>
        <ToolbarButton onClick={() => addElement("qrcode")}>{t("invoice.addQrCode")}</ToolbarButton>
        <ToolbarButton onClick={() => addElement("lineItems")}>{t("invoice.blockLineItems")}</ToolbarButton>
        <ToolbarButton onClick={() => addElement("totals")}>{t("invoice.blockTotals")}</ToolbarButton>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={template.paperFormat}
            onChange={(e) => onChange({ paperFormat: e.target.value as PaperFormat })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {Object.keys(PAPER_SIZES_MM).map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
          <select
            value={template.orientation}
            onChange={(e) => onChange({ orientation: e.target.value as PaperOrientation })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="portrait">{t("invoice.portrait")}</option>
            <option value="landscape">{t("invoice.landscape")}</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setPreviewMode((v) => !v);
              setSelectedId(null);
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              previewMode
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {previewMode ? t("invoice.backToEditor") : t("invoice.loadSamplePreview")}
          </button>
          {!previewMode && (
            <VariablesInfo
              customKeys={Object.keys(template.customValues ?? {})}
              copiedVariable={copiedVariable}
              onInsert={insertVariable}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div
          className="relative shrink-0 overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-sm dark:border-slate-600"
          style={{ width: pageWidthPx, height: pageHeightPx }}
          onMouseDown={() => setSelectedId(null)}
        >
          {elements.map((element) => (
            <ElementView
              key={element.id}
              element={element}
              scale={SCALE}
              selected={!previewMode && element.id === selectedId}
              previewMode={previewMode}
              previewValues={previewValues}
              onMouseDownMove={(e) => startDrag(e, element, "move")}
              onMouseDownResize={(e) => startDrag(e, element, "resize")}
              money={money}
            />
          ))}
        </div>

        {!previewMode && selected && (
          <ElementProperties
            element={selected}
            onChange={(patch) => updateElement(selected.id, patch)}
            onDelete={() => removeElement(selected.id)}
            onUploadImage={(file) => handleImageUpload(selected.id, file)}
          />
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

function ElementView({
  element,
  scale,
  selected,
  previewMode,
  previewValues,
  onMouseDownMove,
  onMouseDownResize,
  money,
}: {
  element: InvoiceElement;
  scale: number;
  selected: boolean;
  previewMode: boolean;
  previewValues: Record<string, string>;
  onMouseDownMove: (event: React.MouseEvent) => void;
  onMouseDownResize: (event: React.MouseEvent) => void;
  money: (value: number) => string;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: element.x * scale,
    top: element.y * scale,
    width: element.width * scale,
    height: element.height * scale,
    fontSize: (element.fontSize ?? 11) * 0.95,
    textAlign: element.align ?? "left",
    cursor: previewMode ? "default" : "move",
  };

  return (
    <div
      style={style}
      onMouseDown={onMouseDownMove}
      className={`overflow-hidden ${selected ? "outline outline-2 outline-orange-500" : previewMode ? "" : "outline outline-1 outline-dashed outline-slate-300 dark:outline-slate-600"}`}
    >
      <ElementContent element={element} previewMode={previewMode} previewValues={previewValues} money={money} />
      {selected && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDownResize(e);
          }}
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-orange-500"
        />
      )}
    </div>
  );
}

function ElementContent({
  element,
  previewMode,
  previewValues,
  money,
}: {
  element: InvoiceElement;
  previewMode: boolean;
  previewValues: Record<string, string>;
  money: (value: number) => string;
}) {
  const { t } = useLocale();

  if (element.type === "text" || element.type === "variables") {
    const text = previewMode ? fillVariables(element.content ?? "", previewValues) : element.content ?? "";
    return <div className="h-full w-full whitespace-pre-line break-words">{text}</div>;
  }

  if (element.type === "image") {
    if (!element.content) {
      return (
        <div className="flex h-full w-full items-center justify-center border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
          {t("invoice.imagePlaceholder")}
        </div>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={element.content} alt="" className="h-full w-full object-contain" />;
  }

  if (element.type === "qrcode") {
    const value = previewMode ? fillVariables(element.content ?? "", previewValues) : element.content ?? "";
    if (!value) {
      return (
        <div className="flex h-full w-full items-center justify-center border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
          {t("invoice.blockQrCode")}
        </div>
      );
    }
    return <QrCodePreview value={value} />;
  }

  if (element.type === "lineItems") {
    const rows = buildInvoiceLines(sampleInvoiceResult, element);
    return (
      <table className="w-full border-collapse text-[9px]">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-200 dark:border-slate-700">
              <td className="py-0.5 pr-1">{row.label}</td>
              <td className="py-0.5 text-right">{money(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // totals
  const marginHidden = element.hiddenLines?.includes("margin") ?? false;
  const taxHidden = element.hiddenLines?.includes("tax") ?? false;
  return (
    <div className="flex h-full w-full flex-col justify-end gap-0.5 text-[9px]">
      <div className="flex justify-between">
        <span>{t("cost.subtotal")}</span>
        <span>{money(sampleInvoiceResult.subtotal)}</span>
      </div>
      {!marginHidden && (
        <div className="flex justify-between">
          <span>{t("cost.margin")}</span>
          <span>{money(sampleInvoiceResult.marginAmount)}</span>
        </div>
      )}
      {!taxHidden && (
        <div className="flex justify-between">
          <span>{t("cost.tax")}</span>
          <span>{money(sampleInvoiceResult.vatAmount)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-400 pt-0.5 font-bold">
        <span>{t("cost.totalPrice")}</span>
        <span>{money(sampleInvoiceResult.totalPrice)}</span>
      </div>
    </div>
  );
}

function ElementProperties({
  element,
  onChange,
  onDelete,
  onUploadImage,
}: {
  element: InvoiceElement;
  onChange: (patch: Partial<InvoiceElement>) => void;
  onDelete: () => void;
  onUploadImage: (file: File) => void;
}) {
  const { t } = useLocale();
  const fieldClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t(`invoice.blockType`)}: {t(`invoice.block${capitalize(element.type)}`)}
        </h3>
        <button type="button" onClick={onDelete} className="text-xs font-medium text-red-500 hover:underline dark:text-red-400">
          {t("invoice.deleteBlock")}
        </button>
      </div>

      {(element.type === "text" || element.type === "variables") && (
        <>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("invoice.blockText")}
            <textarea
              value={element.content ?? ""}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={4}
              className={fieldClass}
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("invoice.fontSize")}
              <input
                type="number"
                min={6}
                max={48}
                value={element.fontSize ?? 11}
                onChange={(e) => onChange({ fontSize: parseInt(e.target.value, 10) || 11 })}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("invoice.align")}
              <select
                value={element.align ?? "left"}
                onChange={(e) => onChange({ align: e.target.value as InvoiceElement["align"] })}
                className={fieldClass}
              >
                <option value="left">{t("invoice.alignLeft")}</option>
                <option value="center">{t("invoice.alignCenter")}</option>
                <option value="right">{t("invoice.alignRight")}</option>
              </select>
            </label>
          </div>
        </>
      )}

      {element.type === "image" && (
        <>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("invoice.imageUrl")}
            <input
              value={element.content ?? ""}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder="https://example.com/logo.png"
              className={fieldClass}
            />
          </label>
          <label className="mt-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("invoice.imageUpload")}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadImage(file);
              }}
              className={fieldClass}
            />
          </label>
        </>
      )}

      {element.type === "qrcode" && (
        <>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("invoice.qrValue")}
            <input
              value={element.content ?? ""}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder="{{invoiceNumber}}"
              className={fieldClass}
            />
          </label>
          <label className="mt-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
            {t("invoice.qrSize")} (mm)
            <input
              type="number"
              min={8}
              value={Math.round(element.width)}
              onChange={(e) => {
                const edge = parseFloat(e.target.value) || 8;
                onChange({ width: edge, height: edge });
              }}
              className={fieldClass}
            />
          </label>
        </>
      )}

      {element.type === "lineItems" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("invoice.hiddenLines")}</p>
          {INVOICE_COST_LINES.map((line) => {
            const distributed = (element.distributionTargets?.[line.id]?.length ?? 0) > 0;
            const targets = element.distributionTargets?.[line.id] ?? [];
            return (
              <div key={line.id} className="border-b border-slate-200 pb-2 last:border-0 dark:border-slate-700">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={!(element.hiddenLines ?? []).includes(line.id)}
                    onChange={(e) => toggleHiddenLine(line.id, e.target.checked, element, onChange)}
                  />
                  {line.label}
                </label>
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={distributed}
                    onChange={() => toggleDistribution(line.id, element, onChange)}
                  />
                  {t("invoice.distribute")}
                </label>
                {distributed && (
                  <div className="mt-1 grid grid-cols-2 gap-1 pl-5">
                    {INVOICE_COST_LINES.filter((target) => target.id !== line.id).map((target) => (
                      <label key={target.id} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={targets.includes(target.id)}
                          onChange={() => toggleDistributionTarget(line.id, target.id, element, onChange)}
                        />
                        {target.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {element.type === "totals" && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("invoice.showInTotals")}</p>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!(element.hiddenLines ?? []).includes("margin")}
              onChange={(e) => toggleHiddenLine("margin", e.target.checked, element, onChange)}
            />
            {t("cost.margin")}
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!(element.hiddenLines ?? []).includes("tax")}
              onChange={(e) => toggleHiddenLine("tax", e.target.checked, element, onChange)}
            />
            {t("cost.tax")}
          </label>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
          X (mm)
          <input
            type="number"
            value={Math.round(element.x)}
            onChange={(e) => onChange({ x: parseFloat(e.target.value) || 0 })}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Y (mm)
          <input
            type="number"
            value={Math.round(element.y)}
            onChange={(e) => onChange({ y: parseFloat(e.target.value) || 0 })}
            className={fieldClass}
          />
        </label>
        {element.type !== "qrcode" && (
          <>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("invoice.width")} (mm)
              <input
                type="number"
                value={Math.round(element.width)}
                onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("invoice.height")} (mm)
              <input
                type="number"
                value={Math.round(element.height)}
                onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })}
                className={fieldClass}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function toggleHiddenLine(
  line: InvoiceCostLine,
  checked: boolean,
  element: InvoiceElement,
  onChange: (patch: Partial<InvoiceElement>) => void
) {
  const hidden = new Set(element.hiddenLines ?? []);
  if (checked) hidden.delete(line);
  else hidden.add(line);
  onChange({ hiddenLines: [...hidden] });
}

function toggleDistribution(
  line: InvoiceCostLine,
  element: InvoiceElement,
  onChange: (patch: Partial<InvoiceElement>) => void
) {
  const distributions = { ...(element.distributionTargets ?? {}) };
  const hidden = new Set(element.hiddenLines ?? []);
  if (distributions[line]) {
    delete distributions[line];
    hidden.delete(line);
  } else {
    distributions[line] = INVOICE_COST_LINES.filter((target) => target.id !== line).map((target) => target.id);
    hidden.add(line);
  }
  onChange({ distributionTargets: distributions, hiddenLines: [...hidden] });
}

function toggleDistributionTarget(
  source: InvoiceCostLine,
  target: InvoiceCostLine,
  element: InvoiceElement,
  onChange: (patch: Partial<InvoiceElement>) => void
) {
  const distributions = { ...(element.distributionTargets ?? {}) };
  const targets = distributions[source] ?? [];
  if (targets.includes(target) && targets.length === 1) return; // keep at least one target
  distributions[source] = targets.includes(target)
    ? targets.filter((item) => item !== target)
    : [...targets, target];
  onChange({ distributionTargets: distributions });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function VariablesInfo({
  customKeys,
  copiedVariable,
  onInsert,
}: {
  customKeys: string[];
  copiedVariable: string | null;
  onInsert: (name: string) => void;
}) {
  const { t } = useLocale();
  const names = [...INVOICE_VARIABLES, ...customKeys];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-500 hover:border-orange-400 hover:text-orange-600 dark:border-slate-600 dark:text-slate-400 dark:hover:text-orange-400"
        aria-label={t("invoice.variables")}
      >
        i
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("invoice.variables")}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("invoice.variablesHint")}</p>
          {/* overscroll-contain stops scroll chaining, which would otherwise scroll the page under the cursor and close this popover. */}
          <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto overscroll-contain">
            {names.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onInsert(name)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-orange-400 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-orange-500 dark:hover:bg-orange-950/30"
              >
                <span className="block font-mono text-[11px] text-orange-600 dark:text-orange-400">
                  {`{{${name}}}`}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {copiedVariable === name ? t("invoice.variableCopied") : t(`invoice.var.${name}` as Parameters<typeof t>[0])}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
