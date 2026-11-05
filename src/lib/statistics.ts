import { calculateAllPlatesCost, defaultCostInputs } from "./costCalculator";
import type { AppSettings, ParsedPrint, PrintCostInputs, PrintOrder } from "./types";

export interface StatisticsPrint {
  print: ParsedPrint;
  costInputs: PrintCostInputs | null;
}

export interface PrintStatistics {
  printCount: number;
  printTimeSeconds: number;
  materialGrams: number;
  completedOrderValue: number;
  materials: { type: string; grams: number }[];
}

export function calculatePrintStatistics(
  prints: StatisticsPrint[],
  orders: PrintOrder[],
  settings: AppSettings
): PrintStatistics {
  const materials = new Map<string, { type: string; grams: number }>();
  const printsById = new Map(prints.map(({ print, costInputs }) => [print.id, { print, costInputs }]));
  let printTimeSeconds = 0;
  let materialGrams = 0;

  for (const { print } of prints) {
    const plates = print.plates?.length ? print.plates : [print.plate];
    for (const plate of plates) {
      printTimeSeconds += plate.totalPrintTimeSeconds;
      materialGrams += plate.totalWeightGrams;
      for (const filament of plate.filaments) {
        const key = filament.type.trim().toLocaleLowerCase();
        const existing = materials.get(key);
        if (existing) {
          existing.grams += filament.usedGramsTotal;
        } else {
          materials.set(key, { type: filament.type, grams: filament.usedGramsTotal });
        }
      }
    }
  }

  let completedOrderValue = 0;
  for (const order of orders) {
    if (order.status !== "completed") continue;
    for (const item of order.items) {
      const saved = printsById.get(item.printId);
      if (!saved) {
        throw new Error(`Auftrag ${order.id} verweist auf den nicht gefundenen Druck ${item.printId}.`);
      }
      const plates = saved.print.plates?.length ? saved.print.plates : [saved.print.plate];
      const inputs = {
        ...defaultCostInputs(settings),
        ...saved.costInputs,
        quantity: item.quantity,
      };
      completedOrderValue += calculateAllPlatesCost(plates, settings, inputs).totalPrice;
    }
  }

  return {
    printCount: prints.length,
    printTimeSeconds,
    materialGrams,
    completedOrderValue,
    materials: [...materials.values()].sort((a, b) => b.grams - a.grams),
  };
}
