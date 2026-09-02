// Shared domain types for parsed 3MF prints and cost calculation.

export type PartCategory = "model" | "support" | "tower" | "other";

export interface FilamentUsage {
  /** Slicer filament slot id (as string, e.g. "1", "2") */
  filamentId: string;
  type: string;
  color: string; // hex, e.g. #FF0000
  usedGramsTotal: number;
  usedMetersTotal: number;
  usedForObject: boolean;
  usedForSupport: boolean;
}

export interface CategoryBreakdown {
  category: PartCategory;
  grams: number;
}

export interface MaterialCategoryBreakdown {
  filamentId: string;
  categories: CategoryBreakdown[];
  totalGrams: number;
}

export interface ObjectBreakdown {
  objectId: string;
  name: string;
  maxHeightMm: number | null;
  /** grams per category (model/support/tower) for this object */
  categories: CategoryBreakdown[];
  /** grams per filament color for this object */
  perFilament: { filamentId: string; grams: number }[];
  totalGrams: number;
}

export interface ParsedPlate {
  totalWeightGrams: number;
  printTimeSeconds: number;
  totalPrintTimeSeconds: number;
  layerCount: number;
  nozzleDiameterMm: number | null;
  printerModelId: string | null;
  bedType: string | null;
  filaments: FilamentUsage[];
  objects: ObjectBreakdown[];
  /** Aggregated grams per category across all objects + wipe tower */
  categoryTotals: CategoryBreakdown[];
  /** Grams per category, split out per filament/material */
  categoryByFilament: MaterialCategoryBreakdown[];
  thumbnailBase64: string | null; // data URL
}

export interface ParsedPrint {
  id: string;
  fileName: string;
  displayName?: string;
  createdAt: string;
  plate: ParsedPlate;
}

export interface Material {
  id: string;
  name: string;
  type: string; // e.g. PLA, PETG, ABS
  color: string; // hex
  pricePerKg: number;
}

/** Purchased accessory such as screws, nuts, magnets, or glue. */
export interface AccessoryMaterial {
  id: string;
  name: string;
  pricePerPack: number;
  unitsPerPack: number;
}

export interface PrinterProfile {
  id: string;
  name: string;
  powerConsumptionW: number;
  purchasePrice: number;
  lifetimeHours: number;
  maintenanceCostPerHour: number;
}

export interface CostSettings {
  electricityPricePerKwh: number;
  laborRatePerHour: number;
  marginPercent: number;
  vatPercent: number;
  packagingCost: number;
  defaultLaborMinutes: number;
  wearAndTearPerHour: number;
}

export type InvoiceBlockType = "text" | "variables" | "lineItems" | "totals" | "spacer";

export type InvoiceCostLine =
  | "material"
  | "extraMaterials"
  | "energy"
  | "machine"
  | "labor"
  | "packaging"
  | "margin"
  | "tax";

export interface InvoiceBlock {
  id: string;
  type: InvoiceBlockType;
  content?: string;
  lineLabels?: Partial<Record<InvoiceCostLine, string>>;
  hiddenLines?: InvoiceCostLine[];
  distributeMargin?: boolean;
  marginTargets?: InvoiceCostLine[];
  /** Source line to target lines for amounts that should be shown as allocated costs. */
  distributionTargets?: Partial<Record<InvoiceCostLine, InvoiceCostLine[]>>;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  logoUrl: string;
  header: string;
  footer: string;
  blocks: InvoiceBlock[];
}

export interface AppSettings {
  materials: Material[];
  accessoryMaterials: AccessoryMaterial[];
  invoiceTemplates: InvoiceTemplate[];
  printers: PrinterProfile[];
  defaultPrinterId: string;
  costs: CostSettings;
  general: GeneralSettings;
  /** True once the user has gone through Settings at least once after a fresh install. */
  setupCompleted: boolean;
}

export type Language = "de" | "en";
export type Currency = "EUR" | "USD";

export interface GeneralSettings {
  language: Language;
  currency: Currency;
}

export interface CostBreakdownLine {
  label: string;
  amount: number;
}

export interface ExtraCostItem {
  id: string;
  name: string;
  cost: number;
  quantity: number;
}

export interface CostResult {
  materialLines: CostBreakdownLine[];
  materialTotal: number;
  extraCostsTotal: number;
  energyCost: number;
  machineCost: number;
  laborCost: number;
  packagingCost: number;
  subtotal: number;
  marginAmount: number;
  priceBeforeVat: number;
  vatAmount: number;
  totalPrice: number;
  pricePerGram: number;
}

export interface PrintCostInputs {
  laborMinutes: number;
  packagingCost: number;
  marginPercent: number;
  vatPercent: number;
  /** Override price per kg per filamentId, falls back to matched material or a default */
  materialPriceOverrides: Record<string, number>;
  quantity: number;
  /** Measured total energy consumption (e.g. from a smart plug), in kWh. Overrides
   *  the power/print-time based estimate when set. */
  energyKwhOverride: number | null;
  /** Extra materials not tracked by the slicer, e.g. screws, nuts, glue. */
  extraCosts: ExtraCostItem[];
  /** Printer profile id used for this print; null falls back to the default printer. */
  printerId: string | null;
}
