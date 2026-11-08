import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("customer CRUD, order assignment, workflow and persistence use real isolated routes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-customer-routes-"));
  const requireModule = createRequire(import.meta.url);
  const url = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const script = `
    import assert from "node:assert/strict";
    import { randomUUID } from "node:crypto";
    import { NextRequest } from ${JSON.stringify(pathToFileURL(requireModule.resolve("next/server")).href)};
    import * as db from ${url("./db/index.ts")};
    import * as customers from ${url("../app/api/customers/route.ts")};
    import * as customerRoute from ${url("../app/api/customers/[id]/route.ts")};
    import * as orders from ${url("../app/api/orders/route.ts")};
    import * as orderRoute from ${url("../app/api/orders/[id]/route.ts")};
    const request = (method, body) => new NextRequest("http://localhost/api/test", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const input = { name: "Fixture contact", company: "Fixture studio", email: "fixture@example.invalid",
      phone: "1234", billingAddress: "Old billing", shippingAddress: "Shipping", notes: "Notes", archived: false };
    assert.equal((await customers.POST(request("POST", {...input, email: "invalid"}))).status, 400);
    const create = await customers.POST(request("POST", input));
    assert.equal(create.status, 201);
    const customer = (await create.json()).customer;
    const customerCtx = {params: Promise.resolve({id: customer.id})};
    const now = new Date().toISOString();
    const printId = randomUUID();
    await db.insertPrint({id: printId, fileName: "fixture", createdAt: now, plate: {
      totalWeightGrams: 0, totalPrintTimeSeconds: 60, layerCount: 1,
      nozzleDiameterMm: null, printerModelId: null, bedType: null, filaments: [], objects: [],
      categoryTotals: [], categoryByFilament: [], thumbnailBase64: null,
    }});
    const orderInput = {customerName: "Browser label", customerId: customer.id, status: "open",
      dueDate: null, notes: "", items: [{printId, quantity: 2}]};
    const createdOrder = await orders.POST(request("POST", orderInput));
    assert.equal(createdOrder.status, 201);
    let order = (await createdOrder.json()).order;
    assert.equal(order.customerName, "Fixture contact · Fixture studio");
    assert.deepEqual(order.customerSnapshot, customer);
    const orderCtx = {params: Promise.resolve({id: order.id})};
    const edited = await customerRoute.PUT(request("PUT", {
      ...input, billingAddress: "New billing", expectedUpdatedAt: customer.updatedAt,
    }), customerCtx);
    assert.equal(edited.status, 200);
    let currentCustomer = (await edited.json()).customer;
    const stale = await customerRoute.PUT(request("PUT", {...input, expectedUpdatedAt: customer.updatedAt}), customerCtx);
    assert.equal(stale.status, 409);
    const orderEdit = await orderRoute.PUT(request("PUT", {...orderInput, customerName: order.customerName}), orderCtx);
    assert.equal(orderEdit.status, 200);
    order = (await orderEdit.json()).order;
    assert.equal(order.customerSnapshot.billingAddress, "Old billing");
    const workflow = {paymentStatus: "paid", paymentMethod: "Card", paidAmount: 42.5, paymentCurrency: "EUR",
      shippingStatus: "shipped", shippingMethod: "Parcel", trackingNumber: "TEST123"};
    const payment = await orderRoute.PATCH(request("PATCH", {...workflow, expectedUpdatedAt: order.updatedAt}), orderCtx);
    assert.equal(payment.status, 200);
    order = (await payment.json()).order;
    assert.equal(order.paymentStatus, "paid");
    assert.equal(order.trackingNumber, "TEST123");
    assert.ok(order.history.some(entry => entry.type === "payment_updated"));
    assert.ok(order.history.some(entry => entry.type === "shipping_updated"));
    const concurrent = await Promise.all([
      orderRoute.PATCH(request("PATCH", {paymentMethod: "Transfer", expectedUpdatedAt: order.updatedAt}), orderCtx),
      orderRoute.PATCH(request("PATCH", {shippingMethod: "Other parcel", expectedUpdatedAt: order.updatedAt}), orderCtx),
    ]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const conflict = await orderRoute.PATCH(request("PATCH", {shippingStatus: "delivered", expectedUpdatedAt: "2000-01-01T00:00:00Z"}), orderCtx);
    assert.equal(conflict.status, 409);
    const archive = await customerRoute.PUT(request("PUT", {
      ...input, archived: true, expectedUpdatedAt: currentCustomer.updatedAt,
    }), customerCtx);
    assert.equal(archive.status, 200);
    currentCustomer = (await archive.json()).customer;
    assert.equal((await orders.POST(request("POST", orderInput))).status, 400);
    assert.equal((await orderRoute.PUT(request("PUT", orderInput), orderCtx)).status, 200);
    db.resetStoreCache();
    assert.equal((await db.listCustomers())[0].archived, true);
    assert.equal((await db.listOrders())[0].paidAmount, 42.5);
    assert.equal((await db.listOrders())[0].customerSnapshot.billingAddress, "Old billing");
    const snapshot = await db.getApplicationDataSnapshot();
    assert.equal(snapshot.customers.length, 1);
    await db.replaceApplicationData({...snapshot, customers: []});
    assert.equal((await db.listCustomers()).length, 0);
    await db.replaceApplicationData(snapshot);
    assert.deepEqual(await db.listCustomers(), snapshot.customers);
    const restore = await customerRoute.PUT(request("PUT", {
      ...input, archived: false, expectedUpdatedAt: currentCustomer.updatedAt,
    }), customerCtx);
    assert.equal(restore.status, 200);
    console.log("Customer workflow persistence verified");
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
    assert.ok(result.stdout.includes("Customer workflow persistence verified"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
