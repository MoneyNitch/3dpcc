import { calculateOrderSnapshot, orderCalculationMatchesItems, orderCalculationSnapshotSchema } from "./orderCalculation";
import { allocateInvoiceAmounts, renderInvoiceHtml } from "./invoice";
import { getIntlLocale, translate } from "./i18n";
import { ApiError } from "./api/http";
import { formatDuration } from "./format";
import type { AppSettings, CostResult, PrintOrder } from "./types";

export interface OrderInvoiceDetails {
  templateId: string;
  number: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerAddress: string;
  showQuantityDiscount: boolean;
}

export async function renderOrderInvoice(order: PrintOrder, settings: AppSettings, details: OrderInvoiceDetails,
  metadata: { weightGrams: number; durationSeconds: number }): Promise<string> {
  const parsed = orderCalculationSnapshotSchema.safeParse(order.calculation);
  if (!parsed.success || !orderCalculationMatchesItems(order, parsed.data)) {
    throw new ApiError(409, "calculation", "orders.invoice.saveCalculation");
  }
  const snapshot = parsed.data;
  const template = settings.invoiceTemplates.find((entry) => entry.id === details.templateId);
  if (!template) throw new ApiError(404, "template", "orders.invoice.noTemplate");
  const calculation = calculateOrderSnapshot(snapshot);
  const result: CostResult = {
    ...calculation.totals,
    materialLines: [],
    quantityDiscountPercent: snapshot.inputs.discountPercent,
    pricePerGram: 0,
  };
  const t = (key: string) => translate(settings.general.language, key, undefined, settings.customLanguagePacks);
  const locale = getIntlLocale(settings.general.language);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: snapshot.currency }).format(value);
  const date = (value: string) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" }) : "";
  const amounts = allocateInvoiceAmounts(result.totalPrice, calculation.items.map((item) => item.totalPrice));
  const values = {
    ...template.customValues,
    companyName: settings.general.companyName || template.customValues?.companyName || "",
    companyAddress: settings.general.companyAddress || template.customValues?.companyAddress || "",
    companyEmail: settings.general.companyEmail || template.customValues?.companyEmail || "",
    companyPhone: settings.general.companyPhone || template.customValues?.companyPhone || "",
    companyTaxId: settings.general.companyTaxId || template.customValues?.companyTaxId || "",
    companyIban: settings.general.companyIban || template.customValues?.companyIban || "",
    customerName: details.customerName, customerAddress: details.customerAddress,
    invoiceNumber: details.number, invoiceDate: date(details.date), dueDate: date(details.dueDate),
    paymentTerms: template.customValues?.paymentTerms ?? "",
    printName: `ORD-${order.id.slice(0, 8).toUpperCase()}`,
    printWeight: `${metadata.weightGrams.toFixed(1)} g`, printTime: formatDuration(metadata.durationSeconds),
    quantity: String(snapshot.items.reduce((total, item) => total + item.quantity, 0)),
    subtotal: money(result.subtotal), margin: money(result.marginAmount), tax: money(result.vatAmount),
    vatPercent: String(snapshot.inputs.vatPercent), total: money(result.totalPrice),
  };
  return renderInvoiceHtml({
    template: { ...template, elements: template.elements.map((element) => ({
      ...element, lineLabels: { margin: t("cost.margin"), tax: `${t("cost.tax")} ({{vatPercent}} %)`, ...element.lineLabels },
    })) },
    values, result, money, title: `${t("invoice.documentTitle")} ${details.number}`,
    positionItems: calculation.items.map((item, index) => ({
      name: item.printName, quantity: item.quantity, unitPrice: amounts[index] / item.quantity, amount: amounts[index],
    })),
    positionLabels: {
      item: t("invoice.positionItem"), quantity: t("invoice.positionQuantity"),
      unitPrice: t("invoice.positionUnitPrice"), total: t("invoice.positionTotal"),
    },
    showQuantityDiscount: details.showQuantityDiscount,
    quantityDiscountLabel: t("orders.discountTotal"), subtotalLabel: t("cost.subtotal"),
  });
}
