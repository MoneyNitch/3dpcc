import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateCost, defaultCostInputs, findFilamentPrice } from "./costCalculator";
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
