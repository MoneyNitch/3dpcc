"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/locale";
import type { AccessoryMaterial, AccessoryStockMovement } from "@/lib/types";

type ItemInput = Pick<AccessoryMaterial, "name" | "pricePerPack" | "unitsPerPack">;
type AccessoryDraft = { name: string; pricePerPack: string; unitsPerPack: string; stockQuantity: string };
type AccessoryViewMode = "grid" | "list";
const inputFromItem = ({ name, pricePerPack, unitsPerPack }: AccessoryMaterial): ItemInput => ({ name, pricePerPack, unitsPerPack });
const emptyItem: AccessoryDraft = { name: "", pricePerPack: "1", unitsPerPack: "1", stockQuantity: "0" };
const itemInputFromDraft = (draft: AccessoryDraft): ItemInput => ({
  name: draft.name,
  pricePerPack: Number(draft.pricePerPack),
  unitsPerPack: Number(draft.unitsPerPack),
});
const viewModeStorageKey = "3dpcc:accessories:view-mode";
const viewModeChangeEvent = "3dpcc:accessories:view-mode";

function subscribeToViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(viewModeChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(viewModeChangeEvent, onChange);
  };
}

function getViewModeSnapshot(): AccessoryViewMode | null {
  try {
    return window.localStorage.getItem(viewModeStorageKey) === "list" ? "list" : "grid";
  } catch {
    return null;
  }
}

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
  const storedViewMode = useSyncExternalStore(subscribeToViewMode, getViewModeSnapshot, () => "grid");
  const [viewModeOverride, setViewModeOverride] = useState<AccessoryViewMode | null>(null);
  const [viewPreferenceSaveError, setViewPreferenceSaveError] = useState(false);
  const viewMode = viewModeOverride ?? storedViewMode ?? "grid";
  const [stockHistoryItemId, setStockHistoryItemId] = useState<string | null>(null);
  const [hoveredUuidItemId, setHoveredUuidItemId] = useState<string | null>(null);
  const [focusedUuidItemId, setFocusedUuidItemId] = useState<string | null>(null);
  const [pinnedUuidItemId, setPinnedUuidItemId] = useState<string | null>(null);
  const [actionMenuItemId, setActionMenuItemId] = useState<string | null>(null);
  const [actionMenuIncludesEditable, setActionMenuIncludesEditable] = useState(false);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<AccessoryMaterial | null>(null);
  const [draft, setDraft] = useState(emptyItem);
  const [createDrafts, setCreateDrafts] = useState<AccessoryDraft[]>([{ ...emptyItem }]);
  const [formOpen, setFormOpen] = useState(false);
  const [stockItemId, setStockItemId] = useState<string | null>(null);
  const [stockAction, setStockAction] = useState<"receipt" | "adjustment">("receipt");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600";
  const menuButtonClass = "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 dark:text-slate-200 dark:hover:bg-slate-700";
  const stockItem = items.find((item) => item.id === stockItemId);
  const stockHistoryItem = items.find((item) => item.id === stockHistoryItemId);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const modalOpen = formOpen || Boolean(stockItem) || Boolean(stockHistoryItem);
  const filtered = items.filter((item) => `${item.name} ${item.id} ${item.numericId ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (stockFilter === "all" || (stockFilter === "empty" ? item.stockQuantity === 0 : item.stockQuantity > 0)));
  const actionMenuItem = items.find((item) => item.id === actionMenuItemId) ?? null;

  function chooseViewMode(nextViewMode: AccessoryViewMode) {
    setViewModeOverride(nextViewMode);
    try {
      window.localStorage.setItem(viewModeStorageKey, nextViewMode);
      window.dispatchEvent(new Event(viewModeChangeEvent));
      setViewModeOverride(null);
      setViewPreferenceSaveError(false);
    } catch (error) {
      console.error("Could not save accessory catalog view preference:", error);
      setViewPreferenceSaveError(true);
    }
  }

  function toggleActionMenu(item: AccessoryMaterial, trigger: HTMLButtonElement, includeEditable = false) {
    if (actionMenuItemId === item.id) {
      setActionMenuItemId(null);
      return;
    }

    actionMenuTriggerRef.current = trigger;
    const bounds = trigger.getBoundingClientRect();
    const menuWidth = Math.min(224, window.innerWidth - 16);
    const menuHeight = canEdit && includeEditable ? 248 : 140;
    const top = bounds.bottom + menuHeight + 8 <= window.innerHeight - 8
      ? bounds.bottom + 8
      : Math.max(8, bounds.top - menuHeight - 8);
    const left = Math.max(8, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 8));
    setActionMenuPosition({ top, left });
    setActionMenuIncludesEditable(includeEditable);
    setActionMenuItemId(item.id);
  }

  function closeActionMenu() {
    setActionMenuItemId(null);
  }

  useEffect(() => {
    if (actionMenuItemId) actionMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [actionMenuItemId]);

  useEffect(() => {
    if (!actionMenuItemId) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || actionMenuRef.current?.contains(target) || actionMenuTriggerRef.current?.contains(target)) return;
      setActionMenuItemId(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setActionMenuItemId(null);
      actionMenuTriggerRef.current?.focus();
    }
    const closeMenu = () => setActionMenuItemId(null);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [actionMenuItemId]);

  useEffect(() => {
    const trigger = actionMenuTriggerRef.current;
    const menu = actionMenuRef.current;
    if (!actionMenuItemId || !trigger || !menu) return;

    const triggerBounds = trigger.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    const top = triggerBounds.bottom + menuBounds.height + 8 <= window.innerHeight - 8
      ? triggerBounds.bottom + 8
      : Math.max(8, triggerBounds.top - menuBounds.height - 8);
    const left = Math.max(8, Math.min(triggerBounds.right - menuBounds.width, window.innerWidth - menuBounds.width - 8));
    setActionMenuPosition((current) => current?.top === top && current.left === left ? current : { top, left });
  }, [actionMenuItemId, actionMenuIncludesEditable]);

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
    setFormOpen(false); setEditing(null); setStockItemId(null); setStockHistoryItemId(null); setMessage(null);
  }

  function updateCreateDraft(index: number, field: keyof AccessoryDraft, value: string) {
    setCreateDrafts((current) => current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [field]: value } : entry));
  }

  async function catalog(action: "create" | "createMany" | "update" | "delete", item = editing) {
    setBusy(true); setMessage(null);
    try {
      const requestBody = action === "create"
        ? { action, item: { ...itemInputFromDraft(draft), stockQuantity: Number(draft.stockQuantity) } }
        : action === "createMany"
          ? { action, items: createDrafts.map((entry) => ({ ...itemInputFromDraft(entry), stockQuantity: Number(entry.stockQuantity) })) }
          : { action, id: item?.id, expected: item ? inputFromItem(item) : undefined, ...(action === "update" ? { item: itemInputFromDraft(draft) } : {}) };
      const response = await fetch("/api/accessories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

  function renderItemActions(item: AccessoryMaterial, compact = false, menuOnly = false) {
    const editableActions = <>
      {canEdit && <>
        <button type="button" className={`${buttonClass} whitespace-nowrap`} disabled={busy} onClick={() => { setEditing(item); setDraft({ name: item.name, pricePerPack: String(item.pricePerPack), unitsPerPack: String(item.unitsPerPack), stockQuantity: "0" }); setMessage(null); setFormOpen(true); }}>{t("accessories.edit")}</button>
        <button type="button" className={`${buttonClass} whitespace-nowrap`} disabled={busy} onClick={() => { setStockItemId(item.id); setStockAction("receipt"); setQuantity(""); setMessage(null); }}>{t("settings.stockChange")}</button>
      </>}
    </>;
    if (!compact) return <>
      {editableActions}
      <button type="button" className={buttonClass} onClick={() => onLabel(item.id)}>{t("labels.print")}</button>
      {canEdit && <button type="button" disabled={busy || item.stockQuantity > 0} title={item.stockQuantity ? t("settings.stockMustBeEmpty") : undefined}
        onClick={() => { if (window.confirm(t("accessories.confirmDelete", { name: item.name }))) void catalog("delete", item); }}
        className="rounded-lg px-3 py-2 text-sm text-red-600 disabled:opacity-40 dark:text-red-400">{t("extra.remove")}</button>}
    </>;
    return <div className={`flex items-center gap-2 ${menuOnly ? "justify-end" : "flex-nowrap"}`}>
      {!menuOnly && editableActions}
      <button type="button" aria-label={t("accessories.actions")} title={t("accessories.actions")}
        aria-haspopup="true" aria-expanded={actionMenuItemId === item.id}
        onClick={(event) => toggleActionMenu(item, event.currentTarget, menuOnly)}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
    </div>;
  }

  function renderActionMenu(item: AccessoryMaterial) {
    return <div ref={actionMenuRef} role="group" aria-label={t("accessories.actions")}
      style={{ position: "fixed", top: actionMenuPosition?.top ?? 8, left: actionMenuPosition?.left ?? 8 }}
      className="z-[100] max-h-[calc(100vh-1rem)] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/10">
      {actionMenuIncludesEditable && canEdit && <>
        <button type="button" className={menuButtonClass} onClick={() => {
          setEditing(item);
          setDraft({ name: item.name, pricePerPack: String(item.pricePerPack), unitsPerPack: String(item.unitsPerPack), stockQuantity: "0" });
          setMessage(null);
          setFormOpen(true);
          closeActionMenu();
        }}>{t("accessories.edit")}</button>
        <button type="button" className={menuButtonClass} disabled={busy} onClick={() => {
          setStockItemId(item.id);
          setStockAction("receipt");
          setQuantity("");
          setMessage(null);
          closeActionMenu();
        }}>{t("settings.stockChange")}</button>
      </>}
      <button type="button" className={menuButtonClass} onClick={() => { onLabel(item.id); closeActionMenu(); }}>{t("labels.print")}</button>
      <button type="button" aria-pressed={stockHistoryItemId === item.id} className={menuButtonClass}
        onClick={() => {
          setStockHistoryItemId((current) => current === item.id ? null : item.id);
          closeActionMenu();
        }}>{t("settings.stockHistory")}</button>
      <button type="button" aria-pressed={pinnedUuidItemId === item.id} className={menuButtonClass}
        onClick={() => {
          setPinnedUuidItemId((current) => current === item.id ? null : item.id);
          closeActionMenu();
        }}>{t(pinnedUuidItemId === item.id ? "accessories.hideUuid" : "accessories.showUuid")}</button>
      {canEdit && <>
        <div role="separator" className="my-1 border-t border-slate-200 dark:border-slate-700" />
        <button type="button" disabled={busy || item.stockQuantity > 0} title={item.stockQuantity ? t("settings.stockMustBeEmpty") : undefined}
          onClick={() => {
            closeActionMenu();
            if (window.confirm(t("accessories.confirmDelete", { name: item.name }))) void catalog("delete", item);
          }}
          className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30">{t("extra.remove")}</button>
      </>}
    </div>;
  }

  function renderStockMovements(item: AccessoryMaterial) {
    return <ul className="mt-3 max-h-48 space-y-3 overflow-y-auto">{movements.filter((movement) => movement.accessoryId === item.id).map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-2 text-xs">
      <span>{movement.reference}<time className="mt-1 block text-slate-500" dateTime={movement.createdAt}>{new Date(movement.createdAt).toLocaleString(lang)}</time></span>
      <span className={movement.quantity < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-300"}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</span>
    </li>)}</ul>;
  }

  function renderStockHistory(item: AccessoryMaterial) {
    return <button type="button" onClick={() => { setStockHistoryItemId(item.id); setMessage(null); }}
      className="mt-4 w-full border-t border-slate-200 pt-3 text-left text-sm hover:text-orange-600 dark:border-slate-700 dark:hover:text-orange-400">
      {t("settings.stockHistory")}
    </button>;
  }

  function renderItemId(item: AccessoryMaterial) {
    const uuidVisible = hoveredUuidItemId === item.id || focusedUuidItemId === item.id || pinnedUuidItemId === item.id;
    return <div className="mt-1 min-w-0" onMouseEnter={() => setHoveredUuidItemId(item.id)} onMouseLeave={() => setHoveredUuidItemId(null)}>
      <p tabIndex={0} title={t("accessories.uuidRevealHint")}
        onFocus={() => setFocusedUuidItemId(item.id)} onBlur={() => setFocusedUuidItemId(null)}
        className="w-fit max-w-full break-all cursor-help rounded-sm text-xs text-slate-500 underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
        {t("accessories.numericId")}: {item.numericId}
      </p>
      {uuidVisible && <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{t("accessories.uuid")}: {item.id}</p>}
    </div>;
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
    {(storedViewMode === null || viewPreferenceSaveError) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{t("accessories.viewPreferenceError")}</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm">{t("accessories.search")}<input type="search" className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="text-sm">{t("settings.stock")}<select className={inputClass} value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
        <option value="all">{t("orders.filterAll")}</option><option value="inStock">{t("accessories.inStock")}</option><option value="empty">{t("accessories.emptyStock")}</option>
      </select></label>
      <div role="group" aria-label={t("accessories.viewMode")} className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
        {(["grid", "list"] as const).map((mode) => (
          <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => chooseViewMode(mode)}
            className={`px-3 py-2 text-sm ${viewMode === mode ? "bg-orange-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
            {t(mode === "grid" ? "accessories.viewGrid" : "accessories.viewList")}
          </button>
        ))}
      </div>
      {canEdit && <button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft({ ...emptyItem }); setCreateDrafts([{ ...emptyItem }]); setMessage(null); setFormOpen(true); }}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("settings.addAccessoryMaterial")}</button>}
    </div>
    <dialog ref={dialog} aria-labelledby={dialogTitleId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); closeModal(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeModal(); } }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 id={dialogTitleId} className="min-w-0 break-words text-lg font-semibold">{formOpen
          ? t(editing ? "accessories.edit" : "accessories.addMultipleTitle")
          : stockItem
            ? `${t("settings.stockChange")}: ${stockItem.name}`
            : `${t("settings.stockHistory")}: ${stockHistoryItem?.name ?? ""}`}</h2>
        <button type="button" aria-label={t("auth.cancel")} disabled={busy} onClick={closeModal}
          className="shrink-0 rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700">×</button>
      </div>
      {editing && formOpen && <p className="mt-2 text-sm text-slate-500">{t("accessories.numericId")}: {editing.numericId}</p>}
      {message && <p role={message.error ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${message.error ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"}`}>{message.text}</p>}
    {formOpen && <form onSubmit={(event) => { event.preventDefault(); void catalog(editing ? "update" : "createMany"); }}>
      {editing ? <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">{t("settings.accessoryName")}<input required maxLength={200} className={inputClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="text-sm">{t("settings.pricePerPack")}<input required type="number" min={0} max={1_000_000_000} step="0.01" className={inputClass} value={draft.pricePerPack} onChange={(event) => setDraft((current) => ({ ...current, pricePerPack: event.target.value }))} /></label>
        <label className="text-sm">{t("settings.unitsPerPack")}<input required type="number" min={1} max={1_000_000} step={1} className={inputClass} value={draft.unitsPerPack} onChange={(event) => setDraft((current) => ({ ...current, unitsPerPack: event.target.value }))} /></label>
        <p className="text-sm text-slate-500 sm:col-span-3">{t("settings.costPerUnit")}: {Number.isFinite(Number(draft.pricePerPack) / Number(draft.unitsPerPack)) ? money(Number(draft.pricePerPack) / Number(draft.unitsPerPack)) : "–"}</p>
        <div className="flex gap-2 sm:col-span-3"><button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white">{t("accessories.save")}</button>
          <button type="button" className={buttonClass} onClick={closeModal}>{t("auth.cancel")}</button></div>
      </fieldset> : <fieldset disabled={busy} className="mt-4">
        <p className="mb-4 text-sm text-slate-500">{t("accessories.bulkCreateHelp")}</p>
        <div className="space-y-3">
          {createDrafts.map((entry, index) => <div key={index} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t("accessories.itemNumber", { number: index + 1 })}</h3>
              {createDrafts.length > 1 && <button type="button" className="text-sm text-red-600 hover:underline dark:text-red-400"
                onClick={() => setCreateDrafts((current) => current.filter((_, entryIndex) => entryIndex !== index))}>{t("extra.remove")}</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">{t("settings.accessoryName")}<input required maxLength={200} className={inputClass} value={entry.name}
                onChange={(event) => updateCreateDraft(index, "name", event.target.value)} /></label>
              <label className="text-sm">{t("settings.pricePerPack")}<input required type="number" min={0} max={1_000_000_000} step="0.01" className={inputClass} value={entry.pricePerPack}
                onChange={(event) => updateCreateDraft(index, "pricePerPack", event.target.value)} /></label>
              <label className="text-sm">{t("settings.unitsPerPack")}<input required type="number" min={1} max={1_000_000} step={1} className={inputClass} value={entry.unitsPerPack}
                onChange={(event) => updateCreateDraft(index, "unitsPerPack", event.target.value)} /></label>
              <label className="text-sm">{t("accessories.initialStock")}<input required type="number" min={0} max={1_000_000_000} step={1} className={inputClass} value={entry.stockQuantity}
                onChange={(event) => updateCreateDraft(index, "stockQuantity", event.target.value)} /></label>
              <p className="self-end pb-2 text-sm text-slate-500">{t("settings.costPerUnit")}: {Number.isFinite(Number(entry.pricePerPack) / Number(entry.unitsPerPack)) ? money(Number(entry.pricePerPack) / Number(entry.unitsPerPack)) : "–"}</p>
            </div>
          </div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setCreateDrafts((current) => [...current, { ...emptyItem }])}>{t("accessories.addAnother")}</button>
          <button type="submit" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white">{t("accessories.save")}</button>
          <button type="button" className={buttonClass} onClick={closeModal}>{t("auth.cancel")}</button>
        </div>
      </fieldset>}
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
    {stockHistoryItem && <section aria-label={t("settings.stockHistory")} className="mt-4 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
      {renderStockMovements(stockHistoryItem)}
    </section>}
    </dialog>
    {viewMode === "list" ? (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full table-fixed text-left text-xs sm:text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 sm:text-xs">
            <tr>
              <th scope="col" className="w-[18%] break-words px-1 py-2 sm:w-[22%] sm:px-2 md:w-[24%] md:px-3 2xl:w-[21%] 2xl:px-4">{t("settings.accessoryName")}</th>
              <th scope="col" className="w-[13%] break-words px-1 py-2 sm:w-[12%] sm:px-2 md:px-3 2xl:w-[11%] 2xl:px-4">{t("settings.stock")}</th>
              <th scope="col" className="w-[15%] break-words px-1 py-2 text-right sm:w-[14%] sm:px-2 md:px-3 2xl:px-4">{t("settings.pricePerPack")}</th>
              <th scope="col" className="w-[11%] break-words px-1 py-2 text-right sm:w-[10%] sm:px-2 md:px-3 2xl:px-4">{t("settings.unitsPerPack")}</th>
              <th scope="col" className="w-[16%] break-words px-1 py-2 text-right sm:w-[15%] sm:px-2 md:px-3 2xl:w-[16%] 2xl:px-4">{t("settings.costPerUnit")}</th>
              <th scope="col" className="w-[27%] break-words px-1 py-2 sm:px-2 md:w-[25%] md:px-3 2xl:w-[28%] 2xl:px-4">{t("accessories.actions")}</th>
            </tr>
          </thead>
          {filtered.map((item, index) => <tbody key={item.id}
            className={`${index % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/70 dark:bg-slate-900/20"} divide-y divide-slate-100 dark:divide-slate-700`}>
            <tr className="transition-colors hover:bg-orange-50/60 dark:hover:bg-slate-700/40">
              <th scope="row" className="min-w-0 px-1 py-2 text-left font-medium sm:px-2 md:px-3 2xl:px-4">
                <p className="break-words text-xs font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">{item.name}</p>
                {renderItemId(item)}
              </th>
              <td className="px-1 py-2 text-center sm:px-2 md:px-3 2xl:px-4">
                <span className={`inline-flex max-w-full flex-wrap justify-center gap-x-1 rounded-full px-1.5 py-1 text-[10px] leading-tight sm:px-2 sm:text-xs ${item.stockQuantity ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>
                  <span>{item.stockQuantity}</span><span>{t("extra.unit")}</span>
                </span>
              </td>
              <td className="break-all px-1 py-2 text-right tabular-nums sm:px-2 md:px-3 2xl:px-4">{money(item.pricePerPack)}</td>
              <td className="break-all px-1 py-2 text-right tabular-nums sm:px-2 md:px-3 2xl:px-4">{item.unitsPerPack}</td>
              <td className="break-all px-1 py-2 text-right font-semibold tabular-nums sm:px-2 md:px-3 2xl:px-4">{money(item.pricePerPack / item.unitsPerPack)}</td>
              <td className="px-1 py-2 align-middle sm:px-2 md:px-3 2xl:px-4">
                {renderItemActions(item, true, true)}
              </td>
            </tr>
          </tbody>)}
        </table>
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{item.name}</h2>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${item.stockQuantity ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>{item.stockQuantity} {t("extra.unit")}</span></div>
          {renderItemId(item)}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">{t("settings.pricePerPack")}</dt><dd className="mt-1 font-medium">{money(item.pricePerPack)}</dd></div>
            <div><dt className="text-xs text-slate-500">{t("settings.unitsPerPack")}</dt><dd className="mt-1 font-medium">{item.unitsPerPack}</dd></div>
            <div className="col-span-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50"><dt className="text-xs text-slate-500">{t("settings.costPerUnit")}</dt><dd className="font-semibold">{money(item.pricePerPack / item.unitsPerPack)}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">{renderItemActions(item)}</div>
          {renderStockHistory(item)}
        </article>)}
      </div>
    )}
    {actionMenuItem && actionMenuPosition && typeof document !== "undefined" && createPortal(renderActionMenu(actionMenuItem), document.body)}
    {!filtered.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{t("accessories.noMatches")}</p>}
    <p className="text-xs text-slate-500">{t("accessories.historyLimit")}</p>
  </div>;
}
