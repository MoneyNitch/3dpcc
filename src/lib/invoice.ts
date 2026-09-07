import QRCode from "qrcode";
import type {
  CostResult,
  DocumentNumberingSettings,
  InvoiceCostLine,
  InvoiceElement,
  InvoiceTemplate,
  PaperFormat,
  PaperOrientation,
} from "./types";

/** Placeholders available in every template field and text element. */
export const INVOICE_VARIABLES = [
  "companyName",
  "companyAddress",
  "companyEmail",
  "companyPhone",
  "companyTaxId",
  "companyIban",
  "customerName",
  "customerAddress",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "paymentTerms",
  "printName",
  "printWeight",
  "printTime",
  "quantity",
  "subtotal",
  "margin",
  "tax",
  "vatPercent",
  "total",
] as const;

export const INVOICE_COST_LINES: { id: InvoiceCostLine; label: string }[] = [
  { id: "material", label: "Material" },
  { id: "extraMaterials", label: "Zusätzliche Materialkosten" },
  { id: "energy", label: "Stromkosten" },
  { id: "machine", label: "Maschinenkosten" },
  { id: "labor", label: "Arbeitszeit" },
  { id: "packaging", label: "Verpackung" },
  { id: "margin", label: "Gewinnmarge" },
];

export const DEFAULT_TAX_LABEL = "MwSt. ({{vatPercent}} %)";

/** Standard paper sizes in millimeters (portrait orientation). */
export const PAPER_SIZES_MM: Record<PaperFormat, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export function pageSizeMm(
  format: PaperFormat,
  orientation: PaperOrientation
): { width: number; height: number } {
  const size = PAPER_SIZES_MM[format];
  return orientation === "landscape"
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/** Builds the next document number, e.g. R-2026-0007, without consuming it. */
export function formatDocumentNumber(numbering: DocumentNumberingSettings): string {
  const year = new Date().getFullYear();
  const padded = String(numbering.nextNumber).padStart(numbering.digits, "0");
  return `${numbering.prefix}-${year}-${padded}`;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character
  );
}

export function fillVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? `{{${key}}}`);
}

/** Cost lines for the line item table, after hiding and proportional redistribution. */
export function buildInvoiceLines(
  result: CostResult,
  element: InvoiceElement | undefined
): { label: string; amount: number }[] {
  const amounts: Record<InvoiceCostLine, number> = {
    material: result.materialTotal,
    extraMaterials: result.extraCostsTotal,
    energy: result.energyCost,
    machine: result.machineCost,
    labor: result.laborCost,
    packaging: result.packagingCost,
    margin: result.marginAmount,
    tax: result.vatAmount,
  };
  const hidden = element?.hiddenLines ?? [];
  const distributions: Partial<Record<InvoiceCostLine, InvoiceCostLine[]>> = {
    ...(element?.distributeMargin
      ? { margin: element.marginTargets ?? INVOICE_COST_LINES.map((line) => line.id) }
      : {}),
    ...element?.distributionTargets,
  };

  for (const [source, configured] of Object.entries(distributions) as [
    InvoiceCostLine,
    InvoiceCostLine[],
  ][]) {
    const targets = configured.filter(
      (target) =>
        target !== source &&
        !hidden.includes(target) &&
        !(distributions[target]?.length ?? 0) &&
        amounts[target] > 0
    );
    const base = targets.reduce((sum, target) => sum + amounts[target], 0);
    if (base > 0 && amounts[source] > 0) {
      const sourceAmount = amounts[source];
      for (const target of targets) {
        amounts[target] += sourceAmount * (amounts[target] / base);
      }
    }
  }

  return INVOICE_COST_LINES.filter(
    (line) => !hidden.includes(line.id) && !(distributions[line.id]?.length ?? 0)
  ).map((line) => ({
    label: element?.lineLabels?.[line.id] || line.label,
    amount: amounts[line.id],
  }));
}

