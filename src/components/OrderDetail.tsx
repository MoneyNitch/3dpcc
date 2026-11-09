"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { getIntlLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/locale";
import {
  calculateOrderSnapshot, orderCalculationMatchesItems,
  type OrderCalculationInputs, type OrderCalculationSnapshot,
} from "@/lib/orderCalculation";
import type { DocumentNumberingSettings, InvoiceTemplate, OrderPriority, OrderStatus, PrintOrder, ProductType } from "@/lib/types";
import { OrderInvoiceExport } from "./OrderInvoiceExport";
import { AccessoryStockAction } from "./AccessoryStockAction";
import type { OrderQuickUpdate } from "@/lib/orders";

const statuses: OrderStatus[] = ["open", "in_progress", "ready", "completed", "cancelled"];
const priorities: OrderPriority[] = ["low", "normal", "high"];
const inputFields: { key: keyof OrderCalculationInputs; label: string; max: number }[] = [
  { key: "laborMinutes", label: "cost.laborMinutes", max: 1_000_000_000 },
  { key: "packagingCost", label: "cost.packaging", max: 1_000_000_000 },
  { key: "shippingCost", label: "orders.shipping", max: 1_000_000_000 },
  { key: "marginPercent", label: "orders.marginPercent", max: 100 },
  { key: "discountPercent", label: "orders.discountPercent", max: 100 },
  { key: "vatPercent", label: "orders.taxPercent", max: 100 },
];
const itemFields = [
  { key: "materialCost", label: "cost.material" },
  { key: "extraCost", label: "orders.additionalCosts" },
  { key: "energyCost", label: "cost.electricity" },
  { key: "machineCost", label: "cost.machine" },
] as const;
const totalFields = [
  { key: "materialTotal", label: "cost.material" },
  { key: "extraCostsTotal", label: "orders.additionalCosts" },
  { key: "energyCost", label: "cost.electricity" },
  { key: "machineCost", label: "cost.machine" },
  { key: "laborCost", label: "cost.labor" },
  { key: "packagingCost", label: "cost.packaging" },
  { key: "shippingCost", label: "orders.shipping" },
  { key: "subtotal", label: "cost.subtotal" },
  { key: "marginAmount", label: "cost.margin" },
  { key: "quantityDiscountAmount", label: "orders.discountTotal" },
  { key: "vatAmount", label: "cost.tax" },
] as const;

function DecimalInput({ value, max, className, onChange }: {
  value: number;
  max: number;
  className: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={0} max={max} step="0.01" required className={className}
      value={draft ?? value.toFixed(2)}
      onFocus={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = event.target.valueAsNumber;
        if (Number.isFinite(next)) onChange(next);
      }} />
  );
}

