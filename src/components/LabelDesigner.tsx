"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useLocale } from "@/lib/locale";
import { randomUUID } from "@/lib/clientId";
import { createLabelTemplate, labelTemplateSchema, moveLabelElement, type LabelElement, type LabelTemplate } from "@/lib/labelTemplates";
import type { AccessoryMaterial } from "@/lib/types";

export function LabelDesigner({ items, initialTemplates, itemId, onItemChanged, canEdit }: {
  items: AccessoryMaterial[];
  initialTemplates: LabelTemplate[];
  itemId: string;
  onItemChanged: (id: string) => void;
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [savedTemplates, setSavedTemplates] = useState(initialTemplates);
  const [template, setTemplate] = useState<LabelTemplate>(() => initialTemplates[0] ?? createLabelTemplate(randomUUID(), t("labels.newTemplate")));
  const [selectedId, setSelectedId] = useState(template.elements[0]?.id ?? "");
  const [preview, setPreview] = useState<{ key: string; svg: string; document: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [printDocument, setPrintDocument] = useState<string | null>(null);
  const [printCount, setPrintCount] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; clientX: number; clientY: number; x: number; y: number; width: number; height: number } | null>(null);
  const selected = template.elements.find((element) => element.id === selectedId);
  const key = JSON.stringify({ template, accessoryId: itemId });
  const dirty = JSON.stringify(savedTemplates.find((entry) => entry.id === template.id)) !== JSON.stringify(template);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600";

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!itemId) { setPreviewError(t("labels.noItems")); return; }
      try {
        const response = await fetch("/api/labels", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(t(body.error ?? "labels.error.render"));
        if (!controller.signal.aborted) {
          setPreview({ key, svg: body.svg, document: body.document }); setPreviewError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Could not preview label:", error);
          setPreviewError(error instanceof Error ? error.message : t("labels.error.render"));
        }
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, itemId, t]);

  function updateElement(patch: Partial<LabelElement>) {
    setTemplate((current) => ({ ...current, elements: current.elements.map((element) =>
      element.id === selectedId ? { ...element, ...patch } : element) }));
    setMessage(null);
  }

  function chooseTemplate(next: LabelTemplate) {
    if (dirty && !window.confirm(t("labels.confirmDiscard"))) return;
    setTemplate(structuredClone(next)); setSelectedId(next.elements[0]?.id ?? ""); setMessage(null);
  }

  function addElement(type: LabelElement["type"]) {
    const id = randomUUID();
    const width = type === "qr" ? Math.min(20, template.width) : Math.min(type === "barcode" ? 65 : 40, template.width);
    const height = Math.min(type === "text" ? 10 : type === "qr" ? width : 12, template.height);
    setTemplate((current) => ({ ...current, elements: [...current.elements, {
      id, type, content: type === "text" ? "{{name}}" : "{{id}}", x: 0, y: 0, width, height, fontSize: 10,
    }] }));
    setSelectedId(id);
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>, element: LabelElement) {
    setSelectedId(element.id);
    if (!canEdit || saving || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: element.id, clientX: event.clientX, clientY: event.clientY, x: element.x, y: element.y, width: rect.width, height: rect.height };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || !start.width || !start.height) return;
    setTemplate((current) => ({ ...current, elements: current.elements.map((element) =>
      element.id === start.id ? moveLabelElement(element,
        start.x + (event.clientX - start.clientX) / start.width * current.width,
        start.y + (event.clientY - start.clientY) / start.height * current.height, current) : element) }));
  }

  async function saveTemplates(next: LabelTemplate[]) {
    if (!next.every((entry) => labelTemplateSchema.safeParse(entry).success)) {
      setMessage({ error: true, text: t("labels.error.input") }); return;
    }
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/label-templates", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates: next, expected: savedTemplates }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(t(body.error ?? "labels.error.save"));
      setSavedTemplates(body.templates);
      setMessage({ error: false, text: t("labels.saved") });
      if (!next.some((entry) => entry.id === template.id)) {
        const fallback = next[0] ?? createLabelTemplate(randomUUID(), t("labels.newTemplate"));
        setTemplate(fallback); setSelectedId(fallback.elements[0]?.id ?? "");
      }
    } catch (error) {
      console.error("Could not persist labels:", error);
      setMessage({ error: true, text: error instanceof Error ? error.message : t("labels.error.save") });
    } finally { setSaving(false); }
  }

  return <section className="flex flex-col gap-5">
    <div><h2 className="text-xl font-semibold">{t("labels.title")}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("labels.help")}</p></div>
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-green-700 dark:text-green-300"}>{message.text}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{t("labels.item")}<select className={inputClass} value={itemId} onChange={(event) => onItemChanged(event.target.value)}>
        {items.map((item) => <option key={item.id} value={item.id}>{item.numericId} · {item.name}</option>)}
      </select></label>
      <label className="text-sm">{t("labels.template")}<select className={inputClass} value={savedTemplates.some((entry) => entry.id === template.id) ? template.id : ""} disabled={saving}
        onChange={(event) => { const next = savedTemplates.find((entry) => entry.id === event.target.value); if (next) chooseTemplate(next); }}>
        <option value="">{t("labels.newTemplate")}</option>{savedTemplates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></label>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t("labels.preview")} · {template.width} × {template.height} mm</p>
        <div ref={canvas} className="relative mx-auto w-full max-w-lg overflow-hidden bg-white shadow-sm" style={{ aspectRatio: `${template.width}/${template.height}` }}>
          {/* Generated local SVG: no image optimizer or external request is needed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview?.key === key && <img alt={t("labels.preview")} draggable={false} className="h-full w-full" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`} />}
          {template.elements.map((element) => <button key={element.id} type="button" aria-label={`${t(`labels.type.${element.type}`)} ${element.id}`}
            aria-pressed={selectedId === element.id}
            onPointerDown={(event) => pointerDown(event, element)} onPointerMove={pointerMove}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            onKeyDown={(event) => {
              if (!canEdit || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              const moved = moveLabelElement(element, element.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0),
                element.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0), template);
              setTemplate((current) => ({ ...current, elements: current.elements.map((entry) => entry.id === element.id ? moved : entry) }));
            }}
            onClick={() => setSelectedId(element.id)}
            className={`absolute touch-none border text-[10px] text-slate-600 ${selectedId === element.id ? "border-orange-500 bg-orange-500/10" : "border-dashed border-slate-300/70"}`}
            style={{ left: `${element.x / template.width * 100}%`, top: `${element.y / template.height * 100}%`, width: `${element.width / template.width * 100}%`, height: `${element.height / template.height * 100}%` }}>
            {preview?.key !== key && t(`labels.type.${element.type}`)}
          </button>)}
        </div>
        {previewError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{previewError}</p>}
        <button type="button" disabled={!preview || preview.key !== key || Boolean(previewError)} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => { if (preview) { setPrintDocument(preview.document); setPrintCount((count) => count + 1); } }}>{t("labels.print")}</button>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("labels.printHelp")}</p>
      </div>
      <fieldset disabled={!canEdit || saving} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <legend className="px-1 font-semibold">{t("labels.properties")}</legend>
        <label className="text-sm">{t("labels.templateName")}<input maxLength={100} className={inputClass} value={template.name} onChange={(event) => setTemplate((current) => ({ ...current, name: event.target.value }))} /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["width", "height"] as const).map((field) => <label key={field} className="text-sm">{t(`labels.${field}`)} (mm)
            <input type="number" min={15} max={300} step={1} className={inputClass} value={template[field]}
              onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) setTemplate((current) => ({ ...current, [field]: value })); }} />
          </label>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{(["text", "qr", "barcode"] as const).map((type) => <button type="button" key={type} disabled={!canEdit || saving || template.elements.length >= 20} className={buttonClass} onClick={() => addElement(type)}>+ {t(`labels.type.${type}`)}</button>)}</div>
        <label className="mt-4 block text-sm">{t("labels.element")}<select className={inputClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {template.elements.map((element, index) => <option key={element.id} value={element.id}>{index + 1}. {t(`labels.type.${element.type}`)}</option>)}
        </select></label>
        {selected && <>
          <label className="mt-3 block text-sm">{t("labels.content")}<textarea rows={2} maxLength={500} className={inputClass} value={selected.content} onChange={(event) => updateElement({ content: event.target.value })} /></label>
          <button type="button" className={`${buttonClass} mt-2`} onClick={() => updateElement({ content: "{{numericId}}" })}>{t("labels.useNumericId")}</button>
          <p className="mt-1 text-xs text-slate-500">{t("labels.variables")}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">{(["x", "y", "width", "height", ...(selected.type === "text" ? ["fontSize" as const] : [])] as const).map((field) => <label key={field} className="text-sm">{field === "x" || field === "y" ? field.toUpperCase() : t(`labels.${field}`)} ({field === "fontSize" ? "pt" : "mm"})
            <input className={inputClass} type="number" step="0.1" min={field === "x" || field === "y" ? 0 : 1} max={field === "fontSize" ? 40 : 300}
              value={selected[field]} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) updateElement({ [field]: value }); }} />
          </label>)}</div>
          <button type="button" disabled={template.elements.length <= 1} className={`${buttonClass} mt-3 text-red-600`} onClick={() => {
            const elements = template.elements.filter((element) => element.id !== selectedId);
            setTemplate((current) => ({ ...current, elements })); setSelectedId(elements[0]?.id ?? "");
          }}>{t("labels.removeElement")}</button>
        </>}
      </fieldset>
    </div>
    {canEdit && <div className="flex flex-wrap gap-3">
      <button type="button" disabled={saving} className={buttonClass} onClick={() => chooseTemplate(createLabelTemplate(randomUUID(), t("labels.newTemplate")))}>{t("labels.newTemplate")}</button>
      <button type="button" disabled={saving || Boolean(previewError) || preview?.key !== key} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => void saveTemplates([...savedTemplates.filter((entry) => entry.id !== template.id), template])}>{t("labels.save")}{dirty ? " *" : ""}</button>
      <button type="button" disabled={saving || !savedTemplates.some((entry) => entry.id === template.id)} className={`${buttonClass} text-red-600`}
        onClick={() => { if (window.confirm(t("labels.confirmDelete"))) void saveTemplates(savedTemplates.filter((entry) => entry.id !== template.id)); }}>{t("labels.delete")}</button>
    </div>}
    {printDocument && <iframe key={printCount} title={t("labels.print")} srcDoc={printDocument} className="fixed bottom-0 left-0 h-px w-px border-0 opacity-0" onLoad={(event) => {
      try {
        const target = event.currentTarget.contentWindow;
        if (!target) throw new Error(t("labels.error.print"));
        target.focus(); target.print();
      } catch (error) {
        console.error("Could not print label:", error);
        setMessage({ error: true, text: t("labels.error.print") });
      }
    }} />}
  </section>;
}
