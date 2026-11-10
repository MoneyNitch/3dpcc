"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale } from "@/lib/locale";
import type { AccessoryMaterial, AccessoryStockMovement } from "@/lib/types";

type ItemInput = Pick<AccessoryMaterial, "name" | "pricePerPack" | "unitsPerPack">;
const inputFromItem = ({ name, pricePerPack, unitsPerPack }: AccessoryMaterial): ItemInput => ({ name, pricePerPack, unitsPerPack });
const emptyItem = { name: "", pricePerPack: "1", unitsPerPack: "1" };

export function AccessoryManager({ items, onItemsChanged, initialMovements, canEdit, onLabel }: {
  items: AccessoryMaterial[];
  onItemsChanged: (items: AccessoryMaterial[]) => void;
  initialMovements: AccessoryStockMovement[];
  canEdit: boolean;
  onLabel: (id: string) => void;
}) {
  const { t, money, lang } = useLocale();
  const [movements, setMovements] = useState(initialMovements);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [editing, setEditing] = useState<AccessoryMaterial | null>(null);
  const [draft, setDraft] = useState(emptyItem);
  const [formOpen, setFormOpen] = useState(false);
  const [stockItemId, setStockItemId] = useState<string | null>(null);
  const [stockAction, setStockAction] = useState<"receipt" | "adjustment">("receipt");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600";
  const stockItem = items.find((item) => item.id === stockItemId);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const modalOpen = formOpen || Boolean(stockItem);
  const filtered = items.filter((item) => `${item.name} ${item.id} ${item.numericId ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (stockFilter === "all" || (stockFilter === "empty" ? item.stockQuantity === 0 : item.stockQuantity > 0)));

  useEffect(() => {
    if (!modalOpen || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    element.querySelector<HTMLElement>("input, select")?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  function closeModal() {
    if (busy) return;
    setFormOpen(false); setEditing(null); setStockItemId(null); setMessage(null);
  }

  async function catalog(action: "create" | "update" | "delete", item = editing) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/accessories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "create" ? { action, item: { ...draft, pricePerPack: Number(draft.pricePerPack), unitsPerPack: Number(draft.unitsPerPack) } } :
          { action, id: item?.id, expected: item ? inputFromItem(item) : undefined, ...(action === "update" ? { item: { ...draft, pricePerPack: Number(draft.pricePerPack), unitsPerPack: Number(draft.unitsPerPack) } } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(t(body.error ?? "accessories.error.save"));
      onItemsChanged(body.accessories);
      setFormOpen(false); setEditing(null);
      setMessage({ error: false, text: t("accessories.saved") });
    } catch (error) {
      console.error("Could not update accessories:", error);
      setMessage({ error: true, text: error instanceof Error ? error.message : t("accessories.error.save") });
    } finally { setBusy(false); }
  }

  async function bookStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!Number.isSafeInteger(amount) || amount === 0 || (stockAction === "receipt" && amount < 1)) {
      setMessage({ error: true, text: t("settings.stockInvalid") }); return;
    }
    if (!window.confirm(t("accessories.confirmStock", { quantity: amount, name: stockItem?.name ?? "" }))) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/accessory-stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: stockAction, accessoryId: stockItemId, quantity: amount }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("settings.stockSaveFailed"));
      onItemsChanged(body.accessories); setMovements(body.movements);
      setStockItemId(null); setQuantity("");
      setMessage({ error: false, text: t("settings.stockSaved") });
    } catch (error) {
      console.error("Could not book accessory stock:", error);
      setMessage({ error: true, text: error instanceof Error ? error.message : t("settings.stockSaveFailed") });
    } finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-5">
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "accessories.articleCount", value: items.length },
        { label: "accessories.emptyCount", value: items.filter((item) => !item.stockQuantity).length },
        { label: "accessories.stockValue", value: money(items.reduce((total, item) => total + item.stockQuantity * item.pricePerPack / item.unitsPerPack, 0)) },
      ].map((stat) => <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">{t(stat.label)}</p><p className="mt-1 text-2xl font-semibold">{stat.value}</p>
      </div>)}
    </div>
    {message && !modalOpen && <p role={message.error ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${message.error ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"}`}>{message.text}</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm">{t("accessories.search")}<input type="search" className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="text-sm">{t("settings.stock")}<select className={inputClass} value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
        <option value="all">{t("orders.filterAll")}</option><option value="inStock">{t("accessories.inStock")}</option><option value="empty">{t("accessories.emptyStock")}</option>
      </select></label>
      {canEdit && <button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(emptyItem); setMessage(null); setFormOpen(true); }}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("settings.addAccessoryMaterial")}</button>}
    </div>
    <dialog ref={dialog} aria-labelledby={dialogTitleId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); closeModal(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeModal(); } }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 id={dialogTitleId} className="min-w-0 break-words text-lg font-semibold">{formOpen
          ? t(editing ? "accessories.edit" : "settings.addAccessoryMaterial")
          : `${t("settings.stockChange")}: ${stockItem?.name ?? ""}`}</h2>
        <button type="button" aria-label={t("auth.cancel")} disabled={busy} onClick={closeModal}
          className="shrink-0 rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700">×</button>
      </div>
      {editing && formOpen && <p className="mt-2 text-sm text-slate-500">{t("accessories.numericId")}: {editing.numericId}</p>}
      {message && <p role={message.error ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${message.error ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"}`}>{message.text}</p>}
    {formOpen && <form onSubmit={(event) => { event.preventDefault(); void catalog(editing ? "update" : "create"); }}>
      <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">{t("settings.accessoryName")}<input required maxLength={200} className={inputClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="text-sm">{t("settings.pricePerPack")}<input required type="number" min={0} max={1_000_000_000} step="0.01" className={inputClass} value={draft.pricePerPack} onChange={(event) => setDraft((current) => ({ ...current, pricePerPack: event.target.value }))} /></label>
        <label className="text-sm">{t("settings.unitsPerPack")}<input required type="number" min={1} max={1_000_000} step={1} className={inputClass} value={draft.unitsPerPack} onChange={(event) => setDraft((current) => ({ ...current, unitsPerPack: event.target.value }))} /></label>
        <p className="text-sm text-slate-500 sm:col-span-3">{t("settings.costPerUnit")}: {Number.isFinite(Number(draft.pricePerPack) / Number(draft.unitsPerPack)) ? money(Number(draft.pricePerPack) / Number(draft.unitsPerPack)) : "–"}</p>
        <div className="flex gap-2 sm:col-span-3"><button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white">{t("accessories.save")}</button>
          <button type="button" className={buttonClass} onClick={closeModal}>{t("auth.cancel")}</button></div>
      </fieldset>
    </form>}
    {stockItem && <form onSubmit={(event) => void bookStock(event)}>
      <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t("accessories.bookingType")}<select className={inputClass} value={stockAction} onChange={(event) => { setStockAction(event.target.value === "receipt" ? "receipt" : "adjustment"); setQuantity(""); }}>
          <option value="receipt">{t("settings.stockReceive")}</option><option value="adjustment">{t("settings.stockAdjust")}</option>
        </select></label>
        <label className="text-sm">{t("extra.quantity")}<input className={inputClass} type="number" required step={1} min={stockAction === "receipt" ? 1 : -1_000_000_000} max={1_000_000_000} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <p className="text-xs text-slate-500 sm:col-span-2">{t(stockAction === "receipt" ? "accessories.receiptHelp" : "accessories.adjustmentHelp")} {t("settings.stock")}: {stockItem.stockQuantity}</p>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white">{t("accessories.book")}</button><button type="button" className={buttonClass} onClick={closeModal}>{t("auth.cancel")}</button></div>
      </fieldset>
    </form>}
    </dialog>
    <div className="grid gap-4 sm:grid-cols-2">
      {filtered.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{item.name}</h2>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${item.stockQuantity ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>{item.stockQuantity} {t("extra.unit")}</span></div>
        <p className="mt-1 text-sm font-medium text-slate-500">{t("accessories.numericId")}: {item.numericId}</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-500">{item.id}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate-500">{t("settings.pricePerPack")}</dt><dd className="mt-1 font-medium">{money(item.pricePerPack)}</dd></div>
          <div><dt className="text-xs text-slate-500">{t("settings.unitsPerPack")}</dt><dd className="mt-1 font-medium">{item.unitsPerPack}</dd></div>
          <div className="col-span-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50"><dt className="text-xs text-slate-500">{t("settings.costPerUnit")}</dt><dd className="font-semibold">{money(item.pricePerPack / item.unitsPerPack)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && <>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => { setEditing(item); setDraft({ name: item.name, pricePerPack: String(item.pricePerPack), unitsPerPack: String(item.unitsPerPack) }); setMessage(null); setFormOpen(true); }}>{t("accessories.edit")}</button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => { setStockItemId(item.id); setStockAction("receipt"); setQuantity(""); setMessage(null); }}>{t("settings.stockChange")}</button>
          </>}
          <button type="button" className={buttonClass} onClick={() => onLabel(item.id)}>{t("labels.print")}</button>
          {canEdit && <button type="button" disabled={busy || item.stockQuantity > 0} title={item.stockQuantity ? t("settings.stockMustBeEmpty") : undefined}
            onClick={() => { if (window.confirm(t("accessories.confirmDelete", { name: item.name }))) void catalog("delete", item); }}
            className="rounded-lg px-3 py-2 text-sm text-red-600 disabled:opacity-40 dark:text-red-400">{t("extra.remove")}</button>}
        </div>
        <details className="mt-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><summary className="cursor-pointer">{t("settings.stockHistory")}</summary>
          <ul className="mt-3 max-h-48 space-y-3 overflow-y-auto">{movements.filter((movement) => movement.accessoryId === item.id).map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-2 text-xs">
            <span>{movement.reference}<time className="mt-1 block text-slate-500" dateTime={movement.createdAt}>{new Date(movement.createdAt).toLocaleString(lang)}</time></span>
            <span className={movement.quantity < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300"}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</span>
          </li>)}</ul>
        </details>
      </article>)}
    </div>
    {!filtered.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{t("accessories.noMatches")}</p>}
    <p className="text-xs text-slate-500">{t("accessories.historyLimit")}</p>
  </div>;
}
