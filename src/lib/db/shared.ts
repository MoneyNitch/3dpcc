import type { AppSettings, InvoiceElement, InvoiceElementType, InvoiceTemplate, ParsedPrint, PrintCostInputs } from "../types";
import { randomUUID } from "../clientId";

/** Storage backend contract implemented by each supported database driver. */
export interface DataStore {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  insertPrint(print: ParsedPrint): Promise<void>;
  savePrint(print: ParsedPrint): Promise<void>;
  listPrints(): Promise<ParsedPrint[]>;
  getPrint(id: string): Promise<ParsedPrint | null>;
  updatePrintName(id: string, displayName: string): Promise<void>;
  deletePrint(id: string): Promise<void>;
  getPrintCostInputs(id: string): Promise<PrintCostInputs | null>;
  savePrintCostInputs(id: string, inputs: PrintCostInputs): Promise<void>;
}

export const defaultSettings: AppSettings = {
  materials: [
    { id: "default-pla", name: "Standard PLA", type: "PLA", color: "#CCCCCC", pricePerKg: 20 },
    { id: "default-petg", name: "Standard PETG", type: "PETG", color: "#CCCCCC", pricePerKg: 24 },
    { id: "default-abs", name: "Standard ABS", type: "ABS", color: "#CCCCCC", pricePerKg: 22 },
  ],
  accessoryMaterials: [],
  invoiceTemplates: [
    {
      id: "default-invoice-template",
      name: "Standardrechnung",
      paperFormat: "A4",
      orientation: "portrait",
      elements: [
        { id: "header", type: "text", x: 20, y: 15, width: 100, height: 25, content: "{{companyName}}\n{{companyAddress}}", fontSize: 11, align: "left" },
        { id: "customer", type: "variables", x: 20, y: 50, width: 90, height: 25, content: "{{customerName}}\n{{customerAddress}}", fontSize: 11, align: "left" },
        { id: "meta", type: "variables", x: 130, y: 50, width: 60, height: 25, content: "Rechnung {{invoiceNumber}}\n{{invoiceDate}}", fontSize: 11, align: "left" },
        { id: "items", type: "lineItems", x: 20, y: 90, width: 170, height: 100 },
        { id: "totals", type: "totals", x: 110, y: 195, width: 80, height: 45 },
        { id: "footer", type: "text", x: 20, y: 270, width: 170, height: 15, content: "Vielen Dank für Ihren Auftrag.", fontSize: 9, align: "left" },
      ],
    },
  ],
  quoteTemplates: [
    {
      id: "default-quote-template",
      name: "Standardangebot",
      paperFormat: "A4",
      orientation: "portrait",
      elements: [
        { id: "header", type: "text", x: 20, y: 15, width: 100, height: 25, content: "{{companyName}}\n{{companyAddress}}", fontSize: 11, align: "left" },
        { id: "customer", type: "variables", x: 20, y: 50, width: 90, height: 25, content: "{{customerName}}\n{{customerAddress}}", fontSize: 11, align: "left" },
        { id: "meta", type: "variables", x: 130, y: 50, width: 60, height: 25, content: "Angebot {{invoiceNumber}}\n{{invoiceDate}}", fontSize: 11, align: "left" },
        { id: "items", type: "lineItems", x: 20, y: 90, width: 170, height: 100 },
        { id: "totals", type: "totals", x: 110, y: 195, width: 80, height: 45 },
        { id: "footer", type: "text", x: 20, y: 270, width: 170, height: 15, content: "Dieses Angebot ist bis {{dueDate}} gültig.", fontSize: 9, align: "left" },
      ],
    },
  ],
  printers: [
    {
      id: "default-printer",
      name: "Mein 3D-Drucker",
      powerConsumptionW: 150,
      purchasePrice: 800,
      lifetimeHours: 8000,
      maintenanceCostPerHour: 0.15,
    },
  ],
  defaultPrinterId: "default-printer",
  costs: {
    electricityPricePerKwh: 0.35,
    laborRatePerHour: 15,
    marginPercent: 25,
    vatPercent: 19,
    packagingCost: 1.5,
    defaultLaborMinutes: 10,
    wearAndTearPerHour: 0.1,
  },
  general: {
    language: "de",
    currency: "EUR",
  },
  numbering: {
    invoice: { prefix: "R", nextNumber: 1, digits: 4 },
    quote: { prefix: "A", nextNumber: 1, digits: 4 },
  },
  setupCompleted: false,
};

// Migrates settings saved before multi-printer support (single "printer" field).
export function migrateSettings(raw: unknown): AppSettings {
  const data = raw as AppSettings & { printer?: AppSettings["printers"][number] };
  let result = data;
  if (!result.printers || result.printers.length === 0) {
    const legacyPrinter = data.printer ?? defaultSettings.printers[0];
    result = {
      ...result,
      printers: [legacyPrinter],
      defaultPrinterId: legacyPrinter.id,
    };
  }
  if (!result.general) {
    result = { ...result, general: defaultSettings.general };
  }
  if (!result.accessoryMaterials) {
    result = { ...result, accessoryMaterials: [] };
  }
  if (!result.invoiceTemplates) {
    result = { ...result, invoiceTemplates: defaultSettings.invoiceTemplates };
  }
  result = { ...result, invoiceTemplates: result.invoiceTemplates.map(migrateInvoiceTemplate) };
  if (!result.quoteTemplates) {
    result = { ...result, quoteTemplates: defaultSettings.quoteTemplates };
  }
  result = { ...result, quoteTemplates: result.quoteTemplates.map(migrateInvoiceTemplate) };
  if (!result.numbering) {
    result = { ...result, numbering: defaultSettings.numbering };
  }
  if (result.setupCompleted === undefined) {
    // Settings saved before this field existed were already configured by someone,
    // so treat them as set up rather than forcing an unexpected redirect.
    result = { ...result, setupCompleted: true };
  }
  return result;
}

// Migrates invoice templates saved before the free-form element designer (linear
// header/footer/blocks layout) into absolutely positioned elements.
function migrateInvoiceTemplate(raw: unknown): InvoiceTemplate {
  const template = raw as InvoiceTemplate & {
    logoUrl?: string;
    header?: string;
    footer?: string;
    blocks?: { id: string; type: string; content?: string }[];
  };
  if (template.elements && template.paperFormat) return template as InvoiceTemplate;

  const elements: InvoiceElement[] = [];
  let y = 15;
  if (template.logoUrl) {
    elements.push({ id: randomUUID(), type: "image", x: 150, y: 15, width: 40, height: 25, content: template.logoUrl });
  }
  if (template.header) {
    elements.push({ id: randomUUID(), type: "text", x: 20, y, width: 110, height: 25, content: template.header, fontSize: 11, align: "left" });
    y += 30;
  }
  for (const block of template.blocks ?? []) {
    if (block.type === "spacer") {
      y += 10;
      continue;
    }
    const height = block.type === "lineItems" ? 100 : block.type === "totals" ? 45 : 20;
    elements.push({ id: block.id, type: block.type as InvoiceElementType, content: block.content, x: 20, y, width: 170, height, fontSize: 11, align: "left" });
    y += height + 8;
  }
  if (template.footer) {
    elements.push({ id: randomUUID(), type: "text", x: 20, y: 270, width: 170, height: 15, content: template.footer, fontSize: 9, align: "left" });
  }

  return {
    id: template.id,
    name: template.name,
    paperFormat: template.paperFormat ?? "A4",
    orientation: template.orientation ?? "portrait",
    elements,
    customValues: template.customValues,
  };
}

