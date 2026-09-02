import type { CostResult, InvoiceBlock, InvoiceCostLine, InvoiceTemplate } from "./types";

/** Placeholders available in every template field and text block. */
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
  block: InvoiceBlock | undefined
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
  const hidden = block?.hiddenLines ?? [];
  const distributions: Partial<Record<InvoiceCostLine, InvoiceCostLine[]>> = {
    ...(block?.distributeMargin
      ? { margin: block.marginTargets ?? INVOICE_COST_LINES.map((line) => line.id) }
      : {}),
    ...block?.distributionTargets,
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
    label: block?.lineLabels?.[line.id] || line.label,
    amount: amounts[line.id],
  }));
}

function renderBlock(
  block: InvoiceBlock,
  template: InvoiceTemplate,
  values: Record<string, string>,
  result: CostResult,
  money: (value: number) => string
): string {
  const text = (value: string) => escapeHtml(fillVariables(value, values));

  if (block.type === "spacer") return '<div class="spacer"></div>';
  if (block.type === "text" || block.type === "variables") {
    return `<div class="pre">${text(block.content ?? "")}</div>`;
  }
  if (block.type === "lineItems") {
    const rows = buildInvoiceLines(result, block)
      .map(
        (line) =>
          `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(money(line.amount))}</td></tr>`
      )
      .join("");
    return `<table class="items"><thead><tr><th>Position</th><th>Betrag</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  const lineItemBlock = template.blocks.find((item) => item.type === "lineItems");
  const marginDistributed =
    (lineItemBlock?.distributionTargets?.margin?.length ?? 0) > 0 || lineItemBlock?.distributeMargin;
  const marginHidden = lineItemBlock?.hiddenLines?.includes("margin") ?? false;
  const subtotal = marginDistributed ? result.priceBeforeVat : result.subtotal;
  const marginRow =
    marginHidden || marginDistributed
      ? ""
      : `<div><span>${escapeHtml(lineItemBlock?.lineLabels?.margin || "Gewinnmarge")}</span><span>${escapeHtml(money(result.marginAmount))}</span></div>`;
  const taxLabel = text(block.lineLabels?.tax || DEFAULT_TAX_LABEL);

  return `<div class="totals"><div><span>Zwischensumme</span><span>${escapeHtml(money(subtotal))}</span></div>${marginRow}<div><span>${taxLabel}</span><span>${escapeHtml(money(result.vatAmount))}</span></div><div class="total"><span>Gesamt</span><span>${escapeHtml(money(result.totalPrice))}</span></div></div>`;
}

/** Renders a complete invoice document. `paper` adds A4 page sizing for print and download. */
export function renderInvoiceHtml({
  template,
  values,
  result,
  money,
  paper = true,
  title = "Rechnung",
  autoPrint = false,
}: {
  template: InvoiceTemplate;
  values: Record<string, string>;
  result: CostResult;
  money: (value: number) => string;
  paper?: boolean;
  title?: string;
  autoPrint?: boolean;
}): string {
  const text = (value: string) => escapeHtml(fillVariables(value, values));
  const body = template.blocks
    .map((block) => renderBlock(block, template, values, result, money))
    .join("");
  const logo = template.logoUrl
    ? `<img class="logo" src="${escapeHtml(template.logoUrl)}" alt="Logo">`
    : "";
  const page = paper
    ? "@page{size:A4 portrait;margin:0}body{width:210mm;min-height:297mm;margin:0 auto;padding:20mm}"
    : "body{max-width:820px;margin:0 auto;padding:28px}";
  const printScript = autoPrint
    ? '<script>window.addEventListener("load", function () { window.print(); });<\/script>'
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#fff;font-size:13px;line-height:1.5}${page}h1{font-size:24px;margin:28px 0 18px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:30px;border-bottom:1px solid #d7dce5;padding-bottom:22px}.logo{max-height:80px;max-width:190px;object-fit:contain}.pre{white-space:pre-line;margin:12px 0}.spacer{height:26px}.items{width:100%;border-collapse:collapse;margin:22px 0}.items th,.items td{border-bottom:1px solid #d7dce5;padding:9px;text-align:left}.items th:last-child,.items td:last-child{text-align:right}.totals{margin-left:auto;width:320px}.totals div{display:flex;justify-content:space-between;padding:5px 0}.totals .total{border-top:2px solid #172033;margin-top:6px;padding-top:9px;font-size:17px;font-weight:bold}.footer{border-top:1px solid #d7dce5;margin-top:44px;padding-top:14px;font-size:11px;color:#536074}@media print{.no-print{display:none}}</style></head><body><div class="top"><div class="pre">${text(template.header)}</div>${logo}</div><h1>Rechnung</h1>${body}<div class="footer pre">${text(template.footer)}</div>${printScript}</body></html>`;
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
