import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAllPlatesCost, calculateCost, defaultCostInputs, findFilamentPrice } from "./costCalculator";
import { defaultSettings } from "./db/shared";
import type { ExternalSpool } from "./externalFilaments";
import type { ParsedPlate } from "./types";

const filament = { filamentId: "1", type: "PLA", color: "#CCCCCC", usedGramsTotal: 100,
  usedMetersTotal: 0, usedForObject: true, usedForSupport: false };
const plate: ParsedPlate = {
  totalWeightGrams: 100, printTimeSeconds: 3600, totalPrintTimeSeconds: 3600,
  layerCount: 10, nozzleDiameterMm: null, printerModelId: null, bedType: null,
  filaments: [filament], objects: [], categoryTotals: [], categoryByFilament: [], thumbnailBase64: null,
};
const spool: ExternalSpool = {
  provider: "spoolman", id: 5, name: "Selected spool", material: "PLA",
  color: "#CCCCCC", pricePerKg: 30, remainingGrams: 500,
};

test("saved external spool snapshots determine material costs without a live connection", () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.externalSpools["1"] = spool;
  const saved = JSON.parse(JSON.stringify(inputs));
  const result = calculateCost(plate, defaultSettings, saved);
  assert.equal(result.materialTotal, 3);
  assert.equal(result.materialLines[0].label, "Selected spool (100.0 g)");
});

test("manual prices override snapshots; missing external prices retain the existing pricing path", () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.externalSpools["1"] = spool;
  inputs.materialPriceOverrides["1"] = 40;
  assert.equal(findFilamentPrice(filament, defaultSettings, inputs), 40);
  delete inputs.materialPriceOverrides["1"];
  inputs.externalSpools["1"] = { ...spool, pricePerKg: null };
  assert.equal(findFilamentPrice(filament, defaultSettings, inputs), 20);
  inputs.externalSpools["1"] = { ...spool, pricePerKg: 0 };
  assert.equal(calculateCost(plate, defaultSettings, inputs).materialTotal, 0);
});

test("older cost inputs without spool selections preserve existing costs", () => {
  const inputs = defaultCostInputs(defaultSettings);
  assert.deepEqual(inputs.externalSpools, {});
  const legacy = JSON.parse(JSON.stringify(inputs));
  delete legacy.externalSpools;
  assert.equal(calculateCost(plate, defaultSettings, legacy).materialTotal, 2);
});

test("all-plate costs sum plate-specific costs and apply shared costs and quantity once", () => {
  const secondPlate: ParsedPlate = {
    ...plate,
    totalWeightGrams: 200,
    totalPrintTimeSeconds: 7200,
    filaments: [{ ...filament, filamentId: "2", usedGramsTotal: 200 }],
  };
  const inputs = defaultCostInputs(defaultSettings);
  inputs.laborMinutes = 60;
  inputs.packagingCost = 5;
  inputs.extraCosts = [{ id: "extra", name: "Extra", cost: 3, quantity: 2 }];
  inputs.quantity = 2;
  inputs.marginPercent = 0;
  inputs.vatPercent = 0;
  const perPlateInputs = {
    ...inputs,
    energyKwhOverride: null,
    laborMinutes: 0,
    packagingCost: 0,
    extraCosts: [],
    quantity: 1,
  };
  const firstResult = calculateCost(plate, defaultSettings, perPlateInputs);
  const secondResult = calculateCost(secondPlate, defaultSettings, perPlateInputs);
  const result = calculateAllPlatesCost([plate, secondPlate], defaultSettings, inputs);

  assert.equal(result.materialTotal, (firstResult.materialTotal + secondResult.materialTotal) * inputs.quantity);
  assert.equal(result.machineCost, (firstResult.machineCost + secondResult.machineCost) * inputs.quantity);
  assert.equal(result.laborCost, defaultSettings.costs.laborRatePerHour * 2);
  assert.equal(result.packagingCost, 10);
  assert.equal(result.extraCostsTotal, 12);
  assert.ok(Math.abs(
    result.totalPrice -
    (firstResult.subtotal + secondResult.subtotal + 15 + 5 + 6) * 2
  ) < 1e-10);
  assert.equal(result.pricePerGram, result.totalPrice / (300 * inputs.quantity));
});

test("all-plate costs treat a measured energy override as one total for the whole project", () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.energyKwhOverride = 4;
  const result = calculateAllPlatesCost([plate, plate], defaultSettings, inputs);

  assert.equal(result.energyCost, 4 * defaultSettings.costs.electricityPricePerKwh);
});

test("quantity discount applies at the configured threshold before VAT", () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.quantityDiscountThreshold = 5;
  inputs.quantityDiscountPercent = 5;
  inputs.marginPercent = 0;
  inputs.vatPercent = 19;

  const fourCopies = calculateCost(plate, defaultSettings, { ...inputs, quantity: 4 });
  const fiveCopies = calculateCost(plate, defaultSettings, { ...inputs, quantity: 5 });
  const fiveCopiesWithoutDiscount = calculateCost(plate, defaultSettings, {
    ...inputs,
    quantity: 5,
    quantityDiscountPercent: 0,
  });

  assert.equal(fourCopies.quantityDiscountAmount, 0);
  assert.equal(fourCopies.quantityDiscountPercent, 0);
  assert.equal(fiveCopies.quantityDiscountPercent, 5);
  assert.ok(Math.abs(fiveCopies.quantityDiscountAmount - fiveCopies.subtotal * 0.05) < 1e-10);
  assert.ok(fiveCopies.totalPrice < fiveCopiesWithoutDiscount.totalPrice);
  assert.equal(fiveCopies.materialTotal, 10);
});
