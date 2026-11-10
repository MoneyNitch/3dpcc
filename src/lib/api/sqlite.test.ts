import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("API writes survive reopening the SQLite backend in an isolated data directory", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-api-test-"));
  const requireModule = createRequire(import.meta.url);
  const script = `
    import assert from "node:assert/strict";
    import { createSqliteStore } from ${JSON.stringify(new URL("../db/sqliteStore.ts", import.meta.url).href)};
    import { createOperations } from ${JSON.stringify(new URL("./operations.ts", import.meta.url).href)};
    import { dispatchApi } from ${JSON.stringify(new URL("./router.ts", import.meta.url).href)};
    import { POST as upload } from ${JSON.stringify(new URL("../../app/api/prints/route.ts", import.meta.url).href)};
    import { GET as download } from ${JSON.stringify(new URL("../../app/api/prints/[id]/download/route.ts", import.meta.url).href)};
    import { PATCH as rename } from ${JSON.stringify(new URL("../../app/api/prints/[id]/plates/route.ts", import.meta.url).href)};
    import { originalArchives } from ${JSON.stringify(new URL("../originalArchives.ts", import.meta.url).href)};
    import { deletePrint } from ${JSON.stringify(new URL("../db/index.ts", import.meta.url).href)};
    import { POST as createOrder } from ${JSON.stringify(new URL("../../app/api/orders/route.ts", import.meta.url).href)};
    import { PUT as reorderQueue } from ${JSON.stringify(new URL("../../app/api/orders/queue/route.ts", import.meta.url).href)};
    import { PATCH as updateOrderStatus, PUT as updateOrder, DELETE as deleteOrder } from ${JSON.stringify(new URL("../../app/api/orders/[id]/route.ts", import.meta.url).href)};
    import { POST as uploadOrderGcode, GET as downloadOrderGcode, DELETE as deleteOrderGcode } from ${JSON.stringify(new URL("../../app/api/orders/[id]/gcode/route.ts", import.meta.url).href)};
    import { GET as calculateOrder, PUT as saveCalculation } from ${JSON.stringify(new URL("../../app/api/orders/[id]/calculate/route.ts", import.meta.url).href)};
    import { createOrderCalculation, calculateOrderSnapshot } from ${JSON.stringify(new URL("../orderCalculation.ts", import.meta.url).href)};
    import { orderGcodeFiles } from ${JSON.stringify(new URL("../orderGcode.ts", import.meta.url).href)};
    import { POST as consumeSpool } from ${JSON.stringify(new URL("../../app/api/filament-spools/route.ts", import.meta.url).href)};
    import { POST as reverseBooking } from ${JSON.stringify(new URL("../../app/api/filament-bookings/route.ts", import.meta.url).href)};
    import { saveFilamentConnection } from ${JSON.stringify(new URL("../filamentConfig.ts", import.meta.url).href)};
    import { DELETE as deletePrintRoute } from ${JSON.stringify(new URL("../../app/api/prints/[id]/route.ts", import.meta.url).href)};
    import AdmZip from ${JSON.stringify(pathToFileURL(requireModule.resolve("adm-zip")).href)};
    const store = createSqliteStore();
    saveFilamentConnection("spoolman", { url: "http://localhost:7912", apiKey: "" });
    const originalFetch = globalThis.fetch;
    const consumedPrintId = crypto.randomUUID();
    let stockWrites = 0;
    globalThis.fetch = async (_url, options) => {
      if (options?.method === "PUT") {
        stockWrites++;
        assert.deepEqual(JSON.parse(options.body), { use_weight: 25 });
        return Response.json({});
      }
      return Response.json([{
        id: 1, remaining_weight: 100,
        filament: { name: "Test", material: "PLA" },
      }]);
    };
    try {
      const consumption = { printId: consumedPrintId, provider: "spoolman", sourceUrl: "http://localhost:7912", id: 1, grams: 25, confirmed: true };
      const consume = (body) => consumeSpool(new Request("http://localhost/api/filament-spools", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      assert.equal((await consume({ ...consumption, confirmed: false })).status, 400);
      assert.equal((await consume({ ...consumption, sourceUrl: "http://different-server" })).status, 409);
      assert.equal((await consume({ ...consumption, grams: 101 })).status, 409);
      assert.equal(stockWrites, 0);
      assert.equal((await consume(consumption)).status, 200);
      assert.equal(stockWrites, 1);
      assert.equal((await consume(consumption)).status, 409);
      const savedBooking = (await store.listMaterialBookings(consumption.printId))[0];
      assert.equal(savedBooking.status, "confirmed");
      assert.equal(savedBooking.grams, 25);
      const reverse = await reverseBooking(new Request("http://localhost/api/filament-bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedBookingId: savedBooking.id, confirmed: true }),
      }));
      assert.equal(reverse.status, 200);
      assert.equal((await reverse.json()).booking.kind, "reversal");
      assert.equal((await reverseBooking(new Request("http://localhost/api/filament-bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedBookingId: savedBooking.id, confirmed: true }),
      }))).status, 409);
      assert.equal(stockWrites, 1);
      assert.equal((await store.listMaterialBookings(consumption.printId)).length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const unexpected = async () => { throw new Error("Unexpected preview operation"); };
    const operations = createOperations({
      store, upload: unexpected, splitPlates: unexpected, model: unexpected,
      retryModel: unexpected, cancelPreview: async () => {}, settingsChanged: async () => {},
    });
    async function send(path, method, body) {
      const request = new Request("http://localhost/api/v1" + path, {
        method, headers: { Authorization: "Bearer " + process.env.API_KEYS, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return dispatchApi(request, path.slice(1).split("/"), operations, unexpected);
    }
    const created = await send("/prints", "POST", {
      name: "Persistent API print", minutes: 30,
      filaments: [{ filamentId: "1", type: "PLA", color: "#CCCCCC", usedGramsTotal: 50 }],
    });
    assert.equal(created.status, 201);
    const { print } = await created.json();
    assert.equal((await send("/prints/" + print.id + "/cost-inputs", "PUT", { quantity: 4 })).status, 200);
    assert.equal((await send("/settings", "PATCH", { general: { companyName: "API test" } })).status, 200);
    const reopened = createSqliteStore();
    assert.equal((await reopened.listMaterialBookings(consumedPrintId)).length, 2);
    assert.equal((await reopened.getPrint(print.id)).displayName, "Persistent API print");
    assert.equal((await reopened.getPrintCostInputs(print.id)).quantity, 4);
    const renameResponse = await rename(new Request("http://localhost", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plateIndex: 1, plateName: "Named plate" }),
    }), { params: Promise.resolve({ id: print.id }) });
    assert.equal(renameResponse.status, 200);
    assert.equal((await reopened.getPrint(print.id)).plate.plateName, "Named plate");
    assert.equal((await reopened.getSettings()).general.companyName, "API test");
    const assignedPrinterId = (await reopened.getSettings()).defaultPrinterId;
    const orderBody = {
      customerName: "Persistent customer", status: "open", dueDate: "2026-12-01",
      notes: "Test order", printerId: assignedPrinterId, items: [{ printId: print.id, quantity: 2 }],
    };
    const createdOrder = await createOrder(new Request("http://localhost/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderBody),
    }));
    assert.equal(createdOrder.status, 201);
    const { order } = await createdOrder.json();
    assert.equal(order.history[0].type, "created");
    const secondOrderResponse = await createOrder(new Request("http://localhost/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...orderBody, customerName: "Second queue order" }),
    }));
    assert.equal(secondOrderResponse.status, 201);
    const { order: secondOrder } = await secondOrderResponse.json();
    const reorderedQueue = await reorderQueue(new Request("http://localhost/api/orders/queue", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerId: assignedPrinterId, orderIds: [secondOrder.id, order.id] }),
    }));
    assert.equal(reorderedQueue.status, 200);
    assert.deepEqual((await reopened.listOrders()).sort((left, right) =>
      (left.queuePosition ?? 0) - (right.queuePosition ?? 0))
      .map((item) => item.id), [secondOrder.id, order.id]);
    assert.equal((await reopened.listOrders())[0].customerName, "Persistent customer");
    assert.equal((await reopened.listOrders())[0].priority, "normal");
    const gcodeBytes = Buffer.from("; generated G-code\\nG28\\n");
    const uploadGcode = () => uploadOrderGcode(new Request("http://localhost/api/orders/" + order.id + "/gcode", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent("Kundenauftrag.gcode") },
      body: gcodeBytes,
    }), { params: Promise.resolve({ id: order.id }) });
    const attached = await uploadGcode();
    assert.equal(attached.status, 200);
    assert.equal((await reopened.listOrders())[0].gcodeAttachment.fileName, "Kundenauftrag.gcode");
    assert.equal((await reopened.listOrders())[0].gcodeAttachment.size, gcodeBytes.length);
    const downloadedGcode = await downloadOrderGcode(new Request("http://localhost/api/orders/" + order.id + "/gcode"), {
      params: Promise.resolve({ id: order.id }),
    });
    assert.equal(downloadedGcode.status, 200);
    assert.deepEqual(Buffer.from(await downloadedGcode.arrayBuffer()), gcodeBytes);
    const unsupportedGcode = await uploadOrderGcode(new Request("http://localhost/api/orders/" + order.id + "/gcode", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent("invalid.txt") },
      body: gcodeBytes,
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(unsupportedGcode.status, 400);
    const removedGcode = await deleteOrderGcode(new Request("http://localhost/api/orders/" + order.id + "/gcode", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(removedGcode.status, 200);
    assert.equal((await reopened.listOrders())[0].gcodeAttachment, undefined);
    assert.equal(await orderGcodeFiles.read(order.id), null);
    assert.equal((await uploadGcode()).status, 200);
    const calculationResponse = await calculateOrder(new Request("http://localhost/api/orders/" + order.id + "/calculate"), {
      params: Promise.resolve({ id: order.id }),
    });
    assert.equal(calculationResponse.status, 200);
    const { calculation, snapshot: previewSnapshot } = await calculationResponse.json();
    assert.equal((await reopened.listOrders())[0].calculation, undefined);
    assert.equal(calculation.items.length, 1);
    assert.equal(calculation.items[0].quantity, 2);
    const savedSettings = await reopened.getSettings();
    const savedCostInputs = await reopened.getPrintCostInputs(print.id);
    const savedPrint = await reopened.getPrint(print.id);
    assert.ok(savedPrint);
    const expectedSnapshot = createOrderCalculation(order, [{ print: savedPrint, costInputs: savedCostInputs }],
      savedSettings,
    );
    const expectedOrderPrice = calculateOrderSnapshot(expectedSnapshot).totals.totalPrice;
    assert.equal(calculation.totals.totalPrice, expectedOrderPrice);
    assert.equal((await reopened.getPrintCostInputs(print.id)).quantity, 4);
    const calculationInputs = { ...previewSnapshot.inputs, shippingCost: 8, laborMinutes: 45 };
    const itemCosts = previewSnapshot.items.map(({ printId, materialCost, extraCost, energyCost, machineCost }) => ({
      printId, materialCost: materialCost + 1, extraCost, energyCost, machineCost,
    }));
    async function saveOrderCalculation(overrides = {}) {
      const current = (await reopened.listOrders())[0];
      return saveCalculation(new Request("http://localhost/api/orders/" + order.id + "/calculate", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: current.updatedAt, currency: previewSnapshot.currency, inputs: calculationInputs,
          itemCosts, refresh: false, ...overrides,
        }),
      }), { params: Promise.resolve({ id: order.id }) });
    }
    assert.equal((await saveOrderCalculation({ inputs: { ...calculationInputs, shippingCost: -1 } })).status, 400);
    assert.equal((await saveOrderCalculation({ expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })).status, 409);
    assert.equal((await saveOrderCalculation({ currency: "USD" })).status, 409);
    assert.equal((await saveOrderCalculation({ itemCosts: [itemCosts[0], itemCosts[0]] })).status, 400);
    assert.equal((await saveOrderCalculation()).status, 200);
    let frozenSnapshot = (await reopened.listOrders())[0].calculation;
    assert.equal(frozenSnapshot.inputs.shippingCost, 8);
    assert.equal(frozenSnapshot.items[0].materialCost, itemCosts[0].materialCost);
    const originalSettings = await reopened.getSettings();
    await store.saveSettings({ ...originalSettings, general: { ...originalSettings.general, currency: "USD" } });
    assert.equal((await saveOrderCalculation({ refresh: true })).status, 409);
    assert.deepEqual((await reopened.listOrders())[0].calculation, frozenSnapshot);
    assert.equal((await saveOrderCalculation()).status, 200);
    assert.equal((await reopened.listOrders())[0].calculation.currency, frozenSnapshot.currency);
    frozenSnapshot = (await reopened.listOrders())[0].calculation;
    await store.saveSettings({
      ...originalSettings,
      costs: { ...originalSettings.costs, laborRatePerHour: originalSettings.costs.laborRatePerHour + 20 },
      materials: originalSettings.materials.map((material) => ({ ...material, pricePerKg: 200 })),
    });
    await store.savePrintCostInputs(print.id, { ...savedCostInputs, materialPriceOverrides: { "1": 500 } });
    const frozenResponse = await calculateOrder(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) });
    const frozenRead = await frozenResponse.json();
    assert.deepEqual(frozenRead.snapshot, frozenSnapshot);
    assert.equal(frozenRead.calculation.totals.totalPrice, calculateOrderSnapshot(frozenSnapshot).totals.totalPrice);
    assert.equal((await saveOrderCalculation()).status, 200);
    assert.equal((await reopened.listOrders())[0].calculation.laborRatePerHour, frozenSnapshot.laborRatePerHour);
    assert.equal((await saveOrderCalculation({ refresh: true })).status, 200);
    const refreshedSnapshot = (await reopened.listOrders())[0].calculation;
    assert.notEqual(refreshedSnapshot.items[0].materialCost, frozenSnapshot.items[0].materialCost);
    assert.equal(refreshedSnapshot.laborRatePerHour, originalSettings.costs.laborRatePerHour + 20);
    assert.equal(refreshedSnapshot.inputs.shippingCost, 8);
    assert.equal((await reopened.getPrintCostInputs(print.id)).quantity, 4);
    await store.saveSettings(originalSettings);
    await store.savePrintCostInputs(print.id, savedCostInputs);
    await assert.rejects(reopened.deletePrint(print.id), /einem Auftrag zugeordnet/);
    assert.ok(await reopened.getPrint(print.id));
    const linkedDelete = await deletePrintRoute(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: print.id }),
    });
    assert.equal(linkedDelete.status, 409);
    const updatedOrder = await updateOrder(new Request("http://localhost/api/orders/" + order.id, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...orderBody, items: [{ printId: print.id, quantity: 3 }], status: "in_progress" }),
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(updatedOrder.status, 200);
    assert.equal((await reopened.listOrders())[0].status, "in_progress");
    assert.deepEqual((await reopened.listOrders())[0].calculation, refreshedSnapshot);
    const outdatedRead = await calculateOrder(new Request("http://localhost"), { params: Promise.resolve({ id: order.id }) });
    assert.equal((await outdatedRead.json()).outdated, true);
    assert.equal((await saveOrderCalculation()).status, 409);
    assert.equal((await saveOrderCalculation({ refresh: true })).status, 200);
    assert.equal((await reopened.listOrders())[0].calculation.items[0].quantity, 3);
    const finalSnapshot = (await reopened.listOrders())[0].calculation;
    const changedStatus = await updateOrderStatus(new Request("http://localhost/api/orders/" + order.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready" }),
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(changedStatus.status, 200);
    assert.equal((await reopened.listOrders())[0].status, "ready");
    assert.deepEqual((await reopened.listOrders())[0].calculation, finalSnapshot);
    assert.equal((await reopened.listOrders())[0].notes, "Test order");
    const changedPriority = await updateOrderStatus(new Request("http://localhost/api/orders/" + order.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: "high" }),
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(changedPriority.status, 200);
    assert.equal((await reopened.listOrders())[0].priority, "high");
    assert.equal((await reopened.listOrders())[0].status, "ready");
    const completedOrder = await updateOrderStatus(new Request("http://localhost/api/orders/" + order.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(completedOrder.status, 200);
    const completedHistory = (await reopened.listOrders())[0].history;
    assert.ok(completedHistory.some((event) => event.type === "updated"));
    assert.ok(completedHistory.some((event) => event.type === "completed"));
    const invalidStatus = await updateOrderStatus(new Request("http://localhost/api/orders/" + order.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    }), { params: Promise.resolve({ id: order.id }) });
    assert.equal(invalidStatus.status, 400);
    assert.equal((await deleteOrder(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: order.id }),
    })).status, 200);
    assert.equal((await deleteOrder(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: secondOrder.id }),
    })).status, 200);
    assert.equal((await reopened.listOrders()).length, 0);
    assert.equal(await orderGcodeFiles.read(order.id), null);
    assert.equal((await send("/prints/" + print.id, "DELETE")).status, 200);
    assert.equal(await reopened.getPrint(print.id), null);
    const zip = new AdmZip();
    zip.addFile("Metadata/slice_info.config", Buffer.from('<config><plate><metadata key="prediction" value="3600"/><metadata key="weight" value="100"/><filament id="1" type="PLA" color="#CCCCCC" used_m="30" used_g="100"/></plate></config>'));
    const archiveBytes = zip.toBuffer();
    async function uploadOriginal(enabled) {
      const settings = await store.getSettings();
      await store.saveSettings({ ...settings, general: { ...settings.general, enable3dPreview: false, retainOriginalArchives: enabled } });
      const form = new FormData();
      form.set("file", new File([archiveBytes], "original.gcode.3mf"));
      const response = await upload(new Request("http://localhost/api/prints", { method: "POST", body: form }));
      const data = await response.json();
      assert.equal(response.status, 201, JSON.stringify(data));
      return data.print.id;
    }
    const retainedId = await uploadOriginal(true);
    assert.deepEqual(await originalArchives.read(retainedId), archiveBytes);
    const downloaded = await download(new Request("http://localhost"), { params: Promise.resolve({ id: retainedId }) });
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), archiveBytes);
    const apiDownload = await send("/prints/" + retainedId + "/download", "GET");
    assert.equal(apiDownload.status, 200);
    assert.deepEqual(Buffer.from(await apiDownload.arrayBuffer()), archiveBytes);
    const discardedId = await uploadOriginal(false);
    assert.equal(await originalArchives.exists(discardedId), false);
    assert.equal(await originalArchives.exists(retainedId), true);
    assert.equal((await download(new Request("http://localhost"), { params: Promise.resolve({ id: retainedId }) })).status, 403);
    assert.equal((await send("/prints/" + retainedId + "/download", "GET")).status, 403);
    const latest = await store.getSettings();
    await store.saveSettings({ ...latest, general: { ...latest.general, retainOriginalArchives: true } });
    assert.equal((await send("/prints/" + discardedId + "/download", "GET")).status, 404);
    assert.equal((await send("/prints/" + retainedId + "/download", "GET")).status, 200);
    await deletePrint(retainedId);
    assert.equal(await originalArchives.exists(retainedId), false);
    await deletePrint(discardedId);
    console.log("SQLite API persistence verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory, env: { ...process.env, AUTH_ENABLED: "false", API_KEYS: "c".repeat(43),
        TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") },
      encoding: "utf8", timeout: 30_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("SQLite API persistence verified"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
