import type { FilamentUsage, MaterialCategoryBreakdown, ParsedPlate, PartCategory } from "./types";

const categories: PartCategory[] = ["model", "support", "tower", "other"];

export function parseManualFilaments(value: unknown): FilamentUsage[] | null {
  let entries: unknown;
  try {
    entries = JSON.parse(String(value));
  } catch {
    return null;
  }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 32) return null;
  const ids = new Set<string>();
  const filaments: FilamentUsage[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return null;
    const { filamentId, type, color, usedGramsTotal } = entry;
    if (typeof filamentId !== "string" || !filamentId || filamentId.length > 100 || ids.has(filamentId) ||
      typeof type !== "string" || !type.trim() || type.trim().length > 100 ||
      typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color) ||
      typeof usedGramsTotal !== "number" || !Number.isFinite(usedGramsTotal) || usedGramsTotal < 0) return null;
    ids.add(filamentId);
    filaments.push({ filamentId, type: type.trim(), color, usedGramsTotal,
      usedMetersTotal: 0, usedForObject: true, usedForSupport: false });
  }
  const total = filaments.reduce((sum, filament) => sum + filament.usedGramsTotal, 0);
  return Number.isFinite(total) && total > 0 ? filaments : null;
}

export function parseManualCategories(value: unknown, filaments: FilamentUsage[]): MaterialCategoryBreakdown[] | null {
  if (value == null) return filaments.map(({ filamentId, usedGramsTotal }) => ({
    filamentId, totalGrams: usedGramsTotal, categories: [{ category: "model", grams: usedGramsTotal }],
  }));
  let entries: unknown;
  try {
    entries = JSON.parse(String(value));
  } catch {
    return null;
  }
  if (!Array.isArray(entries) || entries.length !== filaments.length) return null;
  const result: MaterialCategoryBreakdown[] = [];
  for (const filament of filaments) {
    const entry = entries.find((item) => item?.filamentId === filament.filamentId);
    if (!entry || entries.filter((item) => item?.filamentId === filament.filamentId).length !== 1 ||
      !Array.isArray(entry.categories) || entry.categories.length < 1 || entry.categories.length > categories.length) return null;
    const seen = new Set<PartCategory>();
    const amounts: MaterialCategoryBreakdown["categories"] = [];
    for (const item of entry.categories) {
      if (!categories.includes(item?.category) || seen.has(item.category) ||
        typeof item.grams !== "number" || !Number.isFinite(item.grams) || item.grams < 0) return null;
      seen.add(item.category);
      amounts.push({ category: item.category, grams: item.grams });
    }
    if (amounts.reduce((sum, item) => sum + item.grams, 0) !== filament.usedGramsTotal) return null;
    result.push({ filamentId: filament.filamentId, totalGrams: filament.usedGramsTotal, categories: amounts });
  }
  return result;
}

export function manualBreakdown(name: string, filaments: FilamentUsage[], categoryByFilament: MaterialCategoryBreakdown[]): Pick<ParsedPlate, "totalWeightGrams" | "objects" | "categoryTotals" | "categoryByFilament"> {
  const totalWeightGrams = filaments.reduce((sum, filament) => sum + filament.usedGramsTotal, 0);
  const categoryTotals = categories.map((category) => ({ category,
    grams: categoryByFilament.reduce((sum, item) => sum + (item.categories.find((entry) => entry.category === category)?.grams ?? 0), 0),
  })).filter((item) => item.grams > 0 || item.category === "model");
  return {
    totalWeightGrams,
    objects: [{ objectId: "1", name, maxHeightMm: null,
      categories: categoryTotals.filter((item) => item.category !== "tower"),
      perFilament: filaments.map(({ filamentId, usedGramsTotal }) => ({ filamentId,
        grams: usedGramsTotal - (categoryByFilament.find((item) => item.filamentId === filamentId)?.categories.find((item) => item.category === "tower")?.grams ?? 0),
      })),
      totalGrams: totalWeightGrams - (categoryTotals.find((item) => item.category === "tower")?.grams ?? 0) }],
    categoryTotals,
    categoryByFilament,
  };
}