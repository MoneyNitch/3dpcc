import type {
  AppSettings,
  CostBreakdownLine,
  CostResult,
  FilamentUsage,
  ParsedPlate,
  PrinterProfile,
  PrintCostInputs,
} from "./types";

export function findPrinter(settings: AppSettings, printerId: string | null): PrinterProfile {
  const id = printerId ?? settings.defaultPrinterId;
  return (
    settings.printers.find((p) => p.id === id) ?? settings.printers[0] ??
    {
      id: "fallback",
      name: "Unbekannter Drucker",
      powerConsumptionW: 150,
      purchasePrice: 0,
      lifetimeHours: 1,
      maintenanceCostPerHour: 0,
    }
  );
}

export function findMaterialPriceForFilament(
  filament: FilamentUsage,
  settings: AppSettings
): number {
  const byColorAndType = settings.materials.find(
    (m) =>
      m.color.toLowerCase() === filament.color.toLowerCase() &&
      m.type.toLowerCase() === filament.type.toLowerCase()
  );
  if (byColorAndType) return byColorAndType.pricePerKg;
  const byType = settings.materials.find(
    (m) => m.type.toLowerCase() === filament.type.toLowerCase()
  );
  if (byType) return byType.pricePerKg;
  return settings.materials[0]?.pricePerKg ?? 20;
}

export function defaultCostInputs(settings: AppSettings): PrintCostInputs {
  return {
    laborMinutes: settings.costs.defaultLaborMinutes,
    packagingCost: settings.costs.packagingCost,
    marginPercent: settings.costs.marginPercent,
    vatPercent: settings.costs.vatPercent,
    quantityDiscountThreshold: 5,
    quantityDiscountPercent: 5,
    materialPriceOverrides: {},
    externalSpools: {},
    quantity: 1,
    energyKwhOverride: null,
    extraCosts: [],
    printerId: null,
  };
}

export function findFilamentPrice(
  filament: FilamentUsage,
  settings: AppSettings,
  inputs: PrintCostInputs
): number {
  return inputs.materialPriceOverrides[filament.filamentId] ??
    inputs.externalSpools?.[filament.filamentId]?.pricePerKg ??
    findMaterialPriceForFilament(filament, settings);
}

export function calculateCost(
  plate: ParsedPlate,
  settings: AppSettings,
  inputs: PrintCostInputs
): CostResult {
  const printHours = plate.totalPrintTimeSeconds / 3600;

  const materialLines: CostBreakdownLine[] = plate.filaments.map((f) => {
    const pricePerKg = findFilamentPrice(f, settings, inputs);
    const rawAmount = (f.usedGramsTotal / 1000) * pricePerKg;
    // Never bill less than 1 cent per material actually used.
    const amount = rawAmount > 0 ? Math.max(rawAmount, 0.01) : 0;
    return {
      label: `${inputs.externalSpools?.[f.filamentId]?.name ?? `${f.type} ${f.color}`} (${f.usedGramsTotal.toFixed(1)} g)`,
      amount,
    };
  });
  const materialTotal = materialLines.reduce((s, l) => s + l.amount, 0);
  const extraCostsTotal = (inputs.extraCosts ?? []).reduce(
    (s, l) => s + l.cost * (l.quantity ?? 1),
    0
  );

  const printer = findPrinter(settings, inputs.printerId);

  // A measured kWh value (e.g. from a smart plug) takes precedence over the estimate.
  const energyKwh =
    inputs.energyKwhOverride ?? (printer.powerConsumptionW / 1000) * printHours;
  const energyCost = energyKwh * settings.costs.electricityPricePerKwh;

  const machineDepreciationPerHour =
    printer.lifetimeHours > 0 ? printer.purchasePrice / printer.lifetimeHours : 0;
  const machineCost =
    (machineDepreciationPerHour + settings.costs.wearAndTearPerHour + printer.maintenanceCostPerHour) *
    printHours;

  const laborCost = (inputs.laborMinutes / 60) * settings.costs.laborRatePerHour;

  const packagingCost = inputs.packagingCost;

  return finalizeCost(
    materialLines,
    materialTotal,
    extraCostsTotal,
    energyCost,
    machineCost,
    laborCost,
    packagingCost,
    plate.totalWeightGrams,
    inputs
  );
}

