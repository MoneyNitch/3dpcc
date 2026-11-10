import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCostInputs } from "./costCalculator";
import { defaultSettings } from "./db/shared";
import { bookPrintInventory, printInventoryTargets } from "./printInventory";
import type { MaterialBooking, ParsedPlate } from "./types";

const printId = "11111111-1111-4111-8111-111111111111";
const spool = {
  provider: "spoolman" as const, id: 7, sourceUrl: "http://localhost:7912",
  name: "PLA spool", pricePerKg: 20, remainingGrams: 500, material: "PLA", color: "#CCCCCC",
};
function plate(grams: number, filamentId: string): ParsedPlate {
  return {
    totalWeightGrams: grams, printTimeSeconds: 60, totalPrintTimeSeconds: 60,
    layerCount: 1, nozzleDiameterMm: null, printerModelId: null, bedType: null,
    filaments: [{
      filamentId, type: "PLA", color: "#CCCCCC", usedGramsTotal: grams,
      usedMetersTotal: 0, usedForObject: true, usedForSupport: false,
    }],
    objects: [], categoryTotals: [], categoryByFilament: [], thumbnailBase64: null,
  };
}
const booking: MaterialBooking = {
  id: "booking", printId, provider: spool.provider, sourceUrl: spool.sourceUrl,
  spoolId: spool.id, spoolName: spool.name, grams: 10, kind: "consumption",
  status: "confirmed", createdAt: new Date().toISOString(),
};

test("groups shared spools across selected plates and scales print quantity exactly once", () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.externalSpools = { "1": spool, "2": spool };
  inputs.quantity = 3;
  inputs.extraCosts = [{ id: "extra", name: "Clips", quantity: 2, cost: 0.4, accessoryId: "clips" }];
  const targets = printInventoryTargets(printId, [plate(10, "1"), plate(20, "2")], inputs, []);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].body.grams, 90);
  assert.deepEqual(targets[1].body, { action: "consume", source: "print", sourceId: printId });
  const single = printInventoryTargets(printId, [plate(10, "1")], inputs, []);
  assert.equal(single[0].body.grams, 30);
});

test("ignores unselected spools, zero usage, and manual accessory entries", () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.externalSpools = { "1": spool };
  inputs.extraCosts = [{ id: "manual", name: "Manual", quantity: 2, cost: 1 }];
  assert.deepEqual(printInventoryTargets(printId, [plate(0, "1"), plate(20, "2")], inputs, []), []);
});

test("never repeats confirmed, uncertain or pending spool bookings", async () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.externalSpools = { "1": spool };
  for (const status of ["confirmed", "pending", "uncertain"] as const) {
    const targets = printInventoryTargets(printId, [plate(10, "1")], inputs, [{ ...booking, status }]);
    const outcome = await bookPrintInventory(targets, async () => {
      assert.fail("An existing active booking must not trigger a request.");
    });
    assert.equal(outcome.results[0].status, status === "confirmed" ? "skipped" : "error");
  }
  const rejected = printInventoryTargets(printId, [plate(10, "1")], inputs, [{ ...booking, status: "rejected" }]);
  assert.equal(rejected[0].existing, undefined);
});

test("reports partial results, keeps processing independent entries and never retries", async () => {
  const inputs = defaultCostInputs(defaultSettings);
  inputs.externalSpools = { "1": spool, "2": { ...spool, id: 8, name: "Second spool" } };
  inputs.extraCosts = [{ id: "extra", name: "Clips", quantity: 2, cost: 0.4, accessoryId: "clips" }];
  const targets = printInventoryTargets(printId, [plate(10, "1"), plate(20, "2")], inputs, []);
  const calls: string[] = [];
  const accessories = [{ id: "clips", name: "Clips", pricePerPack: 4, unitsPerPack: 10, stockQuantity: 8 }];
  const outcome = await bookPrintInventory(targets, async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return Response.json({ booking });
    if (calls.length === 2) return Response.json({ error: "uncertain" }, { status: 502 });
    return Response.json({ accessories });
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(outcome.results.map((result) => result.status), ["booked", "error", "booked"]);
  assert.equal(outcome.results[1].code, "uncertain");
  assert.deepEqual(outcome.accessories, accessories);
});

test("accessory duplicates are skipped but racing spool duplicates remain explicitly unclear", async () => {
  const outcome = await bookPrintInventory([
    { name: "Spool", url: "/api/filament-spools", body: {} },
    { name: "accessories", url: "/api/accessory-stock", body: {} },
  ], async () => Response.json({ error: "duplicate", code: "duplicate" }, { status: 409 }));
  assert.deepEqual(outcome.results.map((result) => result.status), ["error", "skipped"]);
  assert.equal(outcome.results[0].code, "uncertain");
});

test("known stock rejection is reported without stopping independent accessory booking", async () => {
  const outcome = await bookPrintInventory([
    { name: "Spool", url: "/api/filament-spools", body: {} },
    { name: "accessories", url: "/api/accessory-stock", body: {} },
  ], async (url) => String(url) === "/api/filament-spools"
    ? Response.json({ error: "stock" }, { status: 409 })
    : Response.json({ accessories: [] }));
  assert.equal(outcome.results[0].status, "error");
  assert.equal(outcome.results[0].code, "stock");
  assert.equal(outcome.results[1].status, "booked");
});

test("missing success payload is not reported as a completed booking", async () => {
  const outcome = await bookPrintInventory([
    { name: "Spool", url: "/api/filament-spools", body: {} },
    { name: "accessories", url: "/api/accessory-stock", body: {} },
  ], async () => Response.json({}));
  assert.deepEqual(outcome.results.map((result) => result.status), ["error", "error"]);
  assert.ok(outcome.results.every((result) => result.code === "uncertain"));
});
