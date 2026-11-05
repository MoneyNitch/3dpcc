import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings } from "./db/shared";
import { defaultCostInputs } from "./costCalculator";
import {
  calculateOrderSnapshot, createOrderCalculation, orderCalculationMatchesItems,
  orderCalculationSnapshotSchema,
} from "./orderCalculation";
import type { ParsedPrint, PrintOrder } from "./types";

const print: ParsedPrint = {
  id: "12345678-1234-4234-8234-123456789abc",
  fileName: "order-test.3mf", createdAt: "2026-01-01T00:00:00.000Z",
  plate: {
    totalWeightGrams: 100, printTimeSeconds: 3600, totalPrintTimeSeconds: 3600,
    layerCount: 1, nozzleDiameterMm: null, printerModelId: null, bedType: null,
    filaments: [{ filamentId: "1", type: "PLA", color: "#CCCCCC", usedGramsTotal: 100,
      usedMetersTotal: 1, usedForObject: true, usedForSupport: false }],
    objects: [], categoryTotals: [], categoryByFilament: [], thumbnailBase64: null,
  },
};
const order: PrintOrder = {
  id: "12345678-1234-4234-8234-123456789abd", customerName: "Test", status: "open",
  dueDate: null, notes: "", items: [{ printId: print.id, quantity: 3 }],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

test("order calculation uses all plates and order quantities without print-level shared charges", () => {
  const settings = structuredClone(defaultSettings);
  settings.costs.laborRatePerHour = 30;
  const costInputs = {
    ...defaultCostInputs(settings),
    quantity: 900, laborMinutes: 900, packagingCost: 900, marginPercent: 100, vatPercent: 100,
    extraCosts: [{ id: "test", name: "Screw", cost: 2, quantity: 2 }],
    quantityDiscountPercent: 99,
  };
  const snapshot = createOrderCalculation(order, [{
    print: { ...print, plates: [print.plate, print.plate] }, costInputs,
  }], settings);
  snapshot.inputs = {
    laborMinutes: 60, packagingCost: 5, shippingCost: 10,
    marginPercent: 20, discountPercent: 10, vatPercent: 19,
  };
  const result = calculateOrderSnapshot(snapshot);
  assert.equal(result.totals.materialTotal, 12);
  assert.equal(result.totals.extraCostsTotal, 12);
  assert.equal(result.totals.laborCost, 30);
  assert.equal(result.totals.packagingCost, 5);
  assert.equal(result.totals.shippingCost, 10);
  assert.equal(result.totals.subtotal, result.items[0].totalPrice + 30 + 5 + 10);
  assert.ok(Math.abs(result.totals.totalPrice - result.totals.subtotal * 1.2 * 0.9 * 1.19) < 1e-8);
  assert.equal(costInputs.quantity, 900);
  assert.equal(costInputs.packagingCost, 900);
  assert.ok(orderCalculationSnapshotSchema.safeParse(snapshot).success);
});

test("snapshots remain independent of settings, print data and their saved inputs", () => {
  const settings = structuredClone(defaultSettings);
  const source = structuredClone(print);
  const inputs = defaultCostInputs(settings);
  const snapshot = createOrderCalculation(order, [{ print: source, costInputs: inputs }], settings);
  const result = calculateOrderSnapshot(snapshot);
  settings.materials[0].pricePerKg = 2000;
  settings.costs.laborRatePerHour = 999;
  source.plate.filaments[0].usedGramsTotal = 9000;
  inputs.materialPriceOverrides["1"] = 900;
  assert.deepEqual(calculateOrderSnapshot(snapshot), result);
  assert.deepEqual(calculateOrderSnapshot(JSON.parse(JSON.stringify(snapshot))), result);
  assert.equal(orderCalculationMatchesItems(order, snapshot), true);
  assert.equal(orderCalculationMatchesItems({
    ...order, items: [{ printId: print.id, quantity: 4 }],
  }, snapshot), false);
  assert.equal(orderCalculationMatchesItems({ ...order, items: [] }, snapshot), false);
});

test("multiple positions share labor, packaging and shipping only once", () => {
  const snapshot = createOrderCalculation(order, [{ print, costInputs: null }], defaultSettings);
  snapshot.laborRatePerHour = 30;
  snapshot.inputs = {
    laborMinutes: 60, packagingCost: 5, shippingCost: 10,
    marginPercent: 20, discountPercent: 10, vatPercent: 19,
  };
  snapshot.items = [
    { ...snapshot.items[0], materialCost: 2, extraCost: 3, energyCost: 4, machineCost: 5 },
    {
      ...snapshot.items[0], printId: "12345678-1234-4234-8234-123456789abe", quantity: 2,
      materialCost: 7, extraCost: 8, energyCost: 9, machineCost: 10,
    },
  ];
  const result = calculateOrderSnapshot(snapshot);
  assert.deepEqual(result.items.map((item) => item.totalPrice), [42, 68]);
  assert.equal(result.totals.subtotal, 155);
  assert.equal(result.totals.marginAmount, 31);
  assert.ok(Math.abs(result.totals.totalPrice - 199.206) < 1e-8);
  assert.equal(orderCalculationMatchesItems({
    ...order, items: snapshot.items.map(({ printId, quantity }) => ({ printId, quantity })).reverse(),
  }, snapshot), true);
});

test("order snapshot validation rejects invalid numbers, unsupported currencies and duplicate items", () => {
  const snapshot = createOrderCalculation(order, [{ print, costInputs: null }], defaultSettings);
  for (const value of [-1, NaN, Infinity]) {
    assert.equal(orderCalculationSnapshotSchema.safeParse({
      ...snapshot, inputs: { ...snapshot.inputs, shippingCost: value },
    }).success, false);
  }
  assert.equal(orderCalculationSnapshotSchema.safeParse({ ...snapshot, currency: "NOT_A_CURRENCY" }).success, false);
  assert.equal(orderCalculationSnapshotSchema.safeParse({
    ...snapshot, inputs: { ...snapshot.inputs, vatPercent: 101 },
  }).success, false);
  assert.equal(orderCalculationSnapshotSchema.safeParse({ ...snapshot, items: [snapshot.items[0], snapshot.items[0]] }).success, false);
  assert.throws(() => createOrderCalculation(order, [], defaultSettings), /Missing print/);
});
