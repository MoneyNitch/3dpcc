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
    materialPriceOverrides: {},
    quantity: 1,
    energyKwhOverride: null,
    extraCosts: [],
    printerId: null,
  };
}

export function calculateCost(
  plate: ParsedPlate,
  settings: AppSettings,
  inputs: PrintCostInputs
): CostResult {
  const printHours = plate.totalPrintTimeSeconds / 3600;

  const materialLines: CostBreakdownLine[] = plate.filaments.map((f) => {
    const pricePerKg =
      inputs.materialPriceOverrides[f.filamentId] ??
      findMaterialPriceForFilament(f, settings);
    const rawAmount = (f.usedGramsTotal / 1000) * pricePerKg;
    // Never bill less than 1 cent per material actually used.
    const amount = rawAmount > 0 ? Math.max(rawAmount, 0.01) : 0;
    return {
      label: `${f.type} ${f.color} (${f.usedGramsTotal.toFixed(1)} g)`,
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

  const subtotal =
    materialTotal + extraCostsTotal + energyCost + machineCost + laborCost + packagingCost;
  const marginAmount = subtotal * (inputs.marginPercent / 100);
  const priceBeforeVat = subtotal + marginAmount;
  const vatAmount = priceBeforeVat * (inputs.vatPercent / 100);
  const totalPrice = (priceBeforeVat + vatAmount) * (inputs.quantity || 1);

  return {
    materialLines,
    materialTotal,
    extraCostsTotal,
    energyCost,
    machineCost,
    laborCost,
    packagingCost,
    subtotal,
    marginAmount,
    priceBeforeVat,
    vatAmount,
    totalPrice,
    pricePerGram: plate.totalWeightGrams > 0 ? totalPrice / plate.totalWeightGrams : 0,
  };
}