async function renderElement(
  element: InvoiceElement,
  template: InvoiceTemplate,
  values: Record<string, string>,
  result: CostResult,
  money: (value: number) => string
): Promise<string> {
  const text = (value: string) => escapeHtml(fillVariables(value, values));
  const style = `position:absolute;left:${element.x}mm;top:${element.y}mm;width:${element.width}mm;height:${element.height}mm;font-size:${element.fontSize ?? 11}pt;text-align:${element.align ?? "left"};`;

  if (element.type === "text" || element.type === "variables") {
    return `<div style="${style}" class="pre">${text(element.content ?? "")}</div>`;
  }
  if (element.type === "image") {
    const src = element.content ?? "";
    return src
      ? `<div style="${style}"><img src="${escapeHtml(src)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain"></div>`
      : "";
  }
  if (element.type === "qrcode") {
    const value = fillVariables(element.content ?? "", values);
    if (!value) return "";
    const dataUrl = await QRCode.toDataURL(value, { margin: 0, width: 512 });
    return `<div style="${style}"><img src="${dataUrl}" alt="QR" style="width:100%;height:100%;object-fit:contain"></div>`;
  }
  if (element.type === "lineItems") {
    const rows = buildInvoiceLines(result, element)
      .map(
        (line) =>
          `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(money(line.amount))}</td></tr>`
      )
      .join("");
    return `<div style="${style}"><table class="items"><thead><tr><th>Position</th><th>Betrag</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // totals
  const lineItemElement = template.elements.find((item) => item.type === "lineItems");
  const marginDistributed =
    (lineItemElement?.distributionTargets?.margin?.length ?? 0) > 0 || lineItemElement?.distributeMargin;
  const marginHidden = marginDistributed || (element.hiddenLines?.includes("margin") ?? false);
  const taxHidden = element.hiddenLines?.includes("tax") ?? false;
  const subtotal = marginDistributed ? result.priceBeforeVat : result.subtotal;
  const marginRow = marginHidden
    ? ""
    : `<div><span>${escapeHtml(element.lineLabels?.margin || "Gewinnmarge")}</span><span>${escapeHtml(money(result.marginAmount))}</span></div>`;
  const taxLabel = text(element.lineLabels?.tax || DEFAULT_TAX_LABEL);
  const taxRow = taxHidden
    ? ""
    : `<div><span>${taxLabel}</span><span>${escapeHtml(money(result.vatAmount))}</span></div>`;

  return `<div style="${style}"><div class="totals"><div><span>Zwischensumme</span><span>${escapeHtml(money(subtotal))}</span></div>${marginRow}${taxRow}<div class="total"><span>Gesamt</span><span>${escapeHtml(money(result.totalPrice))}</span></div></div></div>`;
}

/** Renders a complete invoice document for the given paper format. */
export async function renderInvoiceHtml({
  template,
  values,
  result,
  money,
  title = "Rechnung",
  autoPrint = false,
}: {
  template: InvoiceTemplate;
  values: Record<string, string>;
  result: CostResult;
  money: (value: number) => string;
  title?: string;
  autoPrint?: boolean;
}): Promise<string> {
  const size = pageSizeMm(template.paperFormat, template.orientation);
  const body = (
    await Promise.all(template.elements.map((element) => renderElement(element, template, values, result, money)))
  ).join("");
  const printScript = autoPrint
    ? '<script>window.addEventListener("load", function () { window.print(); });<\/script>'
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#fff;margin:0}@page{size:${size.width}mm ${size.height}mm;margin:0}.page{position:relative;width:${size.width}mm;height:${size.height}mm;margin:0 auto;background:#fff}.pre{white-space:pre-line}.items{width:100%;border-collapse:collapse}.items th,.items td{border-bottom:1px solid #d7dce5;padding:6px;text-align:left;font-size:10pt}.items th:last-child,.items td:last-child{text-align:right}.totals div{display:flex;justify-content:space-between;padding:3px 0;font-size:10pt}.totals .total{border-top:2px solid #172033;margin-top:4px;padding-top:6px;font-size:13pt;font-weight:bold}@media print{.no-print{display:none}}</style></head><body><div class="page">${body}</div>${printScript}</body></html>`;
}


/** Sample data so a template can be previewed without an actual print. */
export function sampleInvoiceValues(): Record<string, string> {
  return {
    companyName: "Musterwerkstatt GmbH",
    companyAddress: "Musterstraße 12\n12345 Musterstadt",
    companyEmail: "hallo@musterwerkstatt.de",
    companyPhone: "+49 30 1234567",
    companyTaxId: "DE123456789",
    companyIban: "DE02 1203 0000 0000 2020 51",
    customerName: "Max Mustermann",
    customerAddress: "Max Mustermann\nBeispielweg 4\n54321 Beispielstadt",
    invoiceNumber: "R-2026-0001",
    invoiceDate: "02.09.2026",
    dueDate: "16.09.2026",
    paymentTerms: "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    printName: "Gehäuse.gcode.3mf",
    printWeight: "85,4 g",
    printTime: "4 h 12 min",
    quantity: "1",
    vatPercent: "19",
  };
}

export const sampleInvoiceResult: CostResult = {
  materialLines: [],
  materialTotal: 8.5,
  extraCostsTotal: 1,
  energyCost: 0.65,
  machineCost: 0.85,
  laborCost: 1,
  packagingCost: 0,
  subtotal: 12,
  marginAmount: 3,
  priceBeforeVat: 15,
  vatAmount: 2.85,
  totalPrice: 17.85,
  pricePerGram: 0.21,
};
