"use client";

import { useState, type FormEvent } from "react";
import type { ProductType } from "@/lib/types";
import { useLocale } from "@/lib/locale";

export function ProductsManager({ initialProductTypes, prints, canEdit }: {
  initialProductTypes: ProductType[];
  prints: { id: string; name: string; thumbnailBase64: string | null }[];
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [productTypes, setProductTypes] = useState(initialProductTypes);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [generated, setGenerated] = useState<Record<string, string[]>>({});
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
      setGenerated((current) => ({ ...current, [product.id]: body.serials }));
      setProductTypes((current) => current.map((item) => item.id === product.id
        ? { ...item, nextNumber: item.nextNumber + body.serials.length }
        : item));
      setMessage({ error: false, text: t("products.serialsCreated") });
    } catch (error) {
      displayError(error, "products.error.generate");
    } finally {
      setBusy(null);
    }
  }

  function downloadCsv(product: ProductType, serials: string[]) {
    const csv = `serialNumber\r\n${serials.map((serial) => `"${serial.replace(/"/g, '""')}"`).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${product.name.replace(/[^\w.-]+/g, "_")}-seriennummern.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {canEdit && <form onSubmit={createProductType} encType="multipart/form-data" className={`${cardClass} grid gap-4 md:grid-cols-2`}>
        <h2 className="text-lg font-semibold md:col-span-2">{t("products.addType")}</h2>
        <label className="text-sm">{t("products.name")}
          <input name="name" required maxLength={100} className={inputClass} />
        </label>
        <label className="text-sm">{t("products.file")}
          <input name="file" type="file" accept=".3mf" required className={inputClass} />
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
        : <div className="grid gap-4 lg:grid-cols-2">
          {productTypes.map((product) => {
            const serials = generated[product.id] ?? [];
            const printImage = prints.find((print) => print.id === product.linkedPrintId)?.thumbnailBase64;
            const image = product.imageMode === "custom" ? product.imageBase64
              : product.imageMode === "print" ? printImage : null;
            return <section key={product.id} className={`${cardClass} flex flex-col gap-4`}>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{product.name}</h2>
                <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{product.fileName}</p>
              </div>
              {image
                ? <img src={image} alt={product.name} className="h-48 w-full rounded-lg bg-slate-50 object-contain dark:bg-slate-900" />
                : <div className="flex h-32 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  {t("products.imageNone")}
                </div>}
              {product.linkedPrintId && <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("products.linkedPrint")}: {prints.find((print) => print.id === product.linkedPrintId)?.name ?? t("products.linkedPrintUnavailable")}
              </p>}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500 dark:text-slate-400">{t("products.prefix")}</dt><dd className="font-mono">{product.prefix}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">{t("products.nextNumber")}</dt><dd className="font-mono">{product.nextNumber}</dd></div>
              </dl>
              <a href={`/api/products/${product.id}/file`} className="self-start text-sm text-orange-700 hover:underline dark:text-orange-400">
                {t("products.downloadFile")}
              </a>
              {canEdit && <form onSubmit={(event) => void saveAppearance(event, product)}
                encType="multipart/form-data" className="grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                <h3 className="text-sm font-medium">{t("products.linkAndImage")}</h3>
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
                <label className="text-sm">{t("products.customImage")}
                  <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} />
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t("products.customImageHelp")}</span>
                </label>
                <button type="submit" disabled={appearanceBusy !== null}
                  className="justify-self-start rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 disabled:opacity-50">
                  {appearanceBusy === product.id ? t("products.saving") : t("products.saveAppearance")}
                </button>
              </form>}
              {canEdit && <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
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
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                  {busy === product.id ? t("products.generating") : t("products.generate")}
                </button>
              </div>}
              {serials.length > 0 && <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{t("products.generatedSerials")}</h3>
                  <button type="button" onClick={() => downloadCsv(product, serials)}
                    className="text-sm text-orange-700 hover:underline dark:text-orange-400">{t("products.downloadCsv")}</button>
                </div>
                <p className="break-all font-mono text-sm">{serials.join(", ")}</p>
              </div>}
            </section>;
          })}
        </div>}
    </div>
  );
}
