import { z } from "zod";
import { CURRENCY_CODES } from "./currency";
import { calculateAllPlatesCost, defaultCostInputs } from "./costCalculator";
import type { AppSettings, ParsedPrint, PrintCostInputs, PrintOrder } from "./types";

const amount = z.number().finite().min(0).max(1_000_000_000);
const percent = z.number().finite().min(0).max(100);

export const orderCalculationInputsSchema = z.strictObject({
  laborMinutes: amount,
  packagingCost: amount,
  shippingCost: amount,
  marginPercent: percent,
  vatPercent: percent,
  discountPercent: percent,
});

export const orderItemCostsSchema = z.strictObject({
  printId: z.uuid(),
  materialCost: amount,
  extraCost: amount,
  energyCost: amount,
  machineCost: amount,
});

export const orderCalculationSnapshotSchema = z.strictObject({
  version: z.literal(1),
  savedAt: z.iso.datetime(),
  currency: z.enum(CURRENCY_CODES),
  laborRatePerHour: amount,
  inputs: orderCalculationInputsSchema,
  items: z.array(orderItemCostsSchema.extend({
    printName: z.string().min(1).max(2000),
    quantity: z.number().int().positive().max(1_000_000),
  })).min(1).max(100).refine((items) => new Set(items.map((item) => item.printId)).size === items.length),
});

export type OrderCalculationInputs = z.infer<typeof orderCalculationInputsSchema>;
export type OrderCalculationSnapshot = z.infer<typeof orderCalculationSnapshotSchema>;
export type OrderItemCosts = z.infer<typeof orderItemCostsSchema>;

export function createOrderCalculation(
  order: PrintOrder,
  sources: { print: ParsedPrint; costInputs: PrintCostInputs | null }[],
  settings: AppSettings,
): OrderCalculationSnapshot {
  const byId = new Map(sources.map((source) => [source.print.id, source]));
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    currency: settings.general.currency,
    laborRatePerHour: settings.costs.laborRatePerHour,
    inputs: {
      laborMinutes: settings.costs.defaultLaborMinutes,
      packagingCost: settings.costs.packagingCost,
      shippingCost: 0,
      marginPercent: settings.costs.marginPercent,
      vatPercent: settings.costs.vatPercent,
      discountPercent: 0,
    },
    items: order.items.map((item) => {
      const source = byId.get(item.printId);
      if (!source) throw new Error(`Missing print ${item.printId} for order ${order.id}.`);
      const result = calculateAllPlatesCost(source.print.plates ?? [source.print.plate], settings, {
        ...defaultCostInputs(settings),
        ...source.costInputs,
        quantity: 1,
        laborMinutes: 0,
        packagingCost: 0,
        marginPercent: 0,
        vatPercent: 0,
        quantityDiscountPercent: 0,
      });
      return {
        printId: item.printId,
        printName: source.print.displayName ?? source.print.fileName,
        quantity: item.quantity,
        materialCost: result.materialTotal,
        extraCost: result.extraCostsTotal,
        energyCost: result.energyCost,
        machineCost: result.machineCost,
      };
    }),
  };
}

export function orderCalculationMatchesItems(order: PrintOrder, snapshot: OrderCalculationSnapshot): boolean {
  return order.items.length === snapshot.items.length && order.items.every((item) =>
    snapshot.items.some((saved) => saved.printId === item.printId && saved.quantity === item.quantity));
}

export function calculateOrderSnapshot(snapshot: OrderCalculationSnapshot) {
  const { inputs } = snapshot;
  const items = snapshot.items.map((item) => ({
    printId: item.printId,
    printName: item.printName,
    quantity: item.quantity,
    totalPrice: (item.materialCost + item.extraCost + item.energyCost + item.machineCost) * item.quantity,
  }));
  const materialTotal = snapshot.items.reduce((sum, item) => sum + item.materialCost * item.quantity, 0);
  const extraCostsTotal = snapshot.items.reduce((sum, item) => sum + item.extraCost * item.quantity, 0);
  const energyCost = snapshot.items.reduce((sum, item) => sum + item.energyCost * item.quantity, 0);
  const machineCost = snapshot.items.reduce((sum, item) => sum + item.machineCost * item.quantity, 0);
  const laborCost = inputs.laborMinutes / 60 * snapshot.laborRatePerHour;
  const subtotal = materialTotal + extraCostsTotal + energyCost + machineCost +
    laborCost + inputs.packagingCost + inputs.shippingCost;
  const marginAmount = subtotal * inputs.marginPercent / 100;
  const priceBeforeVat = subtotal + marginAmount;
  const quantityDiscountAmount = priceBeforeVat * inputs.discountPercent / 100;
  const vatAmount = (priceBeforeVat - quantityDiscountAmount) * inputs.vatPercent / 100;
  return {
    items,
    totals: {
      materialTotal, extraCostsTotal, energyCost, machineCost, laborCost,
      packagingCost: inputs.packagingCost,
      shippingCost: inputs.shippingCost,
      subtotal, marginAmount, priceBeforeVat, quantityDiscountAmount, vatAmount,
      totalPrice: priceBeforeVat - quantityDiscountAmount + vatAmount,
    },
  };
}
