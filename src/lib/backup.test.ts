import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("encrypted full backups restore application records, auth and local files", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-backup-test-"));
  const requireModule = createRequire(import.meta.url);
  const url = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const script = `
    import assert from "node:assert/strict";
    import { randomUUID } from "node:crypto";
    import { createBackup, restoreBackup, BackupError } from ${url("./backup.ts")};
    import * as db from ${url("./db/index.ts")};
    import { defaultCostInputs } from ${url("./costCalculator.ts")};
    import { getAuthStore } from ${url("./auth/store.ts")};
    import { getFilamentConnections, saveFilamentConnection } from ${url("./filamentConfig.ts")};
    import { originalArchives } from ${url("./originalArchives.ts")};
    import { productFiles } from ${url("./productFiles.ts")};
    import { orderGcodeFiles } from ${url("./orderGcode.ts")};
    import { createOrderCalculation } from ${url("./orderCalculation.ts")};
    import { materialBookingActiveKey } from ${url("./db/shared.ts")};
    import { POST as accessoryStockPost } from ${url("../app/api/accessory-stock/route.ts")};
    import { createLabelTemplate } from ${url("./labelTemplates.ts")};

    const authStore = getAuthStore();
    await authStore.initialize();
    const admin = authStore.overview().users.find((user) => user.username === "admin");
    assert.ok(admin);
    const oldSession = authStore.newSession(admin.id);
    const settings = await db.getSettings();
    const productId = randomUUID();
    const productType = {
      id: productId, name: "Backup lamp", prefix: "LAMP-", digits: 5, nextNumber: 7, fileName: "lamp.3mf",
      linkedPrintId: null, imageMode: "custom", imageBase64: "data:image/png;base64,aGVsbG8=",
      serialNumbers: [{ serialNumber: "LAMP-00001", orderId: null }],
    };
    const productFile = Buffer.from("product-source-archive");
    await db.updateSettings((current) => ({ ...current, productTypes: [productType] }));
    await productFiles.save(productId, productFile);
    const accessory = { id: randomUUID(), numericId: 87, name: "Backup clips", pricePerPack: 4, unitsPerPack: 10, stockQuantity: 0 };
    await db.saveSettings({
      ...settings,
      general: { ...settings.general, companyName: "Backup studio" },
      accessoryMaterials: [accessory],
      nextAccessoryNumber: 120,
      labelTemplates: [createLabelTemplate("backup-label", "Backup label")],
    });
    const id = randomUUID();
    const now = new Date().toISOString();
    const print = {
      id, fileName: "backup-test.3mf", createdAt: now,
      plate: {
        totalWeightGrams: 20, printTimeSeconds: 60, totalPrintTimeSeconds: 60, layerCount: 1,
        nozzleDiameterMm: null, printerModelId: null, bedType: null, filaments: [], objects: [],
        categoryTotals: [], categoryByFilament: [], thumbnailBase64: null,
      },
    };
    await db.insertPrint(print);
    const printInputs = defaultCostInputs(await db.getSettings());
    printInputs.extraCosts = [{
      id: randomUUID(), name: accessory.name, cost: 0.4, quantity: 2, accessoryId: accessory.id,
    }];
    await db.savePrintCostInputs(id, printInputs);
    await db.savePrintModel(id, Buffer.from("saved-preview"));
    const materialBooking = {
      id: randomUUID(), printId: id, provider: "spoolman", sourceUrl: "http://localhost:7912",
      spoolId: 7, spoolName: "Backup spool", grams: 12.5, kind: "consumption",
      status: "confirmed", createdAt: now,
    };
    const store = (await import(${url("./db/sqliteStore.ts")})).createSqliteStore();
    const receipt = {
      id: randomUUID(), accessoryId: accessory.id, accessoryName: accessory.name, quantity: 5,
      kind: "receipt", reference: "Wareneingang", referenceKey: null, createdAt: now,
    };
    assert.equal(await db.applyAccessoryStockMovements([receipt]), "applied");
    const consumeRequest = () => new Request("http://localhost/api/accessory-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "consume", source: "print", sourceId: id }),
    });
    const consumed = await accessoryStockPost(consumeRequest());
    assert.equal(consumed.status, 200);
    assert.equal((await consumed.json()).accessories[0].stockQuantity, 3);
    const duplicate = await accessoryStockPost(consumeRequest());
    assert.equal(duplicate.status, 409);
    const usage = (await db.listAccessoryStockMovements()).find((movement) => movement.kind === "consumption");
    assert.ok(usage);
    assert.equal(await db.applyAccessoryStockMovements([{
      ...usage, id: randomUUID(), quantity: -4, referenceKey: "consumption:print:second",
    }]), "insufficient");
    const updatedSettings = await db.getSettings();
    await db.saveSettings({
      ...updatedSettings,
      accessoryMaterials: updatedSettings.accessoryMaterials.map((item) => ({ ...item, stockQuantity: 999 })),
    });
    assert.equal((await db.getSettings()).accessoryMaterials[0].stockQuantity, 3);
    assert.equal(await store.createMaterialBooking(materialBooking, materialBookingActiveKey(materialBooking)), true);
    const orderId = randomUUID();
    const customer = {
      id: randomUUID(), name: "Backup customer", company: "", email: "backup@example.invalid", phone: "",
      billingAddress: "Saved address", shippingAddress: "", notes: "", archived: false,
      createdAt: now, updatedAt: now,
    };
    assert.equal(await db.saveCustomer(customer), true);
    const gcode = Buffer.from("G28\\nG1 X10");
    await db.saveOrder({
      id: orderId, customerName: "Backup customer", status: "in_progress", dueDate: "2026-12-01",
      customerId: customer.id, customerSnapshot: customer,
      paymentStatus: "paid", paidAmount: 50, paymentCurrency: "EUR", paymentMethod: "Card",
      shippingStatus: "shipped", shippingMethod: "Parcel", trackingNumber: "BACKUP123",
      notes: "Keep this order", items: [{ printId: id, quantity: 3 }],
      gcodeAttachment: { fileName: "backup.gcode", size: gcode.byteLength }, createdAt: now, updatedAt: now,
    });
    const orderConsumption = await accessoryStockPost(new Request("http://localhost/api/accessory-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "consume", source: "order", sourceId: orderId }),
    }));
    assert.equal(orderConsumption.status, 409);
    assert.equal((await orderConsumption.json()).code, "insufficient_stock");
    const savedOrder = (await db.listOrders())[0];
    const orderCalculation = createOrderCalculation(savedOrder, [{
      print, costInputs: await db.getPrintCostInputs(id),
    }], await db.getSettings());
    orderCalculation.inputs.shippingCost = 9;
    await db.saveOrder({ ...savedOrder, calculation: orderCalculation });
    const original = Buffer.from("original-source-archive");
    await originalArchives.save(id, original);
    await orderGcodeFiles.save(orderId, gcode);
    saveFilamentConnection("spoolman", { url: "http://localhost:7912", apiKey: "restore-secret" });

    const backup = await createBackup("a sufficiently long backup passphrase");
    await assert.rejects(restoreBackup(backup, "wrong passphrase"), BackupError);

    const changedSettings = await db.getSettings();
    await db.saveSettings({ ...changedSettings, general: { ...changedSettings.general, companyName: "Changed" } });
    await db.deleteOrder(orderId);
    await orderGcodeFiles.remove(orderId);
    await store.deletePrint(id);
    await originalArchives.save(id, Buffer.from("changed"));
    await productFiles.remove(productId);
    saveFilamentConnection("spoolman", { url: "", apiKey: "" });

    await restoreBackup(backup, "a sufficiently long backup passphrase");
    assert.equal((await db.getSettings()).general.companyName, "Backup studio");
    assert.equal((await db.getSettings()).labelTemplates[0].name, "Backup label");
    assert.equal((await db.getSettings()).accessoryMaterials[0].numericId, 87);
    assert.equal((await db.getSettings()).nextAccessoryNumber, 120);
    assert.deepEqual((await db.getSettings()).productTypes, [productType]);
    assert.deepEqual(await productFiles.read(productId), productFile);
    assert.equal((await db.getPrint(id)).fileName, "backup-test.3mf");
    assert.equal((await db.getPrintCostInputs(id)).quantity, 1);
    assert.equal((await db.getSettings()).accessoryMaterials[0].stockQuantity, 3);
    assert.deepEqual((await db.listAccessoryStockMovements()).map((movement) => movement.id).sort(), [usage.id, receipt.id].sort());
    assert.deepEqual(await db.getPrintModel(id), Buffer.from("saved-preview"));
    assert.equal((await db.listOrders())[0].id, orderId);
    assert.deepEqual(await db.listCustomers(), [customer]);
    assert.deepEqual((await db.listOrders())[0].customerSnapshot, customer);
    assert.equal((await db.listOrders())[0].paymentStatus, "paid");
    assert.equal((await db.listOrders())[0].trackingNumber, "BACKUP123");
    assert.equal((await db.listOrders())[0].gcodeAttachment.fileName, "backup.gcode");
    assert.deepEqual((await db.listOrders())[0].calculation, orderCalculation);
    assert.deepEqual(await db.listMaterialBookings(id), [materialBooking]);
    assert.deepEqual(await orderGcodeFiles.read(orderId), gcode);
    assert.deepEqual(await originalArchives.read(id), original);
    assert.equal(getFilamentConnections().spoolman.apiKey, "restore-secret");
    assert.equal(getAuthStore().overview().users.some((user) => user.username === "admin"), true);
    assert.equal(getAuthStore().session(oldSession), null);
    console.log("Encrypted full backup restore verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory,
      env: {
        ...process.env,
        AUTH_ENABLED: "false",
        DB_DRIVER: "sqlite",
        TSX_TSCONFIG_PATH: path.resolve("tsconfig.json"),
      },
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("Encrypted full backup restore verified"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
