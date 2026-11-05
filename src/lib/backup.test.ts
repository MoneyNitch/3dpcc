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
    import { orderGcodeFiles } from ${url("./orderGcode.ts")};
    import { createOrderCalculation } from ${url("./orderCalculation.ts")};

    const authStore = getAuthStore();
    await authStore.initialize();
    const admin = authStore.overview().users.find((user) => user.username === "admin");
    assert.ok(admin);
    const oldSession = authStore.newSession(admin.id);
    const settings = await db.getSettings();
    await db.saveSettings({ ...settings, general: { ...settings.general, companyName: "Backup studio" } });
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
    await db.savePrintCostInputs(id, defaultCostInputs(await db.getSettings()));
    await db.savePrintModel(id, Buffer.from("saved-preview"));
    const orderId = randomUUID();
    const gcode = Buffer.from("G28\\nG1 X10");
    await db.saveOrder({
      id: orderId, customerName: "Backup customer", status: "in_progress", dueDate: "2026-12-01",
      notes: "Keep this order", items: [{ printId: id, quantity: 3 }],
      gcodeAttachment: { fileName: "backup.gcode", size: gcode.byteLength }, createdAt: now, updatedAt: now,
    });
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
    const store = (await import(${url("./db/sqliteStore.ts")})).createSqliteStore();
    await store.deletePrint(id);
    await originalArchives.save(id, Buffer.from("changed"));
    saveFilamentConnection("spoolman", { url: "", apiKey: "" });

    await restoreBackup(backup, "a sufficiently long backup passphrase");
    assert.equal((await db.getSettings()).general.companyName, "Backup studio");
    assert.equal((await db.getPrint(id)).fileName, "backup-test.3mf");
    assert.equal((await db.getPrintCostInputs(id)).quantity, 1);
    assert.deepEqual(await db.getPrintModel(id), Buffer.from("saved-preview"));
    assert.equal((await db.listOrders())[0].id, orderId);
    assert.equal((await db.listOrders())[0].gcodeAttachment.fileName, "backup.gcode");
    assert.deepEqual((await db.listOrders())[0].calculation, orderCalculation);
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
