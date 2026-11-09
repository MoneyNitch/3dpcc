"use client";

import { useState, type FormEvent } from "react";
import type { ProductType } from "@/lib/types";
import { useLocale } from "@/lib/locale";
import { getIntlLocale } from "@/lib/i18n";
import Link from "next/link";
import Image from "next/image";

export function ProductsManager({ initialProductTypes, prints, orders, canAssignOrders, canEdit, detailView = false }: {
  initialProductTypes: ProductType[];
  prints: { id: string; name: string; thumbnailBase64: string | null }[];
  orders: {
    id: string;
    customerName: string;
    createdAt: string;
    deliveredAt: string | null;
    items: { printId: string; quantity: number }[];
  }[];
  canAssignOrders: boolean;
  canEdit: boolean;
  detailView?: boolean;
}) {
  const { t, lang } = useLocale();
  const [productTypes, setProductTypes] = useState(initialProductTypes);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [serialSearch, setSerialSearch] = useState<Record<string, string>>({});
  const [serialLimit, setSerialLimit] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const cardClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800";

  function displayError(error: unknown, fallback: string) {
    const key = error instanceof Error ? error.message : fallback;
    setMessage({ error: true, text: t(key) });
  }

  async function createProductType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy("create");
    setMessage(null);
    try {
      const response = await fetch("/api/products", { method: "POST", body: new FormData(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "products.error.save");
      setProductTypes((current) => [...current, body.productType]);
      form.reset();
      setShowCreateForm(false);
      setMessage({ error: false, text: t("products.saved") });
    } catch (error) {
      displayError(error, "products.error.save");
    } finally {
      setBusy(null);
    }
  }

  async function saveAppearance(event: FormEvent<HTMLFormElement>, product: ProductType) {
    event.preventDefault();
    const form = event.currentTarget;
    setAppearanceBusy(product.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        body: new FormData(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "products.error.saveAppearance");
      setProductTypes((current) => current.map((item) =>
        item.id === product.id ? body.productType : item));
      setMessage({ error: false, text: t("products.appearanceSaved") });
    } catch (error) {
      displayError(error, "products.error.saveAppearance");
    } finally {
      setAppearanceBusy(null);
    }
  }

  async function assignSerial(product: ProductType, serialNumber: string, orderId: string | null) {
    setAppearanceBusy(`${product.id}:${serialNumber}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${product.id}/serials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber, orderId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "products.error.assignment");
      setProductTypes((current) => current.map((item) => item.id === product.id
        ? { ...item, serialNumbers: item.serialNumbers.map((serial) =>
          serial.serialNumber === serialNumber ? { ...serial, orderId } : serial) }
        : item));
      setMessage({ error: false, text: t("products.assignmentSaved") });
    } catch (error) {
      displayError(error, "products.error.assignment");
    } finally {
      setAppearanceBusy(null);
    }
  }

  async function generateSerials(product: ProductType) {
    const quantity = quantities[product.id] ?? 1;
    setBusy(product.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${product.id}/serials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "products.error.generate");
      if (!body.productType) throw new Error("products.error.generate");
      setProductTypes((current) => current.map((item) =>
        item.id === product.id ? body.productType : item));
      setMessage({ error: false, text: t("products.serialsCreated") });
    } catch (error) {
      displayError(error, "products.error.generate");
    } finally {
      setBusy(null);
    }
  }

  function downloadCsv(product: ProductType) {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const rows = product.serialNumbers.map((serial) => {
      const order = serial.orderId ? orderById.get(serial.orderId) : null;
      return [
        serial.serialNumber,
        order?.customerName ?? "",
        order ? `ORD-${order.id.slice(0, 8).toUpperCase()}` : "",
        order?.createdAt ?? "",
        order?.deliveredAt ?? "",
      ].map(escape).join(",");
    });
    const csv = [
      [
        t("products.serialNumber"),
        t("products.customerOrder"),
        t("orders.orderId"),
        t("products.purchaseDate"),
        t("products.deliveryDate"),
      ].map(escape).join(","),
      ...rows,
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${product.name.replace(/[^\w.-]+/g, "_")}-seriennummern.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const normalizedProductSearch = productSearch.trim().toLocaleLowerCase();
  const printNames = new Map(prints.map((print) => [print.id, print.name]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const visibleProducts = productTypes.filter((product) => {
    if (!normalizedProductSearch) return true;
    const linkedPrintName = product.linkedPrintId ? printNames.get(product.linkedPrintId) ?? "" : "";
    const assignedCustomers = product.serialNumbers.flatMap((serial) => {
      const order = serial.orderId ? orderById.get(serial.orderId) : undefined;
      return order ? [order.customerName] : [];
    });
    return [
      product.name,
      product.fileName,
      product.prefix,
      linkedPrintName,
      ...product.serialNumbers.map((serial) => serial.serialNumber),
      ...assignedCustomers,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedProductSearch));
  });

  return (
    <div className="flex flex-col gap-6">
      {!detailView && <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("products.searchProducts")}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)}
            placeholder={t("products.searchProducts")}
            className={`${inputClass} mt-0 pl-10`} />
        </label>
        <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
          {t("products.productCount", { count: visibleProducts.length })}
        </span>
        {canEdit && <button type="button" onClick={() => setShowCreateForm((current) => !current)}
          className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700">
          {showCreateForm ? t("orders.cancel") : `+ ${t("products.addType")}`}
        </button>}
      </div>}

      {canEdit && !detailView && showCreateForm && <form onSubmit={createProductType} encType="multipart/form-data" className={`${cardClass} grid gap-4 md:grid-cols-2`}>
        <h2 className="text-lg font-semibold md:col-span-2">{t("products.addType")}</h2>
        <label className="text-sm">{t("products.name")}
          <input name="name" required maxLength={100} className={inputClass} />
        </label>
        <label className="text-sm">{t("products.file")}
          <input name="file" type="file" accept=".3mf" className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t("products.fileHelp")}</span>
        </label>
        <label className="text-sm">{t("products.prefix")}
          <input name="prefix" required minLength={1} maxLength={30} pattern="[A-Za-z0-9._-]+" defaultValue="PROD-" className={inputClass} />
        </label>
        <label className="text-sm">{t("products.digits")}
          <input name="digits" type="number" min={1} max={12} step={1} defaultValue={5} required className={inputClass} />
        </label>
        <label className="text-sm">{t("products.linkedPrint")}
          <select name="linkedPrintId" defaultValue="" className={inputClass}>
            <option value="">{t("products.noLinkedPrint")}</option>
            {prints.map((print) => <option key={print.id} value={print.id}>{print.name}</option>)}
          </select>
        </label>
        <label className="text-sm">{t("products.imageMode")}
          <select name="imageMode" defaultValue="none" className={inputClass}>
            <option value="print">{t("products.imageFromPrint")}</option>
            <option value="custom">{t("products.imageCustom")}</option>
            <option value="none">{t("products.imageNone")}</option>
          </select>
        </label>
        <label className="text-sm md:col-span-2">{t("products.customImage")}
          <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t("products.customImageHelp")}</span>
        </label>
        <div className="md:col-span-2">
          <button type="submit" disabled={busy !== null}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
            {busy === "create" ? t("products.saving") : t("products.addType")}
          </button>
        </div>
      </form>}

      {message && <p role="status" className={message.error ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-green-700 dark:text-green-400"}>
        {message.text}
      </p>}

      {productTypes.length === 0
        ? <p className={`${cardClass} text-sm text-slate-500 dark:text-slate-400`}>{t("products.empty")}</p>
        : !detailView && visibleProducts.length === 0
          ? <p className={`${cardClass} text-sm text-slate-500 dark:text-slate-400`}>{t("products.noProductMatches")}</p>
        : detailView
          ? <div className="flex flex-col gap-4">
          <Link href="/products" className="self-start rounded-md text-sm text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-400">
            {t("products.backToList")}
          </Link>
          {productTypes.map((product) => {
            const search = (serialSearch[product.id] ?? "").trim().toLowerCase();
            const matchingSerials = product.serialNumbers.filter((serial) =>
              serial.serialNumber.toLowerCase().includes(search) ||
              (serial.orderId && orders.find((order) => order.id === serial.orderId)?.customerName.toLowerCase().includes(search)));
            const serials = matchingSerials.slice(0, serialLimit[product.id] ?? 100);
            const orderById = new Map(orders.map((order) => [order.id, order]));
            const matchingOrders = orders.filter((order) =>
              product.linkedPrintId && order.items.some((item) => item.printId === product.linkedPrintId));
            const printImage = prints.find((print) => print.id === product.linkedPrintId)?.thumbnailBase64;
            const image = product.imageMode === "custom" ? product.imageBase64
              : product.imageMode === "print" ? printImage : null;
            const assignedSerialCount = product.serialNumbers.filter((serial) => serial.orderId !== null).length;
            const linkedPrintName = prints.find((print) => print.id === product.linkedPrintId)?.name;
            return <div key={product.id} className="flex flex-col gap-5">
              <section className={`${cardClass} overflow-hidden !p-0`}>
                <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="flex min-h-56 items-center justify-center bg-slate-50 p-5 dark:bg-slate-900 sm:min-h-72">
                    {image
                      ? <Image src={image} alt={product.name} width={800} height={600} unoptimized
                        className="max-h-80 w-full rounded-xl object-contain" />
                      : <span className="text-sm text-slate-500 dark:text-slate-400">{t("products.imageNone")}</span>}
                  </div>
                  <div className="flex flex-col gap-5 p-5 sm:p-7">
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{product.name}</h1>
                      {product.fileName && <p className="mt-2 break-all text-sm text-slate-500 dark:text-slate-400">{product.fileName}</p>}
                    </div>
                    <dl className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t("products.serialCount")}</dt>
                        <dd className="mt-1 text-xl font-semibold">{product.serialNumbers.length}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t("products.assignedSerialCount")}</dt>
                        <dd className="mt-1 text-xl font-semibold">{assignedSerialCount}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t("products.prefix")}</dt>
                        <dd className="mt-1 break-all font-mono text-sm">{product.prefix}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t("products.nextNumber")}</dt>
                        <dd className="mt-1 font-mono text-sm">{product.nextNumber}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
                      <p className="min-w-0 text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{t("products.linkedPrint")}: </span>
                        {product.linkedPrintId
                          ? linkedPrintName ?? t("products.linkedPrintUnavailable")
                          : t("products.noLinkedPrint")}
                      </p>
                      {product.fileName && <a href={`/api/products/${product.id}/file`}
                        className="shrink-0 font-medium text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-400">
                        {t("products.downloadFile")}
                      </a>}
                    </div>
                  </div>
                </div>
              </section>

              {canEdit && <section className={`${cardClass} flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`}>
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t("products.generate")}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t("products.nextNumber")}: <span className="font-mono">{product.prefix}{String(product.nextNumber).padStart(product.digits, "0")}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm">{t("products.quantity")}
                    <input type="number" min={1} max={1000} step={1} value={quantities[product.id] ?? 1}
                      onChange={(event) => setQuantities((current) => ({
                        ...current, [product.id]: event.target.value === "" ? 0 : event.target.valueAsNumber,
                      }))} className={`${inputClass} w-28`} />
                  </label>
                  <button type="button" disabled={busy !== null ||
                    !Number.isInteger(quantities[product.id] ?? 1) ||
                    (quantities[product.id] ?? 1) < 1 ||
                    (quantities[product.id] ?? 1) > 1000}
                    onClick={() => void generateSerials(product)}
                    className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy === product.id ? t("products.generating") : t("products.generate")}
                  </button>
                </div>
              </section>}

              {canEdit && <details className={`${cardClass} group !p-0`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-medium marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:p-5">
                  <span>{t("products.linkAndImage")}</span>
                  <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400">⌄</span>
                </summary>
                <form onSubmit={(event) => void saveAppearance(event, product)} encType="multipart/form-data"
                  className="grid gap-4 border-t border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-2 sm:p-5">
                  <label className="text-sm">{t("products.linkedPrint")}
                    <select name="linkedPrintId" defaultValue={product.linkedPrintId ?? ""} className={inputClass}>
                      <option value="">{t("products.noLinkedPrint")}</option>
                      {prints.map((print) => <option key={print.id} value={print.id}>{print.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">{t("products.imageMode")}
                    <select name="imageMode" defaultValue={product.imageMode} className={inputClass}>
                      <option value="print">{t("products.imageFromPrint")}</option>
                      <option value="custom">{t("products.imageCustom")}</option>
                      <option value="none">{t("products.imageNone")}</option>
                    </select>
                  </label>
                  <label className="text-sm sm:col-span-2">{t("products.customImage")}
                    <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} />
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t("products.customImageHelp")}</span>
                  </label>
                  <button type="submit" disabled={appearanceBusy !== null}
                    className="justify-self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-600 dark:hover:bg-slate-700 disabled:opacity-50 sm:col-span-2">
                    {appearanceBusy === product.id ? t("products.saving") : t("products.saveAppearance")}
                  </button>
                </form>
              </details>}

              <section className={`${cardClass} flex flex-col gap-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t("products.generatedSerials")}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {t("products.serialCount")}: {product.serialNumbers.length}
                    </p>
                  </div>
                  {product.serialNumbers.length > 0 && <button type="button" onClick={() => downloadCsv(product)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                    {t("products.downloadCsv")}
                  </button>}
                </div>
                {product.serialNumbers.length > 0
                  ? <>
                    <label className="relative block max-w-md">
                      <span className="sr-only">{t("products.searchSerial")}</span>
                      <input type="search" value={serialSearch[product.id] ?? ""}
                        onChange={(event) => {
                          setSerialSearch((current) => ({ ...current, [product.id]: event.target.value }));
                          setSerialLimit((current) => ({ ...current, [product.id]: 100 }));
                        }}
                        placeholder={t("products.searchSerial")} className={inputClass} />
                    </label>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="p-3">{t("products.serialNumber")}</th>
                            <th className="p-3">{t("products.customerOrder")}</th>
                            <th className="p-3">{t("products.purchaseDate")}</th>
                            <th className="p-3">{t("products.deliveryDate")}</th>
                            {canEdit && <th className="p-3">{t("products.assignToOrder")}</th>}
                          </tr>
                        </thead>
                        <tbody>{serials.map((serial) => {
                          const order = serial.orderId ? orderById.get(serial.orderId) : undefined;
                          return <tr key={serial.serialNumber} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="whitespace-nowrap p-3 font-mono">{serial.serialNumber}</td>
                            <td className="p-3">{order
                              ? <span>{order.customerName}<br /><span className="text-slate-500">ORD-{order.id.slice(0, 8).toUpperCase()}</span></span>
                              : serial.orderId ? t("products.orderUnavailable") : t("products.unassigned")}</td>
                            <td className="whitespace-nowrap p-3">{order ? new Date(order.createdAt).toLocaleDateString(getIntlLocale(lang)) : "—"}</td>
                            <td className="whitespace-nowrap p-3">{order?.deliveredAt
                              ? new Date(order.deliveredAt).toLocaleDateString(getIntlLocale(lang))
                              : order ? t("products.notDelivered") : "—"}</td>
                            {canEdit && <td className="min-w-52 p-3">
                              <select value={serial.orderId ?? ""}
                                disabled={!canAssignOrders || appearanceBusy !== null}
                                onChange={(event) => void assignSerial(product, serial.serialNumber, event.target.value || null)}
                                className={inputClass}>
                                <option value="">{t("products.unassigned")}</option>
                                {matchingOrders.map((candidate) => {
                                  const line = candidate.items.find((item) => item.printId === product.linkedPrintId);
                                  const assigned = product.serialNumbers.filter((entry) => entry.orderId === candidate.id).length;
                                  const full = assigned >= (line?.quantity ?? 0) && serial.orderId !== candidate.id;
                                  return <option key={candidate.id} value={candidate.id} disabled={full}>
                                    ORD-{candidate.id.slice(0, 8).toUpperCase()} · {candidate.customerName} ({assigned}/{line?.quantity ?? 0})
                                  </option>;
                                })}
                              </select>
                            </td>}
                          </tr>;
                        })}</tbody>
                      </table>
                    </div>
                    {matchingSerials.length > serials.length && <button type="button"
                      onClick={() => setSerialLimit((current) => ({ ...current, [product.id]: (current[product.id] ?? 100) + 100 }))}
                      className="self-start text-sm text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-400">
                      {t("products.showMore", { count: Math.min(100, matchingSerials.length - serials.length) })}
                    </button>}
                    {matchingSerials.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t("products.noSerialMatches")}</p>}
                  </>
                  : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">{t("products.noSerials")}</p>}
              </section>
            </div>;
          })}
          </div>
          : <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
            {visibleProducts.map((product) => {
              const printImage = prints.find((print) => print.id === product.linkedPrintId)?.thumbnailBase64;
              const image = product.imageMode === "custom" ? product.imageBase64
                : product.imageMode === "print" ? printImage : null;
              const linkedPrintName = prints.find((print) => print.id === product.linkedPrintId)?.name;
              const assignedSerialCount = product.serialNumbers.filter((serial) => serial.orderId !== null).length;
              return <li key={product.id}>
                <Link href={`/products/${product.id}`}
                  className="group flex items-center gap-4 p-4 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-600 dark:hover:bg-slate-700/40 sm:gap-5 sm:px-5">
                  {image
                    ? <Image src={image} alt="" width={72} height={72} unoptimized
                      className="h-16 w-16 shrink-0 rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 sm:h-[72px] sm:w-[72px]" />
                    : <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-900 dark:text-slate-500 sm:h-[72px] sm:w-[72px]">
                      —
                    </div>}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{product.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        {product.prefix}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-sm text-slate-500 dark:text-slate-400">
                      {product.linkedPrintId ? linkedPrintName ?? t("products.linkedPrintUnavailable") : t("products.noLinkedPrint")}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-700">
                      {t("products.serialCount")}: {product.serialNumbers.length}
                    </span>
                    <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                      {t("products.assignedSerialCount")}: {assignedSerialCount}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-orange-700 group-hover:underline dark:text-orange-400">
                    <span className="hidden sm:inline">{t("products.viewDetails")}</span>
                    <span aria-hidden="true" className="sm:hidden">→</span>
                  </span>
                </Link>
              </li>;
            })}
          </ul>}
    </div>
  );
}