export function OrderDetail({ initialOrder, initialSnapshot, canEdit, canManageSerials, hasAccessoryStockItems, invoiceTemplates, invoiceNumbering, productTypes, orderPrints, serialNumbers }: {
  initialOrder: PrintOrder;
  initialSnapshot: OrderCalculationSnapshot;
  canEdit: boolean;
  canManageSerials: boolean;
  hasAccessoryStockItems: boolean;
  invoiceTemplates: InvoiceTemplate[];
  invoiceNumbering: DocumentNumberingSettings;
  productTypes: ProductType[];
  orderPrints: { id: string; name: string; quantity: number }[];
  serialNumbers: { serialNumber: string; productName: string }[];
}) {
  const { t, lang } = useLocale();
  const [order, setOrder] = useState(initialOrder);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [catalogProducts, setCatalogProducts] = useState(productTypes);
  const [assignedSerials, setAssignedSerials] = useState(serialNumbers);
  const [serialProductId, setSerialProductId] = useState(productTypes[0]?.id ?? "");
  const [selectedSerialNumber, setSelectedSerialNumber] = useState("");
  const [serialQuantity, setSerialQuantity] = useState(1);
  const [showSerialManager, setShowSerialManager] = useState(false);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [newProductPrintId, setNewProductPrintId] = useState(orderPrints[0]?.id ?? "");
  const [serialBusy, setSerialBusy] = useState(false);
  const [workflow, setWorkflow] = useState({
    paymentStatus: initialOrder.paymentStatus ?? "unpaid",
    paymentMethod: initialOrder.paymentMethod ?? "",
    paidAmount: initialOrder.paidAmount ?? 0,
    paymentCurrency: initialOrder.paymentCurrency ?? initialSnapshot.currency,
    shippingStatus: initialOrder.shippingStatus ?? "not_shipped",
    shippingMethod: initialOrder.shippingMethod ?? "",
    trackingNumber: initialOrder.trackingNumber ?? "",
  });
  const result = calculateOrderSnapshot(snapshot);
  const outdated = !orderCalculationMatchesItems(order, snapshot);
  const money = (value: number) => new Intl.NumberFormat(getIntlLocale(lang), {
    style: "currency", currency: snapshot.currency,
  }).format(value);
  const date = (value: string) => new Date(value).toLocaleString(getIntlLocale(lang));
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
  const cardClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800";
  const selectedProduct = catalogProducts.find((product) => product.id === serialProductId);
  const availableSerials = selectedProduct?.serialNumbers.filter((serial) => serial.orderId === null) ?? [];
  const newProductPrint = orderPrints.find((print) => print.id === newProductPrintId);

  function showSerialError(error: unknown, fallback: string) {
    const key = error instanceof Error ? error.message : fallback;
    setMessage({ error: true, text: t(key) });
  }

  async function assignSerialToOrder() {
    if (!selectedProduct || !selectedSerialNumber) return;
    setSerialBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${selectedProduct.id}/serials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: selectedSerialNumber, orderId: order.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "products.error.assignment");
      setCatalogProducts((current) => current.map((product) => product.id === selectedProduct.id
        ? { ...product, serialNumbers: product.serialNumbers.map((serial) =>
          serial.serialNumber === selectedSerialNumber ? { ...serial, orderId: order.id } : serial) }
        : product));
      setAssignedSerials((current) => [...current, {
        serialNumber: selectedSerialNumber, productName: selectedProduct.name,
      }]);
      setSelectedSerialNumber("");
      setMessage({ error: false, text: t("products.assignmentSaved") });
    } catch (error) {
      showSerialError(error, "products.error.assignment");
    } finally {
      setSerialBusy(false);
    }
  }

  async function generateOrderSerials(product: ProductType, quantity: number) {
    setSerialBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${product.id}/serials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, orderId: order.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "products.error.generate");
      if (!body.productType || !Array.isArray(body.serials)) throw new Error("products.error.generate");
      setCatalogProducts((current) => current.map((item) =>
        item.id === product.id ? body.productType : item));
      setAssignedSerials((current) => [
        ...current,
        ...body.serials.map((serialNumber: string) => ({
          serialNumber, productName: product.name,
        })),
      ]);
      setMessage({ error: false, text: t("products.serialsCreated") });
    } catch (error) {
      showSerialError(error, "products.error.generate");
    } finally {
      setSerialBusy(false);
    }
  }

  async function createProductAndAssignSerials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const quantity = Number(formData.get("quantity"));
    formData.delete("quantity");
    setSerialBusy(true);
    setMessage(null);
    try {
      const createResponse = await fetch("/api/products", { method: "POST", body: formData });
      const createBody = await createResponse.json();
      if (!createResponse.ok) throw new Error(createBody.error ?? "products.error.save");
      const createdProduct = createBody.productType as ProductType;
      setCatalogProducts((current) => [...current, createdProduct]);
      setSerialProductId(createdProduct.id);

      const serialResponse = await fetch(`/api/products/${createdProduct.id}/serials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, orderId: order.id }),
      });
      const serialBody = await serialResponse.json();
      setShowCreateProduct(false);
      form.reset();
      if (!serialResponse.ok) {
        setMessage({ error: true, text: t(serialBody.error ?? "products.error.generate") });
        return;
      }
      if (!serialBody.productType || !Array.isArray(serialBody.serials)) {
        throw new Error("products.error.generate");
      }
      setCatalogProducts((current) => current.map((product) =>
        product.id === createdProduct.id ? serialBody.productType : product));
      setAssignedSerials((current) => [
        ...current,
        ...serialBody.serials.map((serialNumber: string) => ({
          serialNumber, productName: createdProduct.name,
        })),
      ]);
      setShowSerialManager(false);
      setMessage({ error: false, text: t("products.serialsCreated") });
    } catch (error) {
      showSerialError(error, "products.error.save");
    } finally {
      setSerialBusy(false);
    }
  }

  async function changeOrder(patch: OrderQuickUpdate) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, expectedUpdatedAt: order.updatedAt }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ? t(body.error) : t("orders.saveFailed"));
      setOrder(body.order);
      setMessage({ error: false, text: t("orders.saved") });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : t("orders.saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function saveCalculation(refresh: boolean) {
    if (refresh && !window.confirm(t("orders.confirmRefresh"))) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/calculate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: order.updatedAt, currency: snapshot.currency, inputs: snapshot.inputs, refresh,
          itemCosts: snapshot.items.map(({ printId, materialCost, extraCost, energyCost, machineCost }) => ({
            printId, materialCost, extraCost, energyCost, machineCost,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("orders.calculationFailed"));
      const updated: PrintOrder = body.order;
      if (!updated.calculation) throw new Error(t("orders.calculationFailed"));
      setOrder(updated);
      setSnapshot(updated.calculation);
      setDirty(false);
      setMessage({ error: false, text: t("orders.calculationSaved") });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : t("orders.calculationFailed") });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCalculation(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/orders" className="self-start text-sm text-orange-700 hover:underline dark:text-orange-400">{t("orders.back")}</Link>
      <header className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">ORD-{order.id.slice(0, 8).toUpperCase()}</h1>
              <span className="text-sm text-slate-500 dark:text-slate-400">{order.customerName}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium dark:bg-slate-700">{t(`orders.status.${order.status}`)}</span>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{t("orders.orderId")}: {order.id}</p>
          </div>
          {canEdit && <div className="flex flex-wrap gap-2">
            <OrderInvoiceExport order={order} templates={invoiceTemplates} numbering={invoiceNumbering}
              disabled={busy || dirty || outdated || !order.calculation} />
            <Link href={`/orders?edit=${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">{t("orders.edit")}</Link>
          </div>}
        </div>
        {canEdit && (dirty || outdated || !order.calculation) && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{t("orders.invoice.saveCalculation")}</p>}
        {canEdit && !invoiceTemplates.length && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{t("orders.invoice.noTemplate")}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">{t("orders.status")}
            <select className={inputClass} value={order.status} disabled={!canEdit || busy}
              onChange={(event) => {
                const status = statuses.find((value) => value === event.target.value);
                if (status) void changeOrder({ status });
              }}>
              {statuses.map((status) => <option key={status} value={status}>{t(`orders.status.${status}`)}</option>)}
            </select>
          </label>
          <label className="text-sm">{t("orders.priority")}
            <select className={inputClass} value={order.priority ?? "normal"} disabled={!canEdit || busy}
              onChange={(event) => {
                const priority = priorities.find((value) => value === event.target.value);
                if (priority) void changeOrder({ priority });
              }}>
              {priorities.map((priority) => <option key={priority} value={priority}>{t(`orders.priority.${priority}`)}</option>)}
            </select>
          </label>
          <div className="text-sm"><p>{t("products.purchaseDate")}</p><p className="mt-2 text-slate-500 dark:text-slate-400">{date(order.createdAt)}</p></div>
          <div className="text-sm"><p>{t("products.deliveryDate")}</p><p className="mt-2 text-slate-500 dark:text-slate-400">{order.deliveredAt ? date(order.deliveredAt) : t("products.notDelivered")}</p></div>
          <div className="text-sm"><p>{t("orders.dueDate")}</p><p className="mt-2 text-slate-500 dark:text-slate-400">
            {order.dueDate ? new Intl.DateTimeFormat(getIntlLocale(lang)).format(new Date(`${order.dueDate}T00:00:00`)) : t("orders.noDueDate")}
          </p></div>
        </div>
        {order.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{order.notes}</p>}
        {order.gcodeAttachment && <a href={`/api/orders/${order.id}/gcode`}
          className="mt-4 inline-block break-all text-sm text-orange-700 hover:underline dark:text-orange-400">
          {t("orders.downloadGcode")}: {order.gcodeAttachment.fileName}
        </a>}
      </header>

      <section className={`${cardClass} grid gap-4 sm:grid-cols-3`} aria-label={t("orders.workflow.title")}>
        {[
          { label: "orders.workflow.payment", value: `orders.payment.${order.paymentStatus ?? "unpaid"}`,
            done: order.paymentStatus === "paid" },
          { label: "orders.workflow.production", value: `orders.status.${order.status}`,
            done: order.status === "ready" || order.status === "completed" },
          { label: "orders.workflow.shipping", value: `orders.shippingStatus.${order.shippingStatus ?? "not_shipped"}`,
            done: order.shippingStatus === "delivered" || order.shippingStatus === "pickup" },
        ].map((step, index) => <div key={step.label} className="flex items-center gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${step.done ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{step.done ? "✓" : index + 1}</span>
          <div><p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t(step.label)}</p><p className="text-sm font-medium">{t(step.value)}</p></div>
        </div>)}
      </section>

      {(canManageSerials || assignedSerials.length > 0) && <section className={`${cardClass} flex flex-col gap-4`}>
        <div>
          <h2 className="text-lg font-semibold">{t("products.orderSerialNumbers")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("products.orderSerialHelp")}</p>
        </div>
        {canManageSerials && <button type="button" onClick={() => setShowSerialManager(true)}
          className="self-start rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
          {t("products.manageOrderSerials")}
        </button>}
        {assignedSerials.length > 0 && <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr><th className="p-2">{t("products.serialNumber")}</th><th className="p-2">{t("products.name")}</th>
                <th className="p-2">{t("products.purchaseDate")}</th><th className="p-2">{t("products.deliveryDate")}</th></tr>
            </thead>
            <tbody>{assignedSerials.map((serial) => <tr key={serial.serialNumber} className="border-t border-slate-200 dark:border-slate-700">
              <td className="p-2 font-mono">{serial.serialNumber}</td><td className="p-2">{serial.productName}</td>
              <td className="whitespace-nowrap p-2">{date(order.createdAt)}</td>
              <td className="whitespace-nowrap p-2">{order.deliveredAt ? date(order.deliveredAt) : t("products.notDelivered")}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {showSerialManager && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !serialBusy) setShowSerialManager(false);
          }}>
          <section role="dialog" aria-modal="true" aria-labelledby="manage-order-serials-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="manage-order-serials-title" className="text-lg font-semibold">{t("products.orderSerialNumbers")}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("products.orderSerialHelp")}</p>
              </div>
              <button type="button" aria-label={t("orders.cancel")} disabled={serialBusy}
                onClick={() => setShowSerialManager(false)}
                className="rounded-lg px-3 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700">
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              {catalogProducts.length > 0
                ? <>
                  <label className="text-sm">{t("products.name")}
                    <select value={serialProductId} onChange={(event) => {
                      setSerialProductId(event.target.value);
                      setSelectedSerialNumber("");
                      setSerialQuantity(1);
                    }} className={inputClass}>
                      {catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <label className="text-sm">{t("products.serialNumber")}
                      <select value={selectedSerialNumber} disabled={!availableSerials.length || serialBusy}
                        onChange={(event) => setSelectedSerialNumber(event.target.value)} className={inputClass}>
                        <option value="">{t("products.selectSerial")}</option>
                        {availableSerials.map((serial) => <option key={serial.serialNumber} value={serial.serialNumber}>
                          {serial.serialNumber}
                        </option>)}
                      </select>
                    </label>
                    <button type="button" disabled={!selectedSerialNumber || serialBusy}
                      onClick={() => void assignSerialToOrder()}
                      className="self-end rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-600">
                      {t("products.assignToOrder")}
                    </button>
                  </div>
                  {selectedProduct && (() => {
                    const line = order.items.find((item) => item.printId === selectedProduct.linkedPrintId);
                    const assignedCount = selectedProduct.serialNumbers.filter((serial) => serial.orderId === order.id).length;
                    const remaining = Math.max(0, (line?.quantity ?? 0) - assignedCount);
                    return <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                      <label className="text-sm">{t("products.quantity")}
                        <input type="number" min={1} max={Math.min(1000, remaining)} step={1} value={serialQuantity}
                          onChange={(event) => setSerialQuantity(event.target.value === "" ? 0 : event.target.valueAsNumber)}
                          className={`${inputClass} w-24`} />
                      </label>
                      <button type="button" disabled={serialBusy || remaining < 1 || !Number.isInteger(serialQuantity) ||
                        serialQuantity < 1 || serialQuantity > remaining}
                        onClick={() => void generateOrderSerials(selectedProduct, serialQuantity)}
                        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                        {t("products.generateAndAssign")}
                      </button>
                    </div>;
                  })()}
                </>
                : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {t("products.noCatalogProduct")}
                </p>}
              <button type="button" onClick={() => setShowCreateProduct(true)}
                disabled={serialBusy || orderPrints.length === 0}
                className="self-start text-sm font-medium text-orange-700 hover:underline disabled:opacity-50 dark:text-orange-400">
                {t("products.createAndAssign")}
              </button>
            </div>
          </section>
        </div>}
        {showCreateProduct && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="create-order-product-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h3 id="create-order-product-title" className="text-lg font-semibold">{t("products.createAndAssign")}</h3>
            <form onSubmit={(event) => void createProductAndAssignSerials(event)} encType="multipart/form-data"
              className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">{t("products.name")}
                <input name="name" required maxLength={100} className={inputClass} />
              </label>
              <label className="text-sm">{t("products.file")}
                <input name="file" type="file" accept=".3mf" className={inputClass} />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t("products.fileHelp")}</span>
              </label>
              <label className="text-sm">{t("products.prefix")}
                <input name="prefix" required minLength={1} maxLength={30} pattern="[A-Za-z0-9._-]+"
                  placeholder="PROD-" className={inputClass} />
              </label>
              <label className="text-sm">{t("products.digits")}
                <input name="digits" type="number" min={1} max={12} step={1} defaultValue={5} required className={inputClass} />
              </label>
              <label className="text-sm">{t("products.linkedPrint")}
                <select name="linkedPrintId" required value={newProductPrintId}
                  onChange={(event) => setNewProductPrintId(event.target.value)} className={inputClass}>
                  {orderPrints.map((print) => <option key={print.id} value={print.id}>{print.name}</option>)}
                </select>
              </label>
              <label className="text-sm">{t("products.quantity")}
                <input name="quantity" type="number" min={1} max={Math.min(1000, newProductPrint?.quantity ?? 1)}
                  step={1} defaultValue={1} required className={inputClass} />
              </label>
              <input type="hidden" name="imageMode" value="none" />
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setShowCreateProduct(false)} disabled={serialBusy}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">
                  {t("orders.cancel")}
                </button>
                <button type="submit" disabled={serialBusy || orderPrints.length === 0}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                  {serialBusy ? t("products.saving") : t("products.createAndAssign")}
                </button>
              </div>
            </form>
          </section>
        </div>}
      </section>}

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("orders.items")} <span className="text-sm font-normal text-slate-500">({order.items.length})</span></h2>
          {canEdit && <Link href={`/orders?edit=${order.id}`} className="rounded-full bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700">{t("orders.editItems")}</Link>}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
              <tr><th className="rounded-l-lg p-3">{t("orders.product")}</th><th className="p-3 text-right">{t("extra.quantity")}</th>
                <th className="p-3 text-right">{t("orders.unitBaseCost")}</th><th className="rounded-r-lg p-3 text-right">{t("orders.positionBaseCost")}</th></tr>
            </thead>
            <tbody>{result.items.map((item) => <tr key={item.printId} className="border-b border-slate-100 dark:border-slate-700">
              <td className="p-3"><Link href={`/prints/${item.printId}`} className="font-medium text-orange-700 hover:underline dark:text-orange-300">{item.printName}</Link></td>
              <td className="p-3 text-right">{item.quantity}</td><td className="whitespace-nowrap p-3 text-right">{money(item.totalPrice / item.quantity)}</td>
              <td className="whitespace-nowrap p-3 text-right font-semibold">{money(item.totalPrice)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("orders.baseCostNote")}</p>
        <dl className="ml-auto mt-4 flex max-w-sm flex-col gap-2 text-sm">
          {[
            { label: "cost.subtotal", value: result.totals.priceBeforeVat - result.totals.quantityDiscountAmount - result.totals.shippingCost },
            { label: "orders.shipping", value: result.totals.shippingCost },
            { label: "cost.tax", value: result.totals.vatAmount },
          ].map((row) => <div key={row.label} className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">{t(row.label)}</dt><dd>{money(row.value)}</dd></div>)}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 font-bold dark:border-slate-700"><dt>{t("cost.totalPrice")}</dt><dd>{money(result.totals.totalPrice)}</dd></div>
        </dl>
        {(dirty || outdated || !order.calculation) && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t("orders.previewTotals")}</p>}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
      <form className={cardClass} onSubmit={(event) => { event.preventDefault(); void changeOrder(workflow); }}>
        <h2 className="text-lg font-semibold">{t("orders.workflow.title")}</h2>
        <fieldset disabled={!canEdit || busy} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">{t("orders.workflow.payment")}
            <select className={inputClass} value={workflow.paymentStatus} onChange={(event) => {
              const status = (["unpaid", "partial", "paid", "refunded"] as const).find((value) => value === event.target.value);
              if (status) setWorkflow((current) => ({ ...current, paymentStatus: status }));
            }}>{(["unpaid", "partial", "paid", "refunded"] as const).map((status) => <option key={status} value={status}>{t(`orders.payment.${status}`)}</option>)}</select>
          </label>
          <label className="text-sm">{t("orders.workflow.paymentMethod")}
            <input className={inputClass} maxLength={100} value={workflow.paymentMethod} onChange={(event) => setWorkflow((current) => ({ ...current, paymentMethod: event.target.value }))} />
          </label>
          <label className="text-sm">{t("orders.workflow.paidAmount")} ({workflow.paymentCurrency})
            <DecimalInput className={inputClass} max={1_000_000_000} value={workflow.paidAmount} onChange={(paidAmount) => setWorkflow((current) => ({ ...current, paidAmount }))} />
          </label>
          <label className="text-sm">{t("orders.workflow.shipping")}
            <select className={inputClass} value={workflow.shippingStatus} onChange={(event) => {
              const status = (["not_shipped", "shipped", "delivered", "pickup"] as const).find((value) => value === event.target.value);
              if (status) setWorkflow((current) => ({ ...current, shippingStatus: status }));
            }}>{(["not_shipped", "shipped", "delivered", "pickup"] as const).map((status) => <option key={status} value={status}>{t(`orders.shippingStatus.${status}`)}</option>)}</select>
          </label>
          <label className="text-sm">{t("orders.workflow.shippingMethod")}
            <input className={inputClass} maxLength={100} value={workflow.shippingMethod} onChange={(event) => setWorkflow((current) => ({ ...current, shippingMethod: event.target.value }))} />
          </label>
          <label className="text-sm">{t("orders.workflow.tracking")}
            <input className={inputClass} maxLength={200} value={workflow.trackingNumber} onChange={(event) => setWorkflow((current) => ({ ...current, trackingNumber: event.target.value }))} />
          </label>
          {canEdit && <button type="submit" className="justify-self-start rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white sm:col-span-2">{t("orders.workflow.save")}</button>}
        </fieldset>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t("orders.workflow.manualNote")}</p>
      </form>
      <section className={cardClass}>
        <h2 className="text-lg font-semibold">{t("orders.customerContact")}</h2>
        <p className="mt-3 font-medium">{order.customerName}</p>
        {order.customerSnapshot && <dl className="mt-3 space-y-3 text-sm">
          {(["email", "phone", "billingAddress", "shippingAddress"] as const).map((field) => order.customerSnapshot?.[field] && <div key={field}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{t(`customers.${field}`)}</dt>
            <dd className="whitespace-pre-wrap break-words">{order.customerSnapshot[field]}</dd>
          </div>)}
        </dl>}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t(order.customerSnapshot ? "customers.snapshotNote" : "customers.noLinkedCustomer")}</p>
        {order.customerId && <Link href="/customers" className="mt-3 inline-block text-sm text-orange-700 hover:underline dark:text-orange-300">{t("customers.manage")}</Link>}
      </section>
      </div>
      <section className={`${cardClass} min-w-0`} aria-labelledby="order-history-heading">
        <h2 id="order-history-heading" className="text-lg font-semibold">{t("orders.history.title")}</h2>
        <ol className="mt-4 flex flex-col gap-3">
          {(order.history ?? [
            { type: "created" as const, at: order.createdAt },
            { type: "updated" as const, at: order.updatedAt },
            ...(order.status === "completed" ? [{ type: "completed" as const, at: order.updatedAt }] : []),
          ]).map((entry, index) => (
            <li key={`${entry.type}:${entry.at}:${index}`} className="flex flex-col gap-1 border-l-2 border-green-200 pl-3 text-sm dark:border-green-900">
              <span className="font-medium">{t(`orders.history.${entry.type}`)}</span>
              <time dateTime={entry.at} className="text-slate-500 dark:text-slate-400">{date(entry.at)}</time>
            </li>
          ))}
        </ol>
      </section>
      </div>

      {message && <p role={message.error ? "alert" : "status"}
        className={`text-sm ${message.error ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{message.text}</p>}
      {hasAccessoryStockItems && (
        <AccessoryStockAction source="order" sourceId={order.id} canBook={canEdit} />
      )}
      <form onSubmit={submit} className={cardClass}>
        <h2 className="text-lg font-semibold">{t("orders.calculationTitle")}</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("orders.independentNote")}</p>
        <p className="mt-2 text-sm font-medium">
          {!order.calculation ? t("orders.unsavedCalculation") : dirty ? t("orders.unsavedChanges") :
            t("orders.savedCalculationAt", { date: date(order.calculation.savedAt) })}
        </p>
        {outdated && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{t("orders.outdatedCalculation")}</p>}
        <fieldset disabled={!canEdit || busy} className="mt-5 flex min-w-0 flex-col gap-4">
          <legend className="text-sm font-medium">{t("orders.unitCosts")}</legend>
          {snapshot.items.map((item, index) => (
            <div key={item.printId} className="min-w-0 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                <Link href={`/prints/${item.printId}`} className="break-all text-orange-700 hover:underline dark:text-orange-400">{item.printName}</Link>
                <span>{item.quantity} × · {money(result.items[index].totalPrice)} ({t("orders.positionBaseCost")})</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {itemFields.map(({ key, label }) => (
                  <label key={key} className="text-sm">{t(label)} ({snapshot.currency})
                    <DecimalInput max={1_000_000_000} className={inputClass} value={item[key]}
                      onChange={(value) => {
                        setSnapshot((current) => ({ ...current, items: current.items.map((entry, itemIndex) =>
                          itemIndex === index ? { ...entry, [key]: value } : entry) }));
                        setDirty(true);
                      }} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inputFields.map(({ key, label, max }) => (
              <label key={key} className="text-sm">{t(label)}
                <DecimalInput max={max} className={inputClass} value={snapshot.inputs[key]}
                  onChange={(value) => {
                    setSnapshot((current) => ({ ...current, inputs: { ...current.inputs, [key]: value } }));
                    setDirty(true);
                  }} />
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t("orders.laborRate", { rate: money(snapshot.laborRatePerHour) })} · {snapshot.currency}
        </p>
        <dl className="mt-5 flex flex-col gap-2 text-sm">
          {totalFields.map(({ key, label }) => <div key={key} className="flex justify-between gap-3">
            <dt>{t(label)}</dt><dd>{key === "quantityDiscountAmount" ? "−" : ""}{money(result.totals[key])}</dd>
          </div>)}
          <div className="flex justify-between gap-3 border-t border-slate-300 pt-3 text-lg font-bold dark:border-slate-600">
            <dt>{t("cost.totalPrice")}</dt><dd>{money(result.totals.totalPrice)}</dd>
          </div>
        </dl>
        {canEdit && <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" disabled={busy || outdated}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {busy ? t("orders.saving") : t("cost.save")}
          </button>
          <button type="button" disabled={busy} onClick={() => void saveCalculation(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-600">
            {t("orders.refreshCalculation")}
          </button>
        </div>}
      </form>
    </div>
  );
}
