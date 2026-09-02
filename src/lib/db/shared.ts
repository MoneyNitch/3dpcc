import type { AppSettings, ParsedPrint, PrintCostInputs } from "../types";

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
      logoUrl: "",
      header: "{{companyName}}\n{{companyAddress}}",
      footer: "Vielen Dank für Ihren Auftrag.",
      blocks: [
        { id: "customer", type: "variables", content: "{{customerName}}\n{{customerAddress}}" },
        { id: "intro", type: "text", content: "Rechnung {{invoiceNumber}} vom {{invoiceDate}}" },
        { id: "items", type: "lineItems" },
        { id: "totals", type: "totals" },
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
  if (result.setupCompleted === undefined) {
    // Settings saved before this field existed were already configured by someone,
    // so treat them as set up rather than forcing an unexpected redirect.
    result = { ...result, setupCompleted: true };
  }
  return result;
}
