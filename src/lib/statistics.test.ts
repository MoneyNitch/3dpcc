import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAllPlatesCost, defaultCostInputs } from "./costCalculator";
import { defaultSettings } from "./db/shared";
import { calculatePrintStatistics } from "./statistics";
import { calculateOrderSnapshot, createOrderCalculation } from "./orderCalculation";
import type { ParsedPlate, ParsedPrint, PrintOrder } from "./types";

const plate: ParsedPlate = {
  totalWeightGrams: 100,
  printTimeSeconds: 1800,
  totalPrintTimeSeconds: 3600,
  layerCount: 10,
  nozzleDiameterMm: null,
  printerModelId: null,
  bedType: null,
  filaments: [{
    filamentId: "1",
    type: "PLA",
    color: "#CCCCCC",
    usedGramsTotal: 100,
    usedMetersTotal: 0,
    usedForObject: true,
    usedForSupport: false,
  }],
  objects: [],
  categoryTotals: [],
  categoryByFilament: [],
  thumbnailBase64: null,
};

const print: ParsedPrint = {
  id: "print-1",
  fileName: "sample.3mf",
  createdAt: "2026-01-01T00:00:00.000Z",
  plate,
};

function order(status: PrintOrder["status"], quantity = 1): PrintOrder {
  return {
    id: `order-${status}`,
    customerName: "Test",
    status,
    dueDate: null,
    notes: "",
    items: [{ printId: print.id, quantity }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("aggregates saved print time and material and values only completed orders", () => {
  const result = calculatePrintStatistics(
    [{ print, costInputs: defaultCostInputs(defaultSettings) }],
    [order("completed", 2), order("open", 5)],
    defaultSettings
  );

  assert.equal(result.printCount, 1);
  assert.equal(result.printTimeSeconds, 3600);
  assert.equal(result.materialGrams, 100);
  assert.equal(result.materials[0]?.type, "PLA");
  assert.equal(result.materials[0]?.grams, 100);
  assert.equal(
    result.completedOrderValue,
    calculateAllPlatesCost([plate], defaultSettings, {
      ...defaultCostInputs(defaultSettings),
      quantity: 2,
    }).totalPrice
  );
});

test("completed orders use their frozen order price instead of current print settings", () => {
  const completed = order("completed");
  const snapshot = createOrderCalculation(completed, [{ print, costInputs: null }], defaultSettings);
  snapshot.inputs.shippingCost = 25;
  const changedSettings = structuredClone(defaultSettings);
  changedSettings.materials[0].pricePerKg = 900;
  const result = calculatePrintStatistics(
    [{ print, costInputs: null }], [{ ...completed, calculation: snapshot }], changedSettings,
  );
  assert.equal(result.completedOrderValue, calculateOrderSnapshot(snapshot).totals.totalPrice);
  const mixed = calculatePrintStatistics(
    [{ print, costInputs: null }],
    [{ ...completed, calculation: snapshot }, { ...completed, id: "foreign-order", calculation: { ...snapshot, currency: "USD" } }],
    { ...defaultSettings, general: { ...defaultSettings.general, currency: "EUR" } },
  );
  assert.equal(mixed.completedOrderValue, result.completedOrderValue);
  assert.deepEqual(mixed.completedOrderValues, [
    { currency: "EUR", value: result.completedOrderValue },
    { currency: "USD", value: result.completedOrderValue },
  ]);
});
