import assert from "node:assert/strict";
import { test } from "node:test";
import { renamePlate } from "../plateNames";
import type { ParsedPlate, ParsedPrint } from "../types";
import { ApiError } from "./http";

const plate: ParsedPlate = {
  totalWeightGrams: 10, printTimeSeconds: 100, totalPrintTimeSeconds: 100,
  layerCount: 1, nozzleDiameterMm: null, printerModelId: null, bedType: null,
  filaments: [], objects: [], categoryTotals: [], categoryByFilament: [], thumbnailBase64: null,
};
const print: ParsedPrint = { id: crypto.randomUUID(), fileName: "test.3mf", createdAt: "",
  plate: { ...plate, plateIndex: 1 }, plates: [{ ...plate, plateIndex: 1 }, { ...plate, plateIndex: 3 }] };

test("renaming preserves measurements and keeps the first plate compatibility field in sync", () => {
  const renamed = renamePlate(print, { plateIndex: 3, plateName: "  Enclosure  " });
  assert.equal(renamed.plates?.[1].plateName, "Enclosure");
  assert.deepEqual(renamed.plate, print.plate);
  assert.equal(print.plates?.[1].plateName, undefined);
  assert.equal(renamed.plates?.[1].totalWeightGrams, 10);
  const first = renamePlate(print, { plateIndex: 1, plateName: "Base" });
  assert.equal(first.plate, first.plates?.[0]);
  assert.equal(first.plate.plateName, "Base");
});

test("older single and multi-plate records without indices can be renamed", () => {
  const single = renamePlate({ ...print, plate, plates: undefined }, { plateIndex: 1, plateName: "Single" });
  assert.equal(single.plate.plateName, "Single");
  assert.equal(single.plates, undefined);
  const old = renamePlate({ ...print, plate, plates: [plate, plate] }, { plateIndex: 2, plateName: "Second" });
  assert.equal(old.plates?.[1].plateName, "Second");
});

test("invalid plate names and unknown indices are rejected", () => {
  for (const value of [{ plateIndex: 1, plateName: "" }, { plateIndex: 1, plateName: "  " },
    { plateIndex: 1, plateName: "a".repeat(201) }, { plateIndex: 0, plateName: "Name" },
    { plateIndex: 1.5, plateName: "Name" }, { plateIndex: 1, plateName: 3 },
    { plateIndex: 1, plateName: "Name", unknown: true }]) {
    assert.throws(() => renamePlate(print, value), (error: unknown) => error instanceof ApiError && error.status === 400);
  }
  assert.throws(() => renamePlate(print, { plateIndex: 2, plateName: "Missing" }),
    (error: unknown) => error instanceof ApiError && error.status === 404);
});
