import { ApiError } from "./api/http";
import { getPrint, getPrintCostInputs, getSettings } from "./db";
import { createOrderCalculation } from "./orderCalculation";
import type { PrintOrder } from "./types";

export async function loadOrderCalculation(order: PrintOrder) {
  const [settings, sources] = await Promise.all([
    getSettings(),
    Promise.all(order.items.map(async (item) => {
      const [print, costInputs] = await Promise.all([getPrint(item.printId), getPrintCostInputs(item.printId)]);
      if (!print) throw new ApiError(404, "not_found", "Ein Druck aus diesem Auftrag wurde nicht gefunden.");
      return { print, costInputs };
    })),
  ]);
  return createOrderCalculation(order, sources, settings);
}
