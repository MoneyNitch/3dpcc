import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("accessory catalog, stock, label persistence and stale Settings saves stay consistent", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-accessory-labels-"));
  const requireModule = createRequire(import.meta.url);
  const url = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const script = `
    import assert from "node:assert/strict";
    import { NextRequest } from ${JSON.stringify(pathToFileURL(requireModule.resolve("next/server")).href)};
    import * as db from ${url("./db/index.ts")};
    import * as catalog from ${url("../app/api/accessories/route.ts")};
    import * as stock from ${url("../app/api/accessory-stock/route.ts")};
    import * as labels from ${url("../app/api/labels/route.ts")};
    import * as templates from ${url("../app/api/label-templates/route.ts")};
    import * as settingsRoute from ${url("../app/api/settings/route.ts")};
    import { createLabelTemplate } from ${url("./labelTemplates.ts")};
    const request = (method, body) => new NextRequest("http://localhost/api/test", {
      method, headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    });
    const staleSettings = await db.getSettings();
    const input = {name: "Fixture clips", pricePerPack: 10, unitsPerPack: 20};
    const created = await catalog.POST(request("POST", {action:"create", item:input}));
    assert.equal(created.status, 200);
    const item = (await created.json()).accessories[0];
    assert.equal(item.stockQuantity, 0);
    assert.equal(item.numericId, 1);
    const receipt = await stock.POST(request("POST", {action:"receipt", accessoryId:item.id, quantity:50}));
    assert.equal(receipt.status, 200);
    const edit = await catalog.POST(request("POST", {action:"update", id:item.id, item:{...input, name:"Changed clips"}, expected:input}));
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).accessories[0].stockQuantity, 50);
    assert.equal((await catalog.POST(request("POST", {action:"update", id:item.id, item:input, expected:input}))).status, 409);
    const expected = {...input, name:"Changed clips"};
    assert.equal((await catalog.POST(request("POST", {action:"delete", id:item.id, expected}))).status, 409);
    const template = createLabelTemplate("fixture", "Fixture label");
    const saved = await templates.PUT(request("PUT", {templates:[template], expected:[]}));
    assert.equal(saved.status, 200);
    assert.equal((await templates.PUT(request("PUT", {templates:[], expected:[]}))).status, 409);
    const preview = await labels.POST(request("POST", {accessoryId:item.id, template}));
    assert.equal(preview.status, 200);
    assert.match((await preview.json()).svg, /width="70mm"/);
    const staleSave = await settingsRoute.PUT(request("PUT", staleSettings));
    assert.equal(staleSave.status, 200);
    db.resetStoreCache();
    let persisted = await db.getSettings();
    assert.equal(persisted.accessoryMaterials[0].name, "Changed clips");
    assert.equal(persisted.accessoryMaterials[0].stockQuantity, 50);
    assert.equal(persisted.accessoryMaterials[0].numericId, 1);
    assert.equal(persisted.nextAccessoryNumber, 2);
    assert.deepEqual(persisted.labelTemplates, [template]);
    const correction = await stock.POST(request("POST", {action:"adjustment", accessoryId:item.id, quantity:-50}));
    assert.equal(correction.status, 200);
    assert.equal((await catalog.POST(request("POST", {action:"delete", id:item.id, expected}))).status, 200);
    assert.equal((await db.getSettings()).accessoryMaterials.length, 0);
    assert.equal((await db.listAccessoryStockMovements()).length, 2);
    await settingsRoute.PUT(request("PUT", staleSettings));
    const replacements = await Promise.all([1, 2].map(() => catalog.POST(request("POST", {action:"create", item:input}))));
    assert.ok(replacements.every((response) => response.status === 200));
    db.resetStoreCache();
    assert.deepEqual((await db.getSettings()).accessoryMaterials.map((entry) => entry.numericId), [2, 3]);
    const batch = await catalog.POST(request("POST", {
      action: "createMany",
      items: [
        { name: "Batch bolts", pricePerPack: 4, unitsPerPack: 10, stockQuantity: 25 },
        { name: "Batch washers", pricePerPack: 2, unitsPerPack: 50, stockQuantity: 0 },
      ],
    }));
    assert.equal(batch.status, 200);
    const batchItems = (await batch.json()).accessories.slice(-2);
    assert.deepEqual(batchItems.map((entry) => [entry.name, entry.stockQuantity, entry.numericId]), [
      ["Batch bolts", 25, 4],
      ["Batch washers", 0, 5],
    ]);
    console.log("Accessory catalog, batch creation and label persistence verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory,
      env: { ...process.env, AUTH_ENABLED: "false", DB_DRIVER: "sqlite", TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") },
      encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("Accessory catalog, batch creation and label persistence verified"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
