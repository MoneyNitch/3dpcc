import { z } from "zod";
import { CURRENCY_CODES } from "../currency";
import { externalSpoolSchema } from "../externalFilaments";
import { labelTemplatesSchema } from "../labelTemplates";

const text = z.string().max(2000);
export const idSchema = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(200);
const amount = z.number().min(0).max(1_000_000_000);
const percent = z.number().min(0).max(100);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const uniqueIds = <T extends { id: string }>(items: T[]) => new Set(items.map((item) => item.id)).size === items.length;

export const materialSchema = z.strictObject({
  id: idSchema, name, type: z.string().trim().min(1).max(100), color, pricePerKg: amount,
});
export const accessorySchema = z.strictObject({
  id: idSchema, name, pricePerPack: amount, unitsPerPack: z.number().int().positive().max(1_000_000),
  numericId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1).optional(),
  stockQuantity: z.number().int().min(0).max(1_000_000_000).default(0),
});
export const accessoryStockMovementSchema = z.strictObject({
  id: idSchema,
  accessoryId: idSchema,
  accessoryName: name,
  quantity: z.number().int().finite().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
  kind: z.enum(["receipt", "adjustment", "consumption"]),
  reference: name,
  referenceKey: z.string().max(255).nullable(),
  createdAt: z.iso.datetime(),
});
export const printerSchema = z.strictObject({
  id: idSchema, name, powerConsumptionW: amount, purchasePrice: amount,
  lifetimeHours: z.number().positive().max(1_000_000), maintenanceCostPerHour: amount,
});
const productTypeSchema = z.strictObject({
  id: z.uuid(), name: z.string().trim().min(1).max(100),
  prefix: z.string().regex(/^[A-Za-z0-9._-]{1,30}$/),
  digits: z.number().int().min(1).max(12),
  nextNumber: z.number().int().min(1).max(1_000_000_001),
  fileName: z.string().min(1).max(255),
  linkedPrintId: z.uuid().nullable(),
  imageMode: z.enum(["print", "custom", "none"]),
  imageBase64: z.string().max(7_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
}).refine((product) => product.imageMode !== "custom" || product.imageBase64 !== null,
  "Custom product images must be provided.");
const costLine = z.enum(["material", "extraMaterials", "energy", "machine", "labor", "packaging", "margin", "tax"]);
export const templateSchema = z.strictObject({
  id: idSchema, name, paperFormat: z.enum(["A4", "A5", "Letter", "Legal"]),
  orientation: z.enum(["portrait", "landscape"]),
  customValues: z.record(idSchema, text).optional(),
  elements: z.array(z.strictObject({
    id: idSchema,
    type: z.enum(["text", "variables", "image", "qrcode", "lineItems", "totals"]),
    x: z.number().min(0).max(1000), y: z.number().min(0).max(1000),
    width: z.number().positive().max(1000), height: z.number().positive().max(1000),
    content: z.string().max(1_000_000).optional(),
    fontSize: z.number().positive().max(200).optional(), align: z.enum(["left", "center", "right"]).optional(),
    lineLabels: z.partialRecord(costLine, text).optional(),
    hiddenLines: z.array(costLine).optional(), distributeMargin: z.boolean().optional(),
    marginTargets: z.array(costLine).optional(),
    distributionTargets: z.partialRecord(costLine, z.array(costLine)).optional(),
  })).max(200).refine(uniqueIds, "Element IDs must be unique."),
});
const numberingSchema = z.strictObject({
  prefix: z.string().min(1).max(50), nextNumber: z.number().int().positive().max(1_000_000_000),
  digits: z.number().int().min(1).max(12),
});
export const settingsSchema = z.strictObject({
  nextAccessoryNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
  labelTemplates: labelTemplatesSchema.default([]),
  productTypes: z.array(productTypeSchema).max(1000).default([]).refine(uniqueIds, "Product type IDs must be unique.")
    .refine((items) => new Set(items.map((item) => item.prefix.toLowerCase())).size === items.length, "Product prefixes must be unique."),
  materials: z.array(materialSchema).max(1000).refine(uniqueIds, "Material IDs must be unique."),
  accessoryMaterials: z.array(accessorySchema).max(1000).refine(uniqueIds, "Accessory IDs must be unique.")
    .refine((items) => {
      const numbers = items.flatMap((item) => item.numericId === undefined ? [] : [item.numericId]);
      return new Set(numbers).size === numbers.length;
    }, "Accessory numbers must be unique."),
  printers: z.array(printerSchema).min(1).max(1000).refine(uniqueIds, "Printer IDs must be unique."),
  invoiceTemplates: z.array(templateSchema).max(100).refine(uniqueIds, "Template IDs must be unique."),
  quoteTemplates: z.array(templateSchema).max(100).refine(uniqueIds, "Template IDs must be unique."),
  defaultPrinterId: idSchema,
  costs: z.strictObject({
    electricityPricePerKwh: amount, laborRatePerHour: amount, marginPercent: amount, vatPercent: percent,
    packagingCost: amount, defaultLaborMinutes: amount, wearAndTearPerHour: amount,
  }),
  general: z.strictObject({
    language: z.string().min(2).max(50), currency: z.enum(CURRENCY_CODES),
    enable3dPreview: z.boolean(), retainOriginalArchives: z.boolean().default(false),
    previewComputePercent: z.number().int().min(10).max(100),
    fetchGithubChangelog: z.boolean().default(true),
    checkGithubUpdates: z.boolean().default(true),
    companyName: text, companyAddress: text, companyEmail: text, companyPhone: text, companyTaxId: text, companyIban: text,
  }),
  customLanguagePacks: z.array(z.strictObject({
    code: z.string().min(2).max(50), name, translations: z.record(z.string().max(200), z.string().max(10_000)),
  })).max(20),
  numbering: z.strictObject({ invoice: numberingSchema, quote: numberingSchema }),
  setupCompleted: z.boolean(),
}).refine((settings) => settings.printers.some((printer) => printer.id === settings.defaultPrinterId), {
  path: ["defaultPrinterId"], message: "Default printer must exist.",
}).refine((settings) => settings.general.language === "de" || settings.general.language === "en" ||
  settings.customLanguagePacks.some((pack) => pack.code === settings.general.language), {
  path: ["general", "language"], message: "Selected language must be installed.",
});
export const settingsPatchSchema = z.strictObject(settingsSchema.shape).partial().extend({
  labelTemplates: labelTemplatesSchema.optional(),
  productTypes: settingsSchema.shape.productTypes.unwrap().optional(),
  nextAccessoryNumber: settingsSchema.shape.nextAccessoryNumber.unwrap().optional(),
  general: settingsSchema.shape.general.partial().optional(),
  costs: settingsSchema.shape.costs.partial().optional(),
  numbering: z.strictObject({
    invoice: numberingSchema.partial().optional(), quote: numberingSchema.partial().optional(),
  }).optional(),
}).refine((body) => Object.keys(body).length > 0, "Provide at least one setting.");

export const costInputsSchema = z.strictObject({
  laborMinutes: amount, packagingCost: amount, marginPercent: amount, vatPercent: percent,
  quantityDiscountThreshold: z.number().int().positive().max(1_000_000),
  quantityDiscountPercent: percent,
  materialPriceOverrides: z.record(idSchema, amount),
  externalSpools: z.record(idSchema, externalSpoolSchema),
  quantity: z.number().int().positive().max(1_000_000),
  energyKwhOverride: amount.nullable(),
  extraCosts: z.array(z.strictObject({
    id: idSchema, name, cost: amount, quantity: z.number().positive().max(1_000_000),
    accessoryId: idSchema.optional(),
  }))
    .max(1000).refine(uniqueIds, "Extra cost IDs must be unique."),
  printerId: idSchema.nullable(),
});
export const costInputsPatchSchema = costInputsSchema.partial();
export const filamentSchema = z.strictObject({
  filamentId: idSchema, type: z.string().trim().min(1).max(100), color, usedGramsTotal: amount,
});
const categorySchema = z.strictObject({ category: z.enum(["model", "support", "tower", "other"]), grams: amount });
export const manualSchema = z.strictObject({
  name, minutes: z.number().min(0).max(10_000_000),
  filaments: z.array(filamentSchema).min(1).max(32),
  categoryByFilament: z.array(z.strictObject({
    filamentId: idSchema, categories: z.array(categorySchema).min(1).max(4),
  })).max(32).optional(),
});
export const renameSchema = z.strictObject({ displayName: name });
export const selectionSchema = z.union([z.literal("all"), z.number().int().positive()]);
export const calculationSchema = z.strictObject({
  plateIndex: selectionSchema.optional(), inputs: costInputsPatchSchema.optional(),
});
export const documentSchema = calculationSchema.extend({
  printId: z.uuid(), templateId: idSchema,
  documentNumber: z.string().trim().min(1).max(100),
  customerName: text.default(""), customerAddress: text.default(""),
  date: z.iso.date(), dueDate: z.iso.date().optional(), paymentTerms: text.optional(),
  showQuantityDiscount: z.boolean().default(true),
});
export const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export const plateQuerySchema = z.strictObject({ plateIndex: z.coerce.number().int().positive().optional() });
export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional() }),
});
// Stored print fields are optional where older records did not contain them.
const usageSchema = filamentSchema.extend({
  usedMetersTotal: z.number(), usedForObject: z.boolean(), usedForSupport: z.boolean(),
});
export const plateSchema = z.object({
  plateIndex: z.number().int().positive().optional(), plateName: z.string().optional(),
  totalWeightGrams: z.number(), printTimeSeconds: z.number(), totalPrintTimeSeconds: z.number(),
  layerCount: z.number(), nozzleDiameterMm: z.number().nullable(), printerModelId: z.string().nullable(),
  bedType: z.string().nullable(), hasGcode: z.boolean().optional(),
  filaments: z.array(usageSchema),
  objects: z.array(z.object({
    objectId: z.string(), name: z.string(), maxHeightMm: z.number().nullable(),
    categories: z.array(categorySchema),
    perFilament: z.array(z.object({ filamentId: z.string(), grams: z.number() })), totalGrams: z.number(),
  })),
  categoryTotals: z.array(categorySchema),
  categoryByFilament: z.array(z.object({ filamentId: z.string(), totalGrams: z.number(), categories: z.array(categorySchema) })),
  thumbnailBase64: z.string().nullable(),
});
export const printSchema = z.object({
  id: z.uuid(), fileName: z.string(), displayName: z.string().optional(), manual: z.boolean().optional(),
  createdAt: z.string(), plate: plateSchema, plates: z.array(plateSchema).optional(),
  previewSource: z.object({ printId: z.uuid(), plateIndex: z.number() }).optional(),
});
export const resultSchema = z.object({
  materialLines: z.array(z.object({ label: z.string(), amount: z.number() })),
  materialTotal: z.number(), extraCostsTotal: z.number(), energyCost: z.number(), machineCost: z.number(),
  laborCost: z.number(), packagingCost: z.number(), subtotal: z.number(), marginAmount: z.number(),
  priceBeforeVat: z.number(), quantityDiscountAmount: z.number(), quantityDiscountPercent: z.number(),
  vatAmount: z.number(), totalPrice: z.number(), pricePerGram: z.number(),
});