export function calculateAllPlatesCost(
  plates: ParsedPlate[],
  settings: AppSettings,
  inputs: PrintCostInputs
): CostResult {
  if (plates.length === 0) throw new Error("At least one plate is required to calculate total costs.");

  const perPlateInputs = {
    ...inputs,
    energyKwhOverride: null,
    laborMinutes: 0,
    packagingCost: 0,
    extraCosts: [],
    quantity: 1,
  };
  const plateResults = plates.map((plate) => calculateCost(plate, settings, perPlateInputs));
  const materialLines = plateResults.flatMap((result) => result.materialLines);
  const materialTotal = plateResults.reduce((total, result) => total + result.materialTotal, 0);
  const extraCostsTotal = (inputs.extraCosts ?? []).reduce(
    (total, item) => total + item.cost * (item.quantity ?? 1),
    0
  );
  const energyCost = inputs.energyKwhOverride !== null
    ? inputs.energyKwhOverride * settings.costs.electricityPricePerKwh
    : plateResults.reduce((total, result) => total + result.energyCost, 0);
  const machineCost = plateResults.reduce((total, result) => total + result.machineCost, 0);
  const laborCost = (inputs.laborMinutes / 60) * settings.costs.laborRatePerHour;
  const packagingCost = inputs.packagingCost;
  const totalWeightGrams = plates.reduce((total, plate) => total + plate.totalWeightGrams, 0);

  return finalizeCost(
    materialLines,
    materialTotal,
    extraCostsTotal,
    energyCost,
    machineCost,
    laborCost,
    packagingCost,
    totalWeightGrams,
    inputs
  );
}

function finalizeCost(
  materialLines: CostBreakdownLine[],
  materialTotal: number,
  extraCostsTotal: number,
  energyCost: number,
  machineCost: number,
  laborCost: number,
  packagingCost: number,
  totalWeightGrams: number,
  inputs: PrintCostInputs
): CostResult {
  const subtotal =
    (materialTotal + extraCostsTotal + energyCost + machineCost + laborCost + packagingCost) *
    (inputs.quantity || 1);
  const scaledMaterialLines = materialLines.map((line) => ({
    ...line,
    amount: line.amount * (inputs.quantity || 1),
  }));
  const scaledMaterialTotal = materialTotal * (inputs.quantity || 1);
  const scaledExtraCostsTotal = extraCostsTotal * (inputs.quantity || 1);
  const scaledEnergyCost = energyCost * (inputs.quantity || 1);
  const scaledMachineCost = machineCost * (inputs.quantity || 1);
  const scaledLaborCost = laborCost * (inputs.quantity || 1);
  const scaledPackagingCost = packagingCost * (inputs.quantity || 1);
  const marginAmount = subtotal * (inputs.marginPercent / 100);
  const priceBeforeVat = subtotal + marginAmount;
  const discountThreshold = inputs.quantityDiscountThreshold ?? 5;
  const configuredDiscountPercent = inputs.quantityDiscountPercent ?? 5;
  const quantityDiscountPercent = inputs.quantity >= discountThreshold
    ? Math.max(0, Math.min(100, configuredDiscountPercent))
    : 0;
  const quantityDiscountAmount = priceBeforeVat * (quantityDiscountPercent / 100);
  const vatAmount = (priceBeforeVat - quantityDiscountAmount) * (inputs.vatPercent / 100);
  const totalPrice = priceBeforeVat - quantityDiscountAmount + vatAmount;

  return {
    materialLines: scaledMaterialLines,
    materialTotal: scaledMaterialTotal,
    extraCostsTotal: scaledExtraCostsTotal,
    energyCost: scaledEnergyCost,
    machineCost: scaledMachineCost,
    laborCost: scaledLaborCost,
    packagingCost: scaledPackagingCost,
    subtotal,
    marginAmount,
    priceBeforeVat,
    quantityDiscountAmount,
    quantityDiscountPercent,
    vatAmount,
    totalPrice,
    pricePerGram: totalWeightGrams > 0 ? totalPrice / (totalWeightGrams * (inputs.quantity || 1)) : 0,
  };
}
